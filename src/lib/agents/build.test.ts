import { describe, expect, it } from "vitest";
import { buildPurchaseProposal } from "./procurement/build";
import { buildQuotation, type QuotingRepo } from "./quoting/build";
import type { ProcurementRepo } from "./procurement/build";
import type { PricelistRule } from "../pricing/pricelist";

const NOW = new Date("2026-01-10T00:00:00Z");
const product = (id: number, sku: string, listPrice: number, cost = 1) => ({
  id,
  templateId: id * 10,
  sku,
  name: sku,
  uom: "Units",
  listPrice,
  cost,
  isStorable: true,
});
const level = (productId: number, over: Record<string, unknown> = {}) => ({
  productId,
  onHand: 0,
  reserved: 0,
  available: 0,
  forecasted: 0,
  incoming: 0,
  outgoing: 0,
  reorderPoint: null,
  reorderMax: null,
  ...over,
});
const goldRule: PricelistRule = {
  id: 1,
  scope: "global",
  productId: null,
  productTemplateId: null,
  minQuantity: 0,
  kind: "percentage",
  value: 10,
  dateStart: null,
  dateEnd: null,
};

const PRODUCTS = new Map([
  [1, product(1, "BRK", 100)],
  [2, product(2, "FLG", 50)],
]);
const quotingRepo = (stock: Record<number, number>): QuotingRepo =>
  ({
    getCustomer: async (id: number) =>
      id === 7
        ? {
            id: 7,
            name: "Acme",
            email: null,
            paymentTerms: "30 Days",
            pricelistId: 3,
            pricelist: "Gold (USD)",
          }
        : null,
    getProduct: async (id: number) => PRODUCTS.get(id) ?? null,
    getStockLevels: async (ids: number[]) =>
      ids.map((id) => level(id, { available: stock[id] ?? 0 })),
    getPricelistRules: async () => [goldRule],
    getHistoricalAvgPrice: async () => null,
    getSupplierPrices: async () => [
      {
        id: 1,
        supplierId: 5,
        supplierName: "S",
        productId: null,
        productTemplateId: 1,
        unitPrice: 1,
        minQty: 1,
        leadTimeDays: 14,
        supplierProductCode: null,
      },
    ],
  }) as unknown as QuotingRepo;

describe("buildQuotation", () => {
  it("prices lines from the tier and computes totals in code", async () => {
    const r = await buildQuotation(
      {
        outcome: "propose",
        customerId: 7,
        lines: [
          { productId: 1, quantity: 10 },
          { productId: 2, quantity: 4 },
        ],
      },
      { repo: quotingRepo({ 1: 100, 2: 100 }), now: () => NOW },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.lines[0]).toMatchObject({
      unitPrice: 90,
      discountPct: 10,
      lineTotal: 900,
      fulfillment: "in_stock",
    });
    expect(r.proposal.total).toBe(900 + 180);
  });

  it("flags partial and missing stock with a lead time but still proposes", async () => {
    const r = await buildQuotation(
      {
        outcome: "propose",
        customerId: 7,
        lines: [
          { productId: 1, quantity: 10 },
          { productId: 2, quantity: 4 },
        ],
      },
      { repo: quotingRepo({ 1: 6 }), now: () => NOW },
    );
    expect(r.ok && r.proposal.lines.map((l) => [l.fulfillment, l.estimatedLeadTimeDays])).toEqual([
      ["partial_stock", 14],
      ["out_of_stock", 14],
    ]);
    expect(r.ok && r.proposal.flags.filter((f) => f.code === "insufficient_stock")).toHaveLength(2);
  });

  it("applies an explicit extra discount on top of the tier", async () => {
    const r = await buildQuotation(
      {
        outcome: "propose",
        customerId: 7,
        lines: [{ productId: 1, quantity: 1, extraDiscountPct: 10 }],
      },
      { repo: quotingRepo({ 1: 5 }), now: () => NOW },
    );
    expect(r.ok && r.proposal.lines[0]).toMatchObject({ unitPrice: 81, discountPct: 19 });
  });

  it.each([
    [{ outcome: "propose" as const, lines: [{ productId: 1, quantity: 1 }] }, "missing_customer"],
    [
      { outcome: "propose" as const, customerId: 99, lines: [{ productId: 1, quantity: 1 }] },
      "customer_not_found",
    ],
    [{ outcome: "propose" as const, customerId: 7, lines: [] }, "no_lines"],
    [
      { outcome: "propose" as const, customerId: 7, lines: [{ productId: 404, quantity: 1 }] },
      "product_not_found",
    ],
    [
      { outcome: "propose" as const, customerId: 7, lines: [{ productId: 1, quantity: 0 }] },
      "non_positive_quantity",
    ],
    [
      {
        outcome: "propose" as const,
        customerId: 7,
        lines: [
          { productId: 1, quantity: 1 },
          { productId: 1, quantity: 2 },
        ],
      },
      "duplicate_product",
    ],
  ])("rejects invalid submissions (%#)", async (submission, code) => {
    const r = await buildQuotation(submission, { repo: quotingRepo({}), now: () => NOW });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.violations.map((v) => v.code)).toContain(code);
  });
});

const procurementRepo = (forecast: number): ProcurementRepo =>
  ({
    getSupplierName: async (id: number) => (id === 5 ? "Midwest" : null),
    getProduct: async (id: number) => PRODUCTS.get(id) ?? null,
    getStockLevels: async (ids: number[]) =>
      ids.map((id) => level(id, { forecasted: forecast, reorderPoint: 40, reorderMax: 100 })),
    getSupplierPrices: async () => [
      {
        id: 1,
        supplierId: 5,
        supplierName: "Midwest",
        productId: null,
        productTemplateId: 10,
        unitPrice: 2.5,
        minQty: 20,
        leadTimeDays: 7,
        supplierProductCode: null,
      },
    ],
  }) as unknown as ProcurementRepo;

describe("buildPurchaseProposal", () => {
  const order = (quantity: number, supplierId = 5) => ({
    supplierId,
    lines: [{ productId: 1, quantity, reason: "restock" }],
  });

  it("uses supplier price and lead time from Odoo, not from the model", async () => {
    const r = await buildPurchaseProposal(order(60), { repo: procurementRepo(10), now: () => NOW });
    expect(r.ok && r.proposal).toMatchObject({
      supplier: { id: 5, name: "Midwest" },
      total: 150,
      expectedDelivery: "2026-01-17",
    });
    expect(r.ok && r.proposal.lines[0]).toMatchObject({
      unitPrice: 2.5,
      moq: 20,
      forecastedBefore: 10,
    });
  });

  it("blocks quantities below the MOQ", async () => {
    const r = await buildPurchaseProposal(order(10), { repo: procurementRepo(10), now: () => NOW });
    expect(!r.ok && r.violations.map((v) => v.code)).toEqual(["below_moq"]);
  });

  it("blocks re-ordering a product that is already covered", async () => {
    const r = await buildPurchaseProposal(order(60), { repo: procurementRepo(60), now: () => NOW });
    expect(!r.ok && r.violations.map((v) => v.code)).toEqual(["no_shortage"]);
  });

  it("blocks unknown suppliers", async () => {
    const r = await buildPurchaseProposal(order(60, 9), {
      repo: procurementRepo(10),
      now: () => NOW,
    });
    expect(!r.ok && r.violations.map((v) => v.code)).toEqual(["supplier_not_found"]);
  });
});
