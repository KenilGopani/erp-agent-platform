import { z } from "zod";

// ---------------------------------------------------------------------------
// Odoo wire helpers. Odoo returns `false` for empty fields and `[id, name]`
// for many2one fields.
// ---------------------------------------------------------------------------

const many2one = z
  .union([z.tuple([z.number(), z.string()]), z.literal(false)])
  .transform((v) => (v === false ? null : { id: v[0], name: v[1] }));

const optionalString = z.union([z.string(), z.literal(false)]).transform((v) => v || null);

const optionalDate = z.union([z.string(), z.literal(false)]).transform((v) => (v ? v : null));

// ---------------------------------------------------------------------------
// Raw record schemas (what we ask Odoo for)
// ---------------------------------------------------------------------------

export const PARTNER_FIELDS = [
  "name",
  "email",
  "property_payment_term_id",
  "property_product_pricelist",
  "customer_rank",
  "supplier_rank",
] as const;

export const rawPartner = z.object({
  id: z.number(),
  name: z.string(),
  email: optionalString,
  property_payment_term_id: many2one,
  property_product_pricelist: many2one,
});

export const PRODUCT_FIELDS = [
  "default_code",
  "name",
  "uom_id",
  "lst_price",
  "standard_price",
  "is_storable",
  "qty_available",
  "free_qty",
  "virtual_available",
  "incoming_qty",
  "outgoing_qty",
] as const;

export const rawProduct = z.object({
  id: z.number(),
  default_code: optionalString,
  name: z.string(),
  uom_id: many2one,
  lst_price: z.number(),
  standard_price: z.number(),
  is_storable: z.boolean(),
  qty_available: z.number(),
  free_qty: z.number(),
  virtual_available: z.number(),
  incoming_qty: z.number(),
  outgoing_qty: z.number(),
});

export const rawOrderpoint = z.object({
  id: z.number(),
  product_id: many2one,
  product_min_qty: z.number(),
  product_max_qty: z.number(),
});

export const SUPPLIERINFO_FIELDS = [
  "partner_id",
  "product_id",
  "product_tmpl_id",
  "price",
  "min_qty",
  "delay",
  "product_code",
] as const;

export const rawSupplierInfo = z.object({
  id: z.number(),
  partner_id: many2one,
  product_id: many2one,
  product_tmpl_id: many2one,
  price: z.number(),
  min_qty: z.number(),
  delay: z.number(),
  product_code: optionalString,
});

export const ORDER_FIELDS = [
  "name",
  "partner_id",
  "state",
  "date_order",
  "amount_total",
  "order_line",
] as const;

export const rawOrder = z.object({
  id: z.number(),
  name: z.string(),
  partner_id: many2one,
  state: z.string(),
  date_order: optionalDate,
  amount_total: z.number(),
  order_line: z.array(z.number()),
});

export const rawSaleLine = z.object({
  id: z.number(),
  order_id: many2one,
  product_id: many2one,
  product_uom_qty: z.number(),
  qty_delivered: z.number(),
  price_unit: z.number(),
  discount: z.number(),
});

export const rawPurchaseLine = z.object({
  id: z.number(),
  order_id: many2one,
  product_id: many2one,
  product_qty: z.number(),
  qty_received: z.number(),
  price_unit: z.number(),
  date_planned: optionalDate,
});

// ---------------------------------------------------------------------------
// Domain types (what the rest of the app sees)
// ---------------------------------------------------------------------------

export const customerSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  pricelistId: z.number().nullable(),
  pricelist: z.string().nullable(),
});
export type Customer = z.infer<typeof customerSchema>;

export const productSchema = z.object({
  id: z.number(),
  sku: z.string().nullable(),
  name: z.string(),
  uom: z.string(),
  listPrice: z.number(),
  cost: z.number(),
  isStorable: z.boolean(),
});
export type Product = z.infer<typeof productSchema>;

export const stockLevelSchema = z.object({
  productId: z.number(),
  onHand: z.number(),
  reserved: z.number(),
  available: z.number(),
  forecasted: z.number(),
  incoming: z.number(),
  outgoing: z.number(),
  reorderPoint: z.number().nullable(),
  reorderMax: z.number().nullable(),
});
export type StockLevel = z.infer<typeof stockLevelSchema>;

export const supplierPriceSchema = z.object({
  id: z.number(),
  supplierId: z.number(),
  supplierName: z.string(),
  productId: z.number().nullable(),
  productTemplateId: z.number().nullable(),
  unitPrice: z.number(),
  minQty: z.number(),
  leadTimeDays: z.number(),
  supplierProductCode: z.string().nullable(),
});
export type SupplierPrice = z.infer<typeof supplierPriceSchema>;

export const orderLineSchema = z.object({
  id: z.number(),
  productId: z.number().nullable(),
  productName: z.string().nullable(),
  quantity: z.number(),
  /** Delivered (sales) or received (purchase) so far. */
  fulfilled: z.number(),
  unitPrice: z.number(),
  discountPct: z.number(),
  expectedDate: z.string().nullable(),
});
export type OrderLine = z.infer<typeof orderLineSchema>;

const orderBase = {
  id: z.number(),
  name: z.string(),
  partnerId: z.number().nullable(),
  partnerName: z.string().nullable(),
  state: z.string(),
  date: z.string().nullable(),
  total: z.number(),
  lines: z.array(orderLineSchema),
};
export const salesOrderSchema = z.object(orderBase);
export type SalesOrder = z.infer<typeof salesOrderSchema>;
export const purchaseOrderSchema = z.object(orderBase);
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

// ---------------------------------------------------------------------------
// Mappers: raw Odoo record -> domain type
// ---------------------------------------------------------------------------

export function mapCustomer(raw: unknown): Customer {
  const r = rawPartner.parse(raw);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    paymentTerms: r.property_payment_term_id?.name ?? null,
    pricelistId: r.property_product_pricelist?.id ?? null,
    pricelist: r.property_product_pricelist?.name ?? null,
  };
}

export function mapProduct(raw: unknown): Product {
  const r = rawProduct.parse(raw);
  return {
    id: r.id,
    sku: r.default_code,
    name: r.name,
    uom: r.uom_id?.name ?? "Units",
    listPrice: r.lst_price,
    cost: r.standard_price,
    isStorable: r.is_storable,
  };
}

export function mapStockLevel(
  rawProductRecord: unknown,
  rawOrderpointRecord?: unknown,
): StockLevel {
  const p = rawProduct.parse(rawProductRecord);
  const op = rawOrderpointRecord ? rawOrderpoint.parse(rawOrderpointRecord) : undefined;
  return {
    productId: p.id,
    onHand: p.qty_available,
    reserved: round(p.qty_available - p.free_qty),
    available: p.free_qty,
    forecasted: p.virtual_available,
    incoming: p.incoming_qty,
    outgoing: p.outgoing_qty,
    reorderPoint: op?.product_min_qty ?? null,
    reorderMax: op?.product_max_qty ?? null,
  };
}

export function mapSupplierPrice(raw: unknown): SupplierPrice {
  const r = rawSupplierInfo.parse(raw);
  if (!r.partner_id) throw new Error(`supplierinfo ${r.id} has no supplier`);
  return {
    id: r.id,
    supplierId: r.partner_id.id,
    supplierName: r.partner_id.name,
    productId: r.product_id?.id ?? null,
    productTemplateId: r.product_tmpl_id?.id ?? null,
    unitPrice: r.price,
    minQty: r.min_qty,
    leadTimeDays: r.delay,
    supplierProductCode: r.product_code,
  };
}

export function mapSalesOrder(rawOrderRecord: unknown, rawLines: unknown[]): SalesOrder {
  const o = rawOrder.parse(rawOrderRecord);
  return {
    id: o.id,
    name: o.name,
    partnerId: o.partner_id?.id ?? null,
    partnerName: o.partner_id?.name ?? null,
    state: o.state,
    date: o.date_order,
    total: o.amount_total,
    lines: rawLines.map((l) => {
      const line = rawSaleLine.parse(l);
      return {
        id: line.id,
        productId: line.product_id?.id ?? null,
        productName: line.product_id?.name ?? null,
        quantity: line.product_uom_qty,
        fulfilled: line.qty_delivered,
        unitPrice: line.price_unit,
        discountPct: line.discount,
        expectedDate: o.date_order,
      };
    }),
  };
}

export function mapPurchaseOrder(rawOrderRecord: unknown, rawLines: unknown[]): PurchaseOrder {
  const o = rawOrder.parse(rawOrderRecord);
  return {
    id: o.id,
    name: o.name,
    partnerId: o.partner_id?.id ?? null,
    partnerName: o.partner_id?.name ?? null,
    state: o.state,
    date: o.date_order,
    total: o.amount_total,
    lines: rawLines.map((l) => {
      const line = rawPurchaseLine.parse(l);
      return {
        id: line.id,
        productId: line.product_id?.id ?? null,
        productName: line.product_id?.name ?? null,
        quantity: line.product_qty,
        fulfilled: line.qty_received,
        unitPrice: line.price_unit,
        discountPct: 0,
        expectedDate: line.date_planned,
      };
    }),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
