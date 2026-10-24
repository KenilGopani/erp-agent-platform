import { DEFAULT_LIMITS, type Limits } from "./limits";

export type Severity = "block" | "warn";

/** A structured guardrail result. `block` stops the proposal; `warn` is shown to the human. */
export interface Violation {
  code: string;
  severity: Severity;
  message: string;
  /** Which part of the proposal it concerns, e.g. "lines[2].quantity". */
  path?: string;
}

const block = (code: string, message: string, path?: string): Violation => ({
  code,
  severity: "block",
  message,
  path,
});
const warn = (code: string, message: string, path?: string): Violation => ({
  code,
  severity: "warn",
  message,
  path,
});

export const hasBlocking = (violations: Violation[]) =>
  violations.some((v) => v.severity === "block");

export function checkLineCount(count: number, limits: Limits = DEFAULT_LIMITS): Violation[] {
  if (count === 0) return [block("no_lines", "A proposal needs at least one line.", "lines")];
  if (count > limits.maxLines) {
    return [
      block(
        "too_many_lines",
        `At most ${limits.maxLines} lines are allowed, got ${count}.`,
        "lines",
      ),
    ];
  }
  return [];
}

export function checkQuantity(
  quantity: number,
  uom: string,
  path: string,
  limits: Limits = DEFAULT_LIMITS,
): Violation[] {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return [
      block("non_positive_quantity", `Quantity must be greater than zero, got ${quantity}.`, path),
    ];
  }
  const out: Violation[] = [];
  if (uom === "Units" && !Number.isInteger(quantity)) {
    out.push(
      block(
        "fractional_units",
        `Quantity must be a whole number for unit "${uom}", got ${quantity}.`,
        path,
      ),
    );
  }
  if (quantity > limits.maxLineQuantity) {
    out.push(
      block(
        "quantity_over_limit",
        `Quantity ${quantity} exceeds the per-line limit of ${limits.maxLineQuantity}. Ask for clarification instead of guessing.`,
        path,
      ),
    );
  }
  return out;
}

export function checkDiscount(
  effectiveDiscountPct: number,
  path: string,
  limits: Limits = DEFAULT_LIMITS,
): Violation[] {
  if (effectiveDiscountPct > limits.maxDiscountPct + 1e-9) {
    return [
      block(
        "discount_over_limit",
        `Total discount ${round(effectiveDiscountPct)}% off list exceeds the ${limits.maxDiscountPct}% limit.`,
        path,
      ),
    ];
  }
  return [];
}

export function checkPriceSanity(
  input: { unitPrice: number; listPrice: number; cost: number; historicalAvgPrice?: number | null },
  path: string,
  limits: Limits = DEFAULT_LIMITS,
): Violation[] {
  const out: Violation[] = [];
  const floor = input.cost * (1 + limits.minMarginPct / 100);
  if (input.unitPrice + 1e-9 < floor) {
    out.push(
      block(
        "price_below_margin_floor",
        `Unit price ${input.unitPrice} is below the minimum ${round(floor)} (cost plus ${limits.minMarginPct}% margin).`,
        path,
      ),
    );
  }
  if (input.unitPrice > input.listPrice + 1e-9) {
    out.push(
      block(
        "price_above_list",
        `Unit price ${input.unitPrice} exceeds list price ${input.listPrice}.`,
        path,
      ),
    );
  }
  const hist = input.historicalAvgPrice;
  if (hist && hist > 0) {
    const dev = (Math.abs(input.unitPrice - hist) / hist) * 100;
    if (dev > limits.historicalDeviationPct) {
      out.push(
        warn(
          "price_deviates_from_history",
          `Unit price ${input.unitPrice} is ${round(dev)}% away from the historical average ${round(hist)}.`,
          path,
        ),
      );
    }
  }
  return out;
}

export function checkOrderValue(total: number, max: number, label: string): Violation[] {
  if (total > max) {
    return [
      block(
        "order_value_over_limit",
        `${label} total ${round(total)} exceeds the limit of ${max}.`,
        "total",
      ),
    ];
  }
  return [];
}

export function checkNoDuplicateProducts(productIds: number[], path = "lines"): Violation[] {
  const seen = new Set<number>();
  const out: Violation[] = [];
  for (const id of productIds) {
    if (seen.has(id)) {
      out.push(
        block(
          "duplicate_product",
          `Product ${id} appears on more than one line; combine the quantities.`,
          path,
        ),
      );
    }
    seen.add(id);
  }
  return out;
}

export function checkPurchaseQuantity(
  input: { quantity: number; moq: number; reorderMax: number | null },
  path: string,
  limits: Limits = DEFAULT_LIMITS,
): Violation[] {
  const out: Violation[] = [];
  if (input.quantity < input.moq) {
    out.push(
      block(
        "below_moq",
        `Quantity ${input.quantity} is below the supplier minimum order quantity of ${input.moq}.`,
        path,
      ),
    );
  }
  if (input.reorderMax !== null) {
    const cap = Math.max(input.reorderMax * limits.maxPurchaseOverMaxFactor, input.moq);
    if (input.quantity > cap) {
      out.push(
        block(
          "purchase_over_max",
          `Quantity ${input.quantity} exceeds ${limits.maxPurchaseOverMaxFactor}x the reorder maximum (${input.reorderMax}).`,
          path,
        ),
      );
    }
  }
  return out;
}

/** The only fields the write layer may send to Odoo, per model. */
export const ALLOWED_WRITE_FIELDS = {
  "sale.order": ["partner_id", "client_order_ref", "note", "order_line"],
  "sale.order.line": ["product_id", "product_uom_qty", "price_unit", "discount"],
  "purchase.order": ["partner_id", "partner_ref", "notes", "date_planned", "order_line"],
  "purchase.order.line": ["product_id", "product_qty", "price_unit", "date_planned"],
} as const;

export function assertAllowedFields(
  model: keyof typeof ALLOWED_WRITE_FIELDS,
  values: Record<string, unknown>,
) {
  const allowed: readonly string[] = ALLOWED_WRITE_FIELDS[model];
  const bad = Object.keys(values).filter((k) => !allowed.includes(k));
  if (bad.length > 0) throw new Error(`Fields not allowed on ${model}: ${bad.join(", ")}`);
}

const round = (n: number) => Math.round(n * 100) / 100;
