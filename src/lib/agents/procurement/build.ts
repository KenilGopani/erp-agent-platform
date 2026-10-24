import { hasBlocking, type BuildResult, type Issue } from "../issues";
import type { OdooRepository } from "../../odoo/repository";
import { roundMoney } from "../../pricing/pricelist";
import { addDays, isoDate } from "../../tools/deps";
import {
  purchaseProposalSchema,
  type ProcurementSubmission,
  type PurchaseProposal,
} from "../proposals";

export type ProcurementRepo = Pick<
  OdooRepository,
  "getProduct" | "getStockLevels" | "getSupplierPrices" | "listPurchaseOrders"
> & { getSupplierName(id: number): Promise<string | null> };

export interface ProcurementBuildDeps {
  repo: ProcurementRepo;
  now?: () => Date;
  /** Human edits made before approval: productId -> unit price replacing the supplier's. */
  unitPriceOverrides?: Record<number, number>;
}

type Order = NonNullable<ProcurementSubmission["orders"]>[number];

/**
 * Builds one validated purchase proposal for one supplier. Unit prices, MOQs
 * and lead times come from Odoo's supplier prices, never from the model.
 */
export async function buildPurchaseProposal(
  order: Order,
  deps: ProcurementBuildDeps,
): Promise<BuildResult<PurchaseProposal>> {
  const violations: Issue[] = [];
  const today = deps.now?.() ?? new Date();

  if (new Set(order.lines.map((l) => l.productId)).size !== order.lines.length) {
    violations.push({
      code: "duplicate_product",
      severity: "block",
      message: "A product appears on more than one line; combine the quantities.",
      path: "lines",
    });
  }
  const supplierName = await deps.repo.getSupplierName(order.supplierId);
  if (!supplierName) {
    violations.push({
      code: "supplier_not_found",
      severity: "block",
      message: `No supplier with id ${order.supplierId}.`,
      path: "supplierId",
    });
  }
  if (hasBlocking(violations)) return { ok: false, violations };

  const lines: PurchaseProposal["lines"] = [];
  for (const [i, line] of order.lines.entries()) {
    const path = `lines[${i}]`;
    const product = await deps.repo.getProduct(line.productId);
    if (!product) {
      violations.push({
        code: "product_not_found",
        severity: "block",
        message: `No product with id ${line.productId}.`,
        path: `${path}.productId`,
      });
      continue;
    }

    const offers = await deps.repo.getSupplierPrices(product.id);
    const offer = offers.find((o) => o.supplierId === order.supplierId);
    if (!offer) {
      violations.push({
        code: "supplier_does_not_offer_product",
        severity: "block",
        message: `${supplierName} does not supply ${product.sku ?? product.name}. Suppliers that do: ${
          offers.map((o) => `${o.supplierName} (id ${o.supplierId})`).join(", ") || "none"
        }.`,
        path: `${path}.productId`,
      });
      continue;
    }

    const [level] = await deps.repo.getStockLevels([product.id]);
    const forecast = level?.forecasted ?? 0;
    const reorderPoint = level?.reorderPoint ?? null;
    const needed = reorderPoint !== null && (forecast < reorderPoint || forecast < 0);
    if (!needed) {
      violations.push({
        code: "no_shortage",
        severity: "block",
        message: `${product.sku ?? product.name} is not short: forecasted ${forecast} (including incoming purchase orders) is at or above its reorder point ${reorderPoint ?? "n/a"}. Do not order it again.`,
        path: `${path}.productId`,
      });
      continue;
    }

    const unitPrice = deps.unitPriceOverrides?.[product.id] ?? offer.unitPrice;
    if (!(unitPrice > 0)) {
      violations.push({
        code: "non_positive_price",
        severity: "block",
        message: `Unit price must be greater than zero, got ${unitPrice}.`,
        path: `${path}.unitPrice`,
      });
      continue;
    }
    if (line.quantity < offer.minQty) {
      violations.push({
        code: "below_moq",
        severity: "block",
        message: `Quantity ${line.quantity} is below ${supplierName}'s minimum order quantity of ${offer.minQty}.`,
        path: `${path}.quantity`,
      });
    }

    lines.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      uom: product.uom,
      quantity: line.quantity,
      unitPrice,
      lineTotal: roundMoney(line.quantity * unitPrice),
      moq: offer.minQty,
      leadTimeDays: offer.leadTimeDays,
      expectedArrival: isoDate(addDays(today, offer.leadTimeDays)),
      forecastedBefore: forecast,
      reorderPoint,
      reason: line.reason,
      priceOverride: deps.unitPriceOverrides?.[product.id] ?? null,
    });
  }

  if (hasBlocking(violations)) return { ok: false, violations };

  const total = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
  const expectedDelivery = lines
    .map((l) => l.expectedArrival)
    .sort()
    .at(-1)!;
  const proposal = purchaseProposalSchema.parse({
    kind: "purchase_order",
    supplier: { id: order.supplierId, name: supplierName },
    lines,
    total,
    currency: "USD",
    expectedDelivery,
    summary: `${lines.length} line(s) from ${supplierName}, total ${total} USD`,
    flags: violations,
  });
  return { ok: true, proposal };
}
