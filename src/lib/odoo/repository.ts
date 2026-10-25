import type { OdooClient, OdooDomain } from "./client";
import { PRICELIST_ITEM_FIELDS, mapPricelistRule, type PricelistRule } from "../pricing/pricelist";
import {
  ORDER_FIELDS,
  PARTNER_FIELDS,
  PRODUCT_FIELDS,
  SUPPLIERINFO_FIELDS,
  mapCustomer,
  mapProduct,
  mapPurchaseOrder,
  mapSalesOrder,
  mapStockLevel,
  mapSupplierPrice,
  type Customer,
  type Product,
  type PurchaseOrder,
  type SalesOrder,
  type StockLevel,
  type SupplierPrice,
} from "./types";

const SALE_LINE_FIELDS = [
  "order_id",
  "product_id",
  "product_uom_qty",
  "qty_delivered",
  "price_unit",
  "discount",
];
const PURCHASE_LINE_FIELDS = [
  "order_id",
  "product_id",
  "product_qty",
  "qty_received",
  "price_unit",
  "date_planned",
];

/**
 * Every word must match at least one of the fields, in any order, so "DN100 flange"
 * finds "Flange DN100". Words are ANDed (implicit in Odoo domains), fields ORed.
 */
export function tokenDomain(query: string, fields: string[]): OdooDomain {
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.flatMap((token) => [
    ...Array<string>(fields.length - 1).fill("|"),
    ...fields.map((f): [string, string, unknown] => [f, "ilike", token]),
  ]);
}

/** Read-only access to Odoo, returning validated domain types. */
export class OdooRepository {
  constructor(private readonly odoo: OdooClient) {}

  async findCustomers(query: string, limit = 10): Promise<Customer[]> {
    const rows = await this.odoo.searchRead(
      "res.partner",
      [["customer_rank", ">", 0], ...tokenDomain(query, ["name", "email"])],
      { fields: [...PARTNER_FIELDS], limit, order: "name" },
    );
    return rows.map(mapCustomer);
  }

  async getCustomer(id: number): Promise<Customer | null> {
    const [row] = await this.odoo.read("res.partner", [id], [...PARTNER_FIELDS]);
    return row ? mapCustomer(row) : null;
  }

  /** Name of a supplier partner, or null if the id is not a supplier. */
  async getSupplierName(id: number): Promise<string | null> {
    const [row] = await this.odoo.searchRead<{ name: string }>(
      "res.partner",
      [
        ["id", "=", id],
        ["supplier_rank", ">", 0],
      ],
      { fields: ["name"], limit: 1 },
    );
    return row?.name ?? null;
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await this.odoo.searchRead("res.partner", [["customer_rank", ">", 0]], {
      fields: [...PARTNER_FIELDS],
      order: "name",
    });
    return rows.map(mapCustomer);
  }

  async findProducts(search: { query?: string; sku?: string }, limit = 10): Promise<Product[]> {
    const domain: OdooDomain = [];
    if (search.sku) domain.push(["default_code", "=ilike", search.sku]);
    if (search.query) domain.push(...tokenDomain(search.query, ["name", "default_code"]));
    const rows = await this.odoo.searchRead("product.product", domain, {
      fields: [...PRODUCT_FIELDS],
      limit,
      order: "default_code",
    });
    return rows.map(mapProduct);
  }

  async getProduct(id: number): Promise<Product | null> {
    const [row] = await this.odoo.read("product.product", [id], [...PRODUCT_FIELDS]);
    return row ? mapProduct(row) : null;
  }

  async listProducts(): Promise<Product[]> {
    const rows = await this.odoo.searchRead("product.product", [["default_code", "!=", false]], {
      fields: [...PRODUCT_FIELDS],
      order: "default_code",
    });
    return rows.map(mapProduct);
  }

  /** Stock position for the given products, including their reorder rule if any. */
  async getStockLevels(productIds: number[]): Promise<StockLevel[]> {
    if (productIds.length === 0) return [];
    const [products, orderpoints] = await Promise.all([
      this.odoo.read("product.product", productIds, [...PRODUCT_FIELDS]),
      this.odoo.searchRead<{ product_id: [number, string] }>(
        "stock.warehouse.orderpoint",
        [["product_id", "in", productIds]],
        { fields: ["product_id", "product_min_qty", "product_max_qty"] },
      ),
    ]);
    const byProduct = new Map(orderpoints.map((o) => [o.product_id[0], o]));
    return products.map((p) => mapStockLevel(p, byProduct.get((p as { id: number }).id)));
  }

  /** Pricelist rules, as evaluated by lib/pricing. */
  async getPricelistRules(pricelistId: number): Promise<PricelistRule[]> {
    const rows = await this.odoo.searchRead(
      "product.pricelist.item",
      [["pricelist_id", "=", pricelistId]],
      { fields: [...PRICELIST_ITEM_FIELDS], order: "id" },
    );
    return rows.map(mapPricelistRule);
  }

  /** Average unit price on confirmed sales order lines, or null when never sold. */
  async getHistoricalAvgPrice(productId: number): Promise<number | null> {
    const lines = await this.odoo.searchRead<{ price_unit: number; product_uom_qty: number }>(
      "sale.order.line",
      [
        ["product_id", "=", productId],
        ["order_id.state", "in", ["sale", "done"]],
      ],
      { fields: ["price_unit", "product_uom_qty"] },
    );
    const qty = lines.reduce((s, l) => s + l.product_uom_qty, 0);
    if (qty === 0) return null;
    return lines.reduce((s, l) => s + l.price_unit * l.product_uom_qty, 0) / qty;
  }

  async getSupplierPrices(productId: number): Promise<SupplierPrice[]> {
    const [product] = await this.odoo.read<{ product_tmpl_id: [number, string] }>(
      "product.product",
      [productId],
      ["product_tmpl_id"],
    );
    if (!product) return [];
    const rows = await this.odoo.searchRead(
      "product.supplierinfo",
      [
        "|",
        ["product_id", "=", productId],
        "&",
        ["product_id", "=", false],
        ["product_tmpl_id", "=", product.product_tmpl_id[0]],
      ],
      { fields: [...SUPPLIERINFO_FIELDS], order: "price" },
    );
    return rows.map(mapSupplierPrice);
  }

  /** Sales orders in the given states (e.g. ["sale"] for confirmed). */
  async listSalesOrders(
    options: { states?: string[]; productId?: number; limit?: number } = {},
  ): Promise<SalesOrder[]> {
    const domain: OdooDomain = [];
    if (options.states) domain.push(["state", "in", options.states]);
    if (options.productId) domain.push(["order_line.product_id", "=", options.productId]);
    const orders = await this.odoo.searchRead("sale.order", domain, {
      fields: [...ORDER_FIELDS, "commitment_date"],
      order: "id",
      limit: options.limit,
    });
    return this.withLines(orders, "sale.order.line", SALE_LINE_FIELDS, mapSalesOrder);
  }

  async listPurchaseOrders(
    options: { states?: string[]; productId?: number; limit?: number } = {},
  ): Promise<PurchaseOrder[]> {
    const domain: OdooDomain = [];
    if (options.states) domain.push(["state", "in", options.states]);
    if (options.productId) domain.push(["order_line.product_id", "=", options.productId]);
    const orders = await this.odoo.searchRead("purchase.order", domain, {
      fields: [...ORDER_FIELDS],
      order: "id",
      limit: options.limit,
    });
    return this.withLines(orders, "purchase.order.line", PURCHASE_LINE_FIELDS, mapPurchaseOrder);
  }

  private async withLines<T>(
    orders: Record<string, unknown>[],
    lineModel: string,
    lineFields: string[],
    map: (order: unknown, lines: unknown[]) => T,
  ): Promise<T[]> {
    const lineIds = orders.flatMap((o) => (o.order_line as number[]) ?? []);
    const lines = await this.odoo.read<Record<string, unknown>>(lineModel, lineIds, lineFields);
    const byId = new Map(lines.map((l) => [l.id as number, l]));
    return orders.map((o) =>
      map(
        o,
        ((o.order_line as number[]) ?? []).map((id) => byId.get(id)).filter((l) => l !== undefined),
      ),
    );
  }
}
