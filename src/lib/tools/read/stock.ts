import { z } from "zod";
import { defineTool, ToolError } from "../define";
import type { ToolDeps } from "../deps";

const productId = z.number().int().positive().describe("Odoo product id from find_products");

export const getInventory = ({ repo }: ToolDeps) =>
  defineTool({
    name: "get_inventory",
    description:
      "Current stock position of one product: on hand, reserved, free (available), forecasted (on hand + incoming - outgoing) and its reorder point/maximum.",
    inputSchema: z.object({ productId }),
    outputSchema: z.object({
      productId: z.number(),
      sku: z.string().nullable(),
      uom: z.string(),
      onHand: z.number(),
      reserved: z.number(),
      available: z.number(),
      incoming: z.number(),
      outgoing: z.number(),
      forecasted: z.number(),
      reorderPoint: z.number().nullable(),
      reorderMax: z.number().nullable(),
    }),
    execute: async ({ productId }) => {
      const product = await repo.getProduct(productId);
      if (!product) throw new ToolError("product_not_found", `No product with id ${productId}.`);
      const [level] = await repo.getStockLevels([productId]);
      return {
        productId,
        sku: product.sku,
        uom: product.uom,
        onHand: level!.onHand,
        reserved: level!.reserved,
        available: level!.available,
        incoming: level!.incoming,
        outgoing: level!.outgoing,
        forecasted: level!.forecasted,
        reorderPoint: level!.reorderPoint,
        reorderMax: level!.reorderMax,
      };
    },
  });

export const getOpenDemand = ({ repo }: ToolDeps) =>
  defineTool({
    name: "get_open_demand",
    description:
      "Confirmed customer sales orders that still have undelivered quantity of this product, with promised dates. Draft quotations are not demand and are excluded.",
    inputSchema: z.object({ productId }),
    outputSchema: z.object({
      totalOpenQuantity: z.number(),
      orders: z.array(
        z.object({
          order: z.string(),
          customer: z.string().nullable(),
          openQuantity: z.number(),
          expectedDate: z.string().nullable(),
        }),
      ),
    }),
    execute: async ({ productId }) => {
      const orders = await repo.listSalesOrders({ states: ["sale"], productId });
      const rows = orders.flatMap((o) =>
        o.lines
          .filter((l) => l.productId === productId && l.quantity - l.fulfilled > 0)
          .map((l) => ({
            order: o.name,
            customer: o.partnerName,
            openQuantity: l.quantity - l.fulfilled,
            expectedDate: l.expectedDate?.slice(0, 10) ?? null,
          })),
      );
      return { totalOpenQuantity: rows.reduce((s, r) => s + r.openQuantity, 0), orders: rows };
    },
  });

export const getOpenPurchaseOrders = ({ repo }: ToolDeps) =>
  defineTool({
    name: "get_open_purchase_orders",
    description:
      "Confirmed purchase orders with quantity of this product still to be received, with expected arrival. Draft RFQs are not supply and are excluded.",
    inputSchema: z.object({ productId }),
    outputSchema: z.object({
      totalIncomingQuantity: z.number(),
      orders: z.array(
        z.object({
          order: z.string(),
          supplier: z.string().nullable(),
          openQuantity: z.number(),
          expectedDate: z.string().nullable(),
        }),
      ),
    }),
    execute: async ({ productId }) => {
      const orders = await repo.listPurchaseOrders({ states: ["purchase", "done"], productId });
      const rows = orders.flatMap((o) =>
        o.lines
          .filter((l) => l.productId === productId && l.quantity - l.fulfilled > 0)
          .map((l) => ({
            order: o.name,
            supplier: o.partnerName,
            openQuantity: l.quantity - l.fulfilled,
            expectedDate: l.expectedDate?.slice(0, 10) ?? null,
          })),
      );
      return { totalIncomingQuantity: rows.reduce((s, r) => s + r.openQuantity, 0), orders: rows };
    },
  });

export const findShortages = ({ repo }: ToolDeps) =>
  defineTool({
    name: "find_shortages",
    description:
      "Scans all products with a reorder rule and lists those whose forecasted stock (after open demand and incoming purchase orders) is below the reorder point or negative. " +
      "Products already covered by incoming purchase orders do not appear. Sorted most urgent first.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      shortages: z.array(
        z.object({
          productId: z.number(),
          sku: z.string().nullable(),
          name: z.string(),
          uom: z.string(),
          onHand: z.number(),
          forecasted: z.number(),
          reorderPoint: z.number(),
          reorderMax: z.number(),
          quantityToReachMax: z.number(),
          reason: z.enum(["negative_forecast", "below_reorder_point"]),
        }),
      ),
    }),
    execute: async () => {
      const products = await repo.listProducts();
      const levels = await repo.getStockLevels(products.map((p) => p.id));
      const byId = new Map(products.map((p) => [p.id, p]));
      const shortages = levels
        .filter((l) => l.reorderPoint !== null && l.reorderMax !== null)
        .filter((l) => l.forecasted < l.reorderPoint! || l.forecasted < 0)
        .map((l) => {
          const p = byId.get(l.productId)!;
          return {
            productId: p.id,
            sku: p.sku,
            name: p.name,
            uom: p.uom,
            onHand: l.onHand,
            forecasted: l.forecasted,
            reorderPoint: l.reorderPoint!,
            reorderMax: l.reorderMax!,
            quantityToReachMax: Math.max(0, l.reorderMax! - l.forecasted),
            reason: (l.forecasted < 0 ? "negative_forecast" : "below_reorder_point") as
              "negative_forecast" | "below_reorder_point",
          };
        })
        // most urgent first: negative forecasts, then by depth below the reorder point
        .sort(
          (a, b) =>
            Number(b.forecasted < 0) - Number(a.forecasted < 0) ||
            a.forecasted / a.reorderPoint - b.forecasted / b.reorderPoint,
        );
      return { shortages };
    },
  });
