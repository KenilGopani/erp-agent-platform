import { afterAll, describe, expect, it } from "vitest";
import type { PurchaseProposal, QuotationProposal } from "../../agents/proposals";
import { parseEnv } from "../../env";
import { OdooClient } from "../../odoo/client";
import { OdooRepository } from "../../odoo/repository";
import { createDraftPurchaseOrder, createDraftQuotation } from "./drafts";

const env = parseEnv(process.env);
const client = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});
const repo = new OdooRepository(client);
const created: { model: string; id: number }[] = [];

// Draft records are deleted afterwards so the seeded baseline stays pristine.
afterAll(async () => {
  for (const { model, id } of created) {
    if (model === "purchase.order") await client.executeKw(model, "button_cancel", [[id]]);
    await client.executeKw(model, "unlink", [[id]]);
  }
});

describe("draft writers (live odoo)", () => {
  it("creates a draft quotation once per idempotency key, keeping the approved price", async () => {
    const [customer] = await repo.findCustomers("Ironbridge");
    const [product] = await repo.findProducts({ sku: "PLT-BASE-300" });
    const proposal = {
      kind: "quotation",
      customer: { id: customer!.id, name: customer!.name, paymentTerms: null, pricelist: null },
      lines: [
        {
          productId: product!.id,
          sku: "PLT-BASE-300",
          name: product!.name,
          uom: "Units",
          quantity: 7,
          listPrice: 58,
          unitPrice: 49.3,
          discountPct: 15,
          lineTotal: 345.1,
          availableQty: 0,
          fulfillment: "out_of_stock",
          estimatedLeadTimeDays: 21,
          note: null,
        },
      ],
      total: 345.1,
      currency: "USD",
      summary: "test",
      assumptions: [],
      openQuestions: [],
      confidence: "high",
      flags: [],
    } satisfies QuotationProposal;

    const key = `TEST-${Date.now()}-Q`;
    const first = await createDraftQuotation(client, proposal, key);
    created.push({ model: "sale.order", id: first.odooId });
    const second = await createDraftQuotation(client, proposal, key);
    expect(first.created).toBe(true);
    expect(second).toEqual({ ...first, created: false });

    const [order] = await client.read<{ state: string; amount_untaxed: number }>(
      "sale.order",
      [first.odooId],
      ["state", "amount_untaxed"],
    );
    expect(order).toMatchObject({ state: "draft", amount_untaxed: 345.1 });
  });

  it("creates a draft purchase order with the proposal's price and never confirms it", async () => {
    const [product] = await repo.findProducts({ sku: "STL-SHT-5.0" });
    const [price] = (await repo.getSupplierPrices(product!.id)).filter((s) =>
      s.supplierName.startsWith("Midwest"),
    );
    const proposal = {
      kind: "purchase_order",
      supplier: { id: price!.supplierId, name: price!.supplierName },
      lines: [
        {
          productId: product!.id,
          sku: "STL-SHT-5.0",
          name: product!.name,
          uom: "Units",
          quantity: 66,
          unitPrice: 150,
          lineTotal: 9900,
          moq: price!.minQty,
          leadTimeDays: 7,
          expectedArrival: "2026-02-01",
          forecastedBefore: 14,
          reorderPoint: 20,
          reason: "test",
        },
      ],
      total: 9900,
      currency: "USD",
      expectedDelivery: "2026-02-01",
      summary: "test",
      flags: [],
    } satisfies PurchaseProposal;

    const key = `TEST-${Date.now()}-P`;
    const first = await createDraftPurchaseOrder(client, proposal, key);
    created.push({ model: "purchase.order", id: first.odooId });
    expect((await createDraftPurchaseOrder(client, proposal, key)).created).toBe(false);

    const [order] = await client.read<{ state: string; amount_untaxed: number }>(
      "purchase.order",
      [first.odooId],
      ["state", "amount_untaxed"],
    );
    expect(order).toMatchObject({ state: "draft", amount_untaxed: 9900 });
  });
});
