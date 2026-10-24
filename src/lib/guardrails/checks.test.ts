import { describe, expect, it } from "vitest";
import {
  assertAllowedFields,
  checkDiscount,
  checkLineCount,
  checkNoDuplicateProducts,
  checkOrderValue,
  checkPriceSanity,
  checkPurchaseQuantity,
  checkQuantity,
  hasBlocking,
} from "./checks";

const codes = (v: { code: string }[]) => v.map((x) => x.code);

describe("guardrails", () => {
  it("rejects empty and oversized line lists", () => {
    expect(codes(checkLineCount(0))).toEqual(["no_lines"]);
    expect(codes(checkLineCount(21))).toEqual(["too_many_lines"]);
    expect(checkLineCount(3)).toEqual([]);
  });

  it("validates quantities", () => {
    expect(codes(checkQuantity(0, "Units", "q"))).toEqual(["non_positive_quantity"]);
    expect(codes(checkQuantity(-5, "m", "q"))).toEqual(["non_positive_quantity"]);
    expect(codes(checkQuantity(Number.NaN, "m", "q"))).toEqual(["non_positive_quantity"]);
    expect(codes(checkQuantity(2.5, "Units", "q"))).toEqual(["fractional_units"]);
    expect(checkQuantity(2.5, "m", "q")).toEqual([]);
    expect(codes(checkQuantity(100_000, "Units", "q"))).toEqual(["quantity_over_limit"]);
  });

  it("enforces the discount limit at the boundary", () => {
    expect(checkDiscount(20, "d")).toEqual([]);
    expect(codes(checkDiscount(20.5, "d"))).toEqual(["discount_over_limit"]);
  });

  it("checks price sanity against margin floor, list price and history", () => {
    const base = { listPrice: 100, cost: 60 };
    expect(checkPriceSanity({ ...base, unitPrice: 80 }, "p")).toEqual([]);
    expect(codes(checkPriceSanity({ ...base, unitPrice: 62 }, "p"))).toEqual([
      "price_below_margin_floor",
    ]);
    expect(codes(checkPriceSanity({ ...base, unitPrice: 101 }, "p"))).toEqual(["price_above_list"]);
    const w = checkPriceSanity({ ...base, unitPrice: 70, historicalAvgPrice: 110 }, "p");
    expect(codes(w)).toEqual(["price_deviates_from_history"]);
    expect(hasBlocking(w)).toBe(false);
  });

  it("limits order value", () => {
    expect(checkOrderValue(100, 100, "Quotation")).toEqual([]);
    expect(codes(checkOrderValue(100.01, 100, "Quotation"))).toEqual(["order_value_over_limit"]);
  });

  it("detects duplicate products", () => {
    expect(codes(checkNoDuplicateProducts([1, 2, 1]))).toEqual(["duplicate_product"]);
  });

  it("checks purchase quantity against MOQ and the reorder maximum", () => {
    expect(codes(checkPurchaseQuantity({ quantity: 10, moq: 20, reorderMax: 100 }, "q"))).toEqual([
      "below_moq",
    ]);
    expect(codes(checkPurchaseQuantity({ quantity: 200, moq: 20, reorderMax: 100 }, "q"))).toEqual([
      "purchase_over_max",
    ]);
    expect(checkPurchaseQuantity({ quantity: 150, moq: 20, reorderMax: 100 }, "q")).toEqual([]);
    // an MOQ larger than the cap must still be orderable
    expect(checkPurchaseQuantity({ quantity: 500, moq: 500, reorderMax: 100 }, "q")).toEqual([]);
  });

  it("only allows whitelisted write fields", () => {
    expect(() =>
      assertAllowedFields("sale.order", { partner_id: 1, order_line: [] }),
    ).not.toThrow();
    expect(() => assertAllowedFields("sale.order", { partner_id: 1, state: "sale" })).toThrow(
      /state/,
    );
    expect(() => assertAllowedFields("purchase.order", { button_confirm: true })).toThrow();
  });
});
