/**
 * Idempotent seed for the fictional manufacturer. Safe to run repeatedly:
 * every record is looked up by a natural key (SKU, name, order reference)
 * and only created when missing. Use scripts/reset-odoo.sh for a clean slate.
 *
 *   pnpm seed
 */
import { OdooClient } from "../src/lib/odoo/client";
import { parseEnv } from "../src/lib/env";
import {
  CUSTOMERS,
  DRAFT_PURCHASE,
  OPEN_PURCHASES,
  OPEN_SALES,
  PRODUCTS,
  SUPPLIERS,
  TIER_DISCOUNT,
  VOLUME_BREAK_QTY,
  VOLUME_EXTRA_PCT,
  moqFor,
  offerPrice,
  offersFor,
  type OpenPurchase,
  type SeedProduct,
  type Tier,
} from "./seed/data";
import { makeRng } from "./seed/rng";

const HISTORICAL_SALES = 24;
const HISTORICAL_PURCHASES = 11;
const PRELOAD = 100_000;

const env = parseEnv(process.env);
const odoo = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});

const log = (msg: string) => console.log(`[seed] ${msg}`);
const DAY_MS = 86_400_000;
const odooDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const daysFromNow = (n: number) => odooDate(new Date(Date.now() + n * DAY_MS));

async function findId(model: string, domain: [string, string, unknown][]): Promise<number | null> {
  const rows = await odoo.searchRead<{ id: number }>(model, domain, { fields: ["id"], limit: 1 });
  return rows[0]?.id ?? null;
}

async function ensure(
  model: string,
  domain: [string, string, unknown][],
  values: Record<string, unknown>,
): Promise<{ id: number; created: boolean }> {
  const existing = await findId(model, domain);
  if (existing !== null) return { id: existing, created: false };
  return { id: await odoo.create(model, values), created: true };
}

// --- reference lookups ------------------------------------------------------

async function lookups() {
  const uoms = await odoo.searchRead<{ id: number; name: string }>("uom.uom", [], {
    fields: ["name"],
  });
  const uom = (name: string) => {
    const hit = uoms.find((u) => u.name === name);
    if (!hit) throw new Error(`UoM not found: ${name}`);
    return hit.id;
  };
  const terms = await odoo.searchRead<{ id: number; name: string }>("account.payment.term", [], {
    fields: ["name"],
  });
  const term = (name: string) => {
    const hit = terms.find((t) => t.name === name);
    if (!hit) throw new Error(`Payment term not found: ${name}`);
    return hit.id;
  };
  const [wh] = await odoo.searchRead<{ lot_stock_id: [number, string] }>("stock.warehouse", [], {
    fields: ["lot_stock_id"],
    limit: 1,
  });
  return { uom, term, stockLocationId: wh!.lot_stock_id[0] };
}

type Ctx = Awaited<ReturnType<typeof lookups>> & {
  pricelists: Map<Tier, number>;
  suppliers: Map<string, number>;
  customers: Map<string, number>;
  products: Map<string, number>;
};

// --- steps ------------------------------------------------------------------

async function enablePricelists() {
  const settingsId = await odoo.create("res.config.settings", { group_product_pricelist: true });
  await odoo.executeKw("res.config.settings", "execute", [[settingsId]]);
}

async function seedPricelists(): Promise<Map<Tier, number>> {
  const out = new Map<Tier, number>();
  for (const tier of Object.keys(TIER_DISCOUNT) as Tier[]) {
    const { id, created } = await ensure("product.pricelist", [["name", "=", tier]], {
      name: tier,
    });
    out.set(tier, id);
    if (created) {
      const base = TIER_DISCOUNT[tier];
      const item = (extra: Record<string, unknown>, pct: number) => ({
        pricelist_id: id,
        applied_on: "3_global",
        compute_price: "percentage",
        percent_price: pct,
        ...extra,
      });
      await odoo.create("product.pricelist.item", item({}, base));
      await odoo.create(
        "product.pricelist.item",
        item({ min_quantity: VOLUME_BREAK_QTY }, base + VOLUME_EXTRA_PCT),
      );
    }
  }
  log(`pricelists: ${[...out.keys()].join(", ")}`);
  return out;
}

async function seedPartners(ctx: Ctx) {
  for (const s of SUPPLIERS) {
    const { id } = await ensure("res.partner", [["name", "=", s.name]], {
      name: s.name,
      email: s.email,
      is_company: true,
      supplier_rank: 1,
      property_supplier_payment_term_id: ctx.term(s.terms),
    });
    ctx.suppliers.set(s.key, id);
  }
  for (const c of CUSTOMERS) {
    const { id } = await ensure("res.partner", [["name", "=", c.name]], {
      name: c.name,
      email: c.email,
      is_company: true,
      customer_rank: 1,
      property_payment_term_id: ctx.term(c.terms),
      property_product_pricelist: ctx.pricelists.get(c.tier),
    });
    ctx.customers.set(c.name, id);
  }
  log(`partners: ${ctx.suppliers.size} suppliers, ${ctx.customers.size} customers`);
}

async function seedProducts(ctx: Ctx) {
  let created = 0;
  for (const p of PRODUCTS) {
    const uom = ctx.uom(p.uom);
    const r = await ensure("product.product", [["default_code", "=", p.sku]], {
      default_code: p.sku,
      name: p.name,
      type: "consu",
      is_storable: true,
      uom_id: uom,
      uom_po_id: uom,
      list_price: p.price,
      standard_price: p.cost,
      sale_ok: true,
      purchase_ok: true,
    });
    ctx.products.set(p.sku, r.id);
    if (r.created) created++;
  }
  log(`products: ${ctx.products.size} (${created} created)`);
}

async function seedSupplierInfo(ctx: Ctx) {
  let n = 0;
  for (const p of PRODUCTS) {
    const productId = ctx.products.get(p.sku)!;
    const [{ product_tmpl_id }] = await odoo.read<{ product_tmpl_id: [number, string] }>(
      "product.product",
      [productId],
      ["product_tmpl_id"],
    );
    for (const offer of offersFor(p)) {
      const partnerId = ctx.suppliers.get(offer.supplier)!;
      await ensure(
        "product.supplierinfo",
        [
          ["partner_id", "=", partnerId],
          ["product_tmpl_id", "=", product_tmpl_id[0]],
        ],
        {
          partner_id: partnerId,
          product_tmpl_id: product_tmpl_id[0],
          price: offerPrice(p, offer),
          min_qty: moqFor(p, offer),
          delay: offer.leadDays,
        },
      );
      n++;
    }
  }
  log(`supplier prices: ${n}`);
}

async function seedOrderpoints(ctx: Ctx) {
  for (const p of PRODUCTS) {
    await ensure("stock.warehouse.orderpoint", [["product_id", "=", ctx.products.get(p.sku)!]], {
      product_id: ctx.products.get(p.sku),
      location_id: ctx.stockLocationId,
      product_min_qty: p.min,
      product_max_qty: p.max,
      trigger: "manual",
    });
  }
  log(`reorder rules: ${PRODUCTS.length}`);
}

/** Sets on-hand stock to an absolute quantity per product via inventory adjustment. */
async function setStock(ctx: Ctx, qtyFor: (p: SeedProduct) => number) {
  const quantIds: number[] = [];
  for (const p of PRODUCTS) {
    const productId = ctx.products.get(p.sku)!;
    const context = { inventory_mode: true };
    const existing = await findId("stock.quant", [
      ["product_id", "=", productId],
      ["location_id", "=", ctx.stockLocationId],
    ]);
    if (existing !== null) {
      await odoo.executeKw(
        "stock.quant",
        "write",
        [[existing], { inventory_quantity: qtyFor(p) }],
        { context },
      );
      quantIds.push(existing);
    } else {
      quantIds.push(
        await odoo.create(
          "stock.quant",
          {
            product_id: productId,
            location_id: ctx.stockLocationId,
            inventory_quantity: qtyFor(p),
          },
          context,
        ),
      );
    }
  }
  await odoo.executeKw("stock.quant", "action_apply_inventory", [quantIds], {
    context: { inventory_mode: true },
  });
}

async function validatePickings(model: "sale.order" | "purchase.order", orderId: number) {
  const [{ picking_ids }] = await odoo.read<{ picking_ids: number[] }>(
    model,
    [orderId],
    ["picking_ids"],
  );
  for (const pid of picking_ids) {
    const moves = await odoo.searchRead<{ id: number; product_uom_qty: number }>(
      "stock.move",
      [["picking_id", "=", pid]],
      { fields: ["product_uom_qty"] },
    );
    for (const m of moves) await odoo.write("stock.move", [m.id], { quantity: m.product_uom_qty });
    const res = await odoo.executeKw<unknown>("stock.picking", "button_validate", [[pid]], {
      context: { skip_backorder: true, skip_immediate: true, skip_sms: true },
    });
    if (res && typeof res === "object") {
      throw new Error(`picking ${pid} needs a wizard: ${JSON.stringify(res).slice(0, 200)}`);
    }
  }
}

const saleLines = (ctx: Ctx, lines: { sku: string; qty: number }[]) =>
  lines.map((l) => [0, 0, { product_id: ctx.products.get(l.sku), product_uom_qty: l.qty }]);

async function seedHistoricalSales(ctx: Ctx) {
  const rng = makeRng(20240601);
  const sellable = PRODUCTS.filter((p) => p.category !== "raw");
  const customers = CUSTOMERS.map((c) => c.name);
  let created = 0;
  for (let i = 1; i <= HISTORICAL_SALES; i++) {
    const ref = `SEED-SO-HIST-${String(i).padStart(2, "0")}`;
    // Draw first so the sequence is identical whether or not the order already exists.
    const customer = rng.pick(customers);
    const lineCount = rng.int(1, 3);
    const lines: { sku: string; qty: number }[] = [];
    for (let l = 0; l < lineCount; l++) {
      const p = rng.pick(sellable);
      if (lines.some((x) => x.sku === p.sku)) continue;
      const big = p.category === "fastener";
      lines.push({ sku: p.sku, qty: big ? rng.int(2, 20) * 100 : rng.int(2, 24) * 5 });
    }
    const ageDays = rng.int(10, 170);
    if (await findId("sale.order", [["client_order_ref", "=", ref]])) continue;

    const id = await odoo.create("sale.order", {
      partner_id: ctx.customers.get(customer),
      client_order_ref: ref,
      order_line: saleLines(ctx, lines),
    });
    await odoo.executeKw("sale.order", "action_confirm", [[id]]);
    await validatePickings("sale.order", id);
    await odoo.write("sale.order", [id], { date_order: daysFromNow(-ageDays) });
    created++;
  }
  log(`historical sales orders: ${HISTORICAL_SALES} (${created} created)`);
}

async function seedPurchase(
  ctx: Ctx,
  po: OpenPurchase,
  opts: { confirm: boolean; receive: boolean; ageDays?: number },
) {
  if (await findId("purchase.order", [["partner_ref", "=", po.ref]])) return false;
  const id = await odoo.create("purchase.order", {
    partner_id: ctx.suppliers.get(po.supplier),
    partner_ref: po.ref,
    date_planned: daysFromNow(po.daysUntilArrival),
    order_line: po.lines.map((l) => [
      0,
      0,
      {
        product_id: ctx.products.get(l.sku),
        product_qty: l.qty,
        date_planned: daysFromNow(po.daysUntilArrival),
      },
    ]),
  });
  if (opts.confirm) await odoo.executeKw("purchase.order", "button_confirm", [[id]]);
  if (opts.receive) await validatePickings("purchase.order", id);
  if (opts.ageDays !== undefined)
    await odoo.write("purchase.order", [id], { date_order: daysFromNow(-opts.ageDays) });
  return true;
}

async function seedHistoricalPurchases(ctx: Ctx) {
  const rng = makeRng(20240602);
  const supplierKeys = SUPPLIERS.map((s) => s.key);
  let created = 0;
  for (let i = 1; i <= HISTORICAL_PURCHASES; i++) {
    const supplier = rng.pick(supplierKeys);
    const offered = PRODUCTS.filter((p) => offersFor(p).some((o) => o.supplier === supplier));
    const lines: { sku: string; qty: number }[] = [];
    const lineCount = rng.int(1, 3);
    for (let l = 0; l < lineCount; l++) {
      const p = rng.pick(offered);
      if (lines.some((x) => x.sku === p.sku)) continue;
      const offer = offersFor(p).find((o) => o.supplier === supplier)!;
      lines.push({ sku: p.sku, qty: moqFor(p, offer) * rng.int(1, 3) });
    }
    const ageDays = rng.int(20, 170);
    const ok = await seedPurchase(
      ctx,
      {
        ref: `SEED-PO-HIST-${String(i).padStart(2, "0")}`,
        supplier,
        daysUntilArrival: -ageDays + 10,
        lines,
      },
      { confirm: true, receive: true, ageDays },
    );
    if (ok) created++;
  }
  log(`historical purchase orders: ${HISTORICAL_PURCHASES} (${created} created)`);
}

async function seedOpenOrders(ctx: Ctx) {
  let sales = 0;
  for (const so of OPEN_SALES) {
    if (await findId("sale.order", [["client_order_ref", "=", so.ref]])) continue;
    const id = await odoo.create("sale.order", {
      partner_id: ctx.customers.get(so.customer),
      client_order_ref: so.ref,
      commitment_date: daysFromNow(so.daysUntilDelivery),
      order_line: saleLines(ctx, so.lines),
    });
    await odoo.executeKw("sale.order", "action_confirm", [[id]]);
    sales++;
  }
  // Draft customer quotations: must never count as demand.
  const drafts = [
    {
      ref: "SEED-SO-DRAFT-1",
      customer: "Redwood Industrial Equipment",
      lines: [{ sku: "BRK-L-100", qty: 40 }],
    },
    {
      ref: "SEED-SO-DRAFT-2",
      customer: "Prairie Agri-Tech",
      lines: [{ sku: "FLG-DN50", qty: 25 }],
    },
  ];
  for (const d of drafts) {
    await ensure("sale.order", [["client_order_ref", "=", d.ref]], {
      partner_id: ctx.customers.get(d.customer),
      client_order_ref: d.ref,
      order_line: saleLines(ctx, d.lines),
    });
  }

  let purchases = 0;
  for (const po of OPEN_PURCHASES) {
    if (await seedPurchase(ctx, po, { confirm: true, receive: false })) purchases++;
  }
  await seedPurchase(ctx, DRAFT_PURCHASE, { confirm: false, receive: false });
  log(
    `open sales orders: ${OPEN_SALES.length} (${sales} created), open purchase orders: ${OPEN_PURCHASES.length} (${purchases} created)`,
  );
}

async function main() {
  log(`connecting to ${env.ODOO_URL} (db ${env.ODOO_DB}), odoo ${await odoo.version()}`);
  await odoo.authenticate();
  const base = await lookups();
  const ctx: Ctx = {
    ...base,
    pricelists: new Map(),
    suppliers: new Map(),
    customers: new Map(),
    products: new Map(),
  };

  if (!(await findId("product.pricelist", [["name", "=", "Standard"]]))) await enablePricelists();
  ctx.pricelists = await seedPricelists();
  await seedPartners(ctx);
  await seedProducts(ctx);
  await seedSupplierInfo(ctx);
  await seedOrderpoints(ctx);

  // Plenty of stock so historical deliveries can be validated, then the real baseline.
  await setStock(ctx, (p) => p.stock + PRELOAD);
  await seedHistoricalSales(ctx);
  await seedHistoricalPurchases(ctx);
  await setStock(ctx, (p) => p.stock);
  await seedOpenOrders(ctx);
  log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
