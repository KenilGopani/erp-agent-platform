import { describe, expect, it } from "vitest";
import {
  CUSTOMERS,
  DRAFT_PURCHASE,
  OPEN_PURCHASES,
  OPEN_SALES,
  PRODUCTS,
  SHORTAGE_SCENARIOS,
  SUPPLIERS,
  moqFor,
  offersFor,
} from "./data";

const skus = new Set(PRODUCTS.map((p) => p.sku));

describe("seed dataset", () => {
  it("has unique skus and sane economics", () => {
    expect(skus.size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(p.price, p.sku).toBeGreaterThan(p.cost);
      expect(p.max, p.sku).toBeGreaterThan(p.min);
    }
  });

  it("references only known skus, customers and suppliers", () => {
    const customers = new Set(CUSTOMERS.map((c) => c.name));
    const suppliers = new Set(SUPPLIERS.map((s) => s.key));
    for (const so of OPEN_SALES) {
      expect(customers.has(so.customer), so.ref).toBe(true);
      so.lines.forEach((l) => expect(skus.has(l.sku), l.sku).toBe(true));
    }
    for (const po of [...OPEN_PURCHASES, DRAFT_PURCHASE]) {
      expect(suppliers.has(po.supplier), po.ref).toBe(true);
      po.lines.forEach((l) => expect(skus.has(l.sku), l.sku).toBe(true));
    }
    Object.keys(SHORTAGE_SCENARIOS).forEach((s) => expect(skus.has(s), s).toBe(true));
  });

  it("gives every product at least one supplier with a positive MOQ", () => {
    for (const p of PRODUCTS) {
      const offers = offersFor(p);
      expect(offers.length, p.sku).toBeGreaterThan(0);
      offers.forEach((o) => expect(moqFor(p, o), p.sku).toBeGreaterThan(0));
    }
  });

  it("matches the planned size", () => {
    expect(PRODUCTS).toHaveLength(50);
    expect(CUSTOMERS).toHaveLength(12);
    expect(SUPPLIERS).toHaveLength(6);
  });

  it("encodes the shortage scenarios in the numbers", () => {
    const by = new Map(PRODUCTS.map((p) => [p.sku, p]));
    const demand = new Map<string, number>();
    for (const so of OPEN_SALES)
      for (const l of so.lines) demand.set(l.sku, (demand.get(l.sku) ?? 0) + l.qty);
    const incoming = new Map<string, number>();
    for (const po of OPEN_PURCHASES)
      for (const l of po.lines) incoming.set(l.sku, (incoming.get(l.sku) ?? 0) + l.qty);

    for (const sku of ["PLT-BASE-300", "AL-SHT-4.0", "FAS-ANC-M10"]) {
      expect(by.get(sku)!.stock - (demand.get(sku) ?? 0), sku).toBeLessThan(0);
    }
    for (const sku of ["STL-TUBE-50", "FAS-NUT-M8"]) {
      const p = by.get(sku)!;
      expect(p.stock, sku).toBeLessThan(p.min);
      expect(
        p.stock + (incoming.get(sku) ?? 0) - (demand.get(sku) ?? 0),
        sku,
      ).toBeGreaterThanOrEqual(p.min);
    }
    for (const sku of [
      "STL-SHT-5.0",
      "STL-BAR-RND-30",
      "FAS-BLT-M8X25",
      "BRK-L-150",
      "SS-SHT-3.0",
    ]) {
      expect(by.get(sku)!.stock, sku).toBeLessThan(by.get(sku)!.min);
      expect(incoming.get(sku) ?? 0, sku).toBe(0);
    }
  });
});
