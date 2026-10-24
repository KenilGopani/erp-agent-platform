import { describe, expect, it } from "vitest";
import { computePrice, mapPricelistRule, roundMoney, type PricelistRule } from "./pricelist";

const rule = (over: Partial<PricelistRule>): PricelistRule => ({
  id: 1,
  scope: "global",
  productId: null,
  productTemplateId: null,
  minQuantity: 0,
  kind: "percentage",
  value: 10,
  dateStart: null,
  dateEnd: null,
  ...over,
});
const base = { listPrice: 58, productId: 9, productTemplateId: 4 };

describe("computePrice", () => {
  it("applies a global percentage rule", () => {
    const r = computePrice({ ...base, quantity: 40, rules: [rule({ value: 15 })] });
    expect(r).toMatchObject({
      unitPrice: 49.3,
      discountPct: 15,
      lineTotal: 1972,
      appliedRuleId: 1,
    });
  });

  it("returns list price when no rule matches", () => {
    const r = computePrice({ ...base, quantity: 1, rules: [rule({ minQuantity: 10 })] });
    expect(r).toMatchObject({ unitPrice: 58, discountPct: 0, appliedRuleId: null });
  });

  it("prefers the highest matching quantity break", () => {
    const rules = [rule({ id: 1, value: 5 }), rule({ id: 2, minQuantity: 1000, value: 8 })];
    expect(computePrice({ ...base, quantity: 999, rules }).appliedRuleId).toBe(1);
    expect(computePrice({ ...base, quantity: 1000, rules }).appliedRuleId).toBe(2);
  });

  it("prefers a more specific scope over a global rule", () => {
    const rules = [
      rule({ id: 1, value: 5 }),
      rule({ id: 2, scope: "product", productTemplateId: 4, value: 12 }),
      rule({ id: 3, scope: "product", productTemplateId: 99, value: 50 }),
    ];
    expect(computePrice({ ...base, quantity: 1, rules }).appliedRuleId).toBe(2);
  });

  it("supports fixed prices and ignores expired rules", () => {
    const fixed = rule({ id: 7, kind: "fixed", value: 40 });
    expect(computePrice({ ...base, quantity: 1, rules: [fixed] }).unitPrice).toBe(40);
    const expired = rule({ id: 8, dateEnd: "2020-01-01 00:00:00" });
    expect(computePrice({ ...base, quantity: 1, rules: [expired] }).appliedRuleId).toBeNull();
  });

  it("rounds money to cents", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
  });
});

describe("mapPricelistRule", () => {
  const raw = {
    id: 3,
    applied_on: "3_global",
    compute_price: "percentage",
    percent_price: 10,
    fixed_price: 0,
    min_quantity: 0,
    product_id: false,
    product_tmpl_id: false,
    date_start: false,
    date_end: false,
  };

  it("maps a global percentage rule", () => {
    expect(mapPricelistRule(raw)).toMatchObject({ scope: "global", kind: "percentage", value: 10 });
  });

  it("fails loudly on rules it cannot evaluate", () => {
    expect(() => mapPricelistRule({ ...raw, compute_price: "formula" })).toThrow(/Unsupported/);
    expect(() => mapPricelistRule({ ...raw, applied_on: "2_product_category" })).toThrow(
      /Unsupported/,
    );
  });
});
