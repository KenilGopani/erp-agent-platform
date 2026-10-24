import { z } from "zod";

const many2oneId = z
  .union([z.tuple([z.number(), z.string()]), z.literal(false)])
  .transform((v) => (v === false ? null : v[0]));
const dateOrNull = z.union([z.string(), z.literal(false)]).transform((v) => v || null);

export const PRICELIST_ITEM_FIELDS = [
  "applied_on",
  "compute_price",
  "percent_price",
  "fixed_price",
  "min_quantity",
  "product_id",
  "product_tmpl_id",
  "date_start",
  "date_end",
] as const;

export const rawPricelistItem = z.object({
  id: z.number(),
  applied_on: z.string(),
  compute_price: z.string(),
  percent_price: z.number(),
  fixed_price: z.number(),
  min_quantity: z.number(),
  product_id: many2oneId,
  product_tmpl_id: many2oneId,
  date_start: dateOrNull,
  date_end: dateOrNull,
});

export const pricelistRuleSchema = z.object({
  id: z.number(),
  scope: z.enum(["variant", "product", "global"]),
  productId: z.number().nullable(),
  productTemplateId: z.number().nullable(),
  minQuantity: z.number(),
  kind: z.enum(["percentage", "fixed"]),
  value: z.number(),
  dateStart: z.string().nullable(),
  dateEnd: z.string().nullable(),
});
export type PricelistRule = z.infer<typeof pricelistRuleSchema>;

const SCOPE_PRIORITY = { variant: 0, product: 1, global: 2 } as const;

/** Maps a raw `product.pricelist.item`. Rule types we cannot evaluate fail loudly. */
export function mapPricelistRule(raw: unknown): PricelistRule {
  const r = rawPricelistItem.parse(raw);
  const scope =
    r.applied_on === "0_product_variant"
      ? "variant"
      : r.applied_on === "1_product"
        ? "product"
        : r.applied_on === "3_global"
          ? "global"
          : null;
  if (!scope) throw new Error(`Unsupported pricelist rule scope "${r.applied_on}" (item ${r.id})`);
  if (r.compute_price !== "percentage" && r.compute_price !== "fixed") {
    throw new Error(`Unsupported pricelist computation "${r.compute_price}" (item ${r.id})`);
  }
  return {
    id: r.id,
    scope,
    productId: r.product_id,
    productTemplateId: r.product_tmpl_id,
    minQuantity: r.min_quantity,
    kind: r.compute_price,
    value: r.compute_price === "percentage" ? r.percent_price : r.fixed_price,
    dateStart: r.date_start,
    dateEnd: r.date_end,
  };
}

export interface PriceResult {
  listPrice: number;
  unitPrice: number;
  /** Discount off list price implied by the unit price. */
  discountPct: number;
  appliedRuleId: number | null;
  lineTotal: number;
}

export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Picks the rule Odoo would pick (most specific scope, then highest minimum
 * quantity) and applies it. Pure and deterministic.
 */
export function computePrice(input: {
  listPrice: number;
  quantity: number;
  productId: number;
  productTemplateId: number;
  rules: PricelistRule[];
  at?: Date;
}): PriceResult {
  const at = input.at ?? new Date();
  const matching = input.rules
    .filter((r) => {
      if (r.minQuantity > input.quantity) return false;
      if (r.dateStart && new Date(r.dateStart.replace(" ", "T") + "Z") > at) return false;
      if (r.dateEnd && new Date(r.dateEnd.replace(" ", "T") + "Z") < at) return false;
      if (r.scope === "variant") return r.productId === input.productId;
      if (r.scope === "product") return r.productTemplateId === input.productTemplateId;
      return true;
    })
    .sort(
      (a, b) =>
        SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope] ||
        b.minQuantity - a.minQuantity ||
        a.id - b.id,
    );

  const rule = matching[0] ?? null;
  let unit = input.listPrice;
  if (rule?.kind === "percentage") unit = input.listPrice * (1 - rule.value / 100);
  if (rule?.kind === "fixed") unit = rule.value;
  unit = roundMoney(unit);

  const discountPct =
    input.listPrice > 0 ? roundMoney(((input.listPrice - unit) / input.listPrice) * 100) : 0;
  return {
    listPrice: input.listPrice,
    unitPrice: unit,
    discountPct,
    appliedRuleId: rule?.id ?? null,
    lineTotal: roundMoney(unit * input.quantity),
  };
}
