export interface Limits {
  maxLines: number;
  maxLineQuantity: number;
  /** Total discount off list price, including the customer's tier. */
  maxDiscountPct: number;
  /** Unit price may not fall below cost * (1 + minMarginPct/100). */
  minMarginPct: number;
  /** Warn when a price deviates from the historical average by more than this. */
  historicalDeviationPct: number;
  maxQuotationValue: number;
  maxPurchaseValue: number;
  /** Purchases may not exceed this multiple of the product's reorder max. */
  maxPurchaseOverMaxFactor: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxLines: 20,
  maxLineQuantity: 50_000,
  maxDiscountPct: 20,
  minMarginPct: 5,
  historicalDeviationPct: 30,
  maxQuotationValue: 250_000,
  maxPurchaseValue: 100_000,
  maxPurchaseOverMaxFactor: 1.5,
};
