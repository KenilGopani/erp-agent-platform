/**
 * Prints a SHA-256 digest of the seeded baseline (catalog, stock, prices,
 * order lines). Dates and database ids are excluded so two resets of the
 * same seed must print the same digest.
 *
 *   pnpm baseline:digest
 */
import { createHash } from "node:crypto";
import { OdooClient } from "../src/lib/odoo/client";
import { parseEnv } from "../src/lib/env";

const env = parseEnv(process.env);
const odoo = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});

type M2O = [number, string] | false;
const name = (v: M2O) => (v ? v[1] : null);

async function main() {
  const products = await odoo.searchRead<Record<string, unknown>>(
    "product.product",
    [["default_code", "!=", false]],
    {
      fields: [
        "default_code",
        "list_price",
        "standard_price",
        "qty_available",
        "virtual_available",
      ],
      order: "default_code",
    },
  );
  const supplierInfo = (
    await odoo.searchRead<{
      partner_id: M2O;
      product_tmpl_id: M2O;
      price: number;
      min_qty: number;
      delay: number;
    }>("product.supplierinfo", [], {
      fields: ["partner_id", "product_tmpl_id", "price", "min_qty", "delay"],
    })
  )
    .map((s) =>
      [name(s.partner_id), name(s.product_tmpl_id), s.price, s.min_qty, s.delay].join("|"),
    )
    .sort();

  const orderLines = async (
    model: string,
    lineModel: string,
    refField: string,
    qtyField: string,
  ) => {
    const orders = await odoo.searchRead<
      { id: number; name: string; state: string; amount_total: number } & Record<string, unknown>
    >(model, [], { fields: ["name", "state", "amount_total", refField], order: "name" });
    const lines = await odoo.searchRead<
      { order_id: M2O; product_id: M2O; price_unit: number } & Record<string, number>
    >(lineModel, [], { fields: ["order_id", "product_id", qtyField, "price_unit"] });
    return orders.map((o) => ({
      ref: o[refField],
      state: o.state,
      total: o.amount_total,
      lines: lines
        .filter((l) => l.order_id && l.order_id[0] === o.id)
        .map((l) => [name(l.product_id), l[qtyField], l.price_unit].join("|"))
        .sort(),
    }));
  };

  const snapshot = {
    products,
    supplierInfo,
    sales: await orderLines("sale.order", "sale.order.line", "client_order_ref", "product_uom_qty"),
    purchases: await orderLines(
      "purchase.order",
      "purchase.order.line",
      "partner_ref",
      "product_qty",
    ),
  };
  const digest = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  console.log(
    `products=${products.length} supplierInfo=${supplierInfo.length} sales=${snapshot.sales.length} purchases=${snapshot.purchases.length}`,
  );
  console.log(`digest=${digest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
