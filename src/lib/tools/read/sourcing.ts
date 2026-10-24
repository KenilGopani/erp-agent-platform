import { z } from "zod";
import { defineTool, ToolError } from "../define";
import { addDays, isoDate, nowOf, type ToolDeps } from "../deps";
import { roundMoney } from "../../pricing/pricelist";

const productId = z.number().int().positive().describe("Odoo product id from find_products");

export const getSupplierPrices = ({ repo }: ToolDeps) =>
  defineTool({
    name: "get_supplier_prices",
    description:
      "Suppliers that can supply a product, with unit price, minimum order quantity (MOQ) and lead time in days. Cheapest first.",
    inputSchema: z.object({ productId }),
    outputSchema: z.object({
      suppliers: z.array(
        z.object({
          supplierId: z.number(),
          supplierName: z.string(),
          unitPrice: z.number(),
          minQty: z.number(),
          leadTimeDays: z.number(),
        }),
      ),
    }),
    execute: async ({ productId }) => {
      if (!(await repo.getProduct(productId))) {
        throw new ToolError("product_not_found", `No product with id ${productId}.`);
      }
      const prices = await repo.getSupplierPrices(productId);
      return {
        suppliers: prices.map((s) => ({
          supplierId: s.supplierId,
          supplierName: s.supplierName,
          unitPrice: s.unitPrice,
          minQty: s.minQty,
          leadTimeDays: s.leadTimeDays,
        })),
      };
    },
  });

export const getReplenishmentOptions = (deps: ToolDeps) =>
  defineTool({
    name: "get_replenishment_options",
    description:
      "Deterministic replenishment calculation for one product: the quantity needed to reach the reorder maximum, and for each supplier the order quantity (rounded up to its MOQ), cost and expected arrival date. " +
      "Use these numbers; do not recompute them. You choose the supplier and explain the tradeoff.",
    inputSchema: z.object({ productId }),
    outputSchema: z.object({
      productId: z.number(),
      uom: z.string(),
      forecasted: z.number(),
      reorderPoint: z.number().nullable(),
      reorderMax: z.number().nullable(),
      needsReplenishment: z.boolean(),
      quantityNeeded: z.number(),
      options: z.array(
        z.object({
          supplierId: z.number(),
          supplierName: z.string(),
          unitPrice: z.number(),
          minQty: z.number(),
          orderQuantity: z.number(),
          lineCost: z.number(),
          leadTimeDays: z.number(),
          expectedArrival: z.string(),
        }),
      ),
    }),
    execute: async ({ productId }) => {
      const { repo } = deps;
      const product = await repo.getProduct(productId);
      if (!product) throw new ToolError("product_not_found", `No product with id ${productId}.`);
      const [level] = await repo.getStockLevels([productId]);
      const l = level!;
      const needsReplenishment =
        l.reorderPoint !== null && (l.forecasted < l.reorderPoint || l.forecasted < 0);
      const quantityNeeded =
        l.reorderMax !== null && needsReplenishment ? Math.max(0, l.reorderMax - l.forecasted) : 0;
      const today = nowOf(deps);
      const prices = await repo.getSupplierPrices(productId);
      return {
        productId,
        uom: product.uom,
        forecasted: l.forecasted,
        reorderPoint: l.reorderPoint,
        reorderMax: l.reorderMax,
        needsReplenishment,
        quantityNeeded,
        options: prices.map((s) => {
          const orderQuantity = Math.max(quantityNeeded, s.minQty);
          return {
            supplierId: s.supplierId,
            supplierName: s.supplierName,
            unitPrice: s.unitPrice,
            minQty: s.minQty,
            orderQuantity,
            lineCost: roundMoney(orderQuantity * s.unitPrice),
            leadTimeDays: s.leadTimeDays,
            expectedArrival: isoDate(addDays(today, s.leadTimeDays)),
          };
        }),
      };
    },
  });
