import { z } from "zod";
import { computePrice } from "../../pricing/pricelist";
import { defineTool, ToolError } from "../define";
import { nowOf, type ToolDeps } from "../deps";

export const getPricing = (deps: ToolDeps) =>
  defineTool({
    name: "get_pricing",
    description:
      "Deterministic unit price and line total for a customer, product and quantity, applying the customer's pricelist tier and volume breaks. " +
      "Always use this for prices; never compute or guess prices yourself.",
    inputSchema: z.object({
      customerId: z.number().int().positive(),
      productId: z.number().int().positive(),
      quantity: z.number().positive(),
    }),
    outputSchema: z.object({
      listPrice: z.number(),
      unitPrice: z.number(),
      discountPct: z.number().describe("Discount off list price, including tier and volume break"),
      lineTotal: z.number(),
      pricelist: z.string().nullable(),
    }),
    execute: async ({ customerId, productId, quantity }) => {
      const { repo } = deps;
      const [customer, product] = await Promise.all([
        repo.getCustomer(customerId),
        repo.getProduct(productId),
      ]);
      if (!customer)
        throw new ToolError("customer_not_found", `No customer with id ${customerId}.`);
      if (!product) throw new ToolError("product_not_found", `No product with id ${productId}.`);
      const rules = customer.pricelistId ? await repo.getPricelistRules(customer.pricelistId) : [];
      const price = computePrice({
        listPrice: product.listPrice,
        quantity,
        productId,
        productTemplateId: product.templateId,
        rules,
        at: nowOf(deps),
      });
      return {
        listPrice: price.listPrice,
        unitPrice: price.unitPrice,
        discountPct: price.discountPct,
        lineTotal: price.lineTotal,
        pricelist: customer.pricelist,
      };
    },
  });
