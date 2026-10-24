import { z } from "zod";
import { defineTool, ToolError } from "../define";
import type { ToolDeps } from "../deps";

const customerOut = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  pricelist: z.string().nullable().describe("Discount tier, e.g. Gold"),
});

export const findCustomer = ({ repo }: ToolDeps) =>
  defineTool({
    name: "find_customer",
    description:
      "Search customers by name or email (partial match). Returns up to 10 candidates with payment terms and discount tier. " +
      "If several customers match, do not guess: ask which one is meant.",
    inputSchema: z.object({ query: z.string().min(2).describe("Customer name or email fragment") }),
    outputSchema: z.object({ matches: z.array(customerOut) }),
    execute: async ({ query }) => {
      const matches = await repo.findCustomers(query);
      return {
        matches: matches.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          paymentTerms: c.paymentTerms,
          pricelist: c.pricelist?.replace(/ \(.*\)$/, "") ?? null,
        })),
      };
    },
  });

const productOut = z.object({
  id: z.number(),
  sku: z.string().nullable(),
  name: z.string(),
  uom: z.string(),
  listPrice: z.number(),
});

export const findProducts = ({ repo }: ToolDeps) =>
  defineTool({
    name: "find_products",
    description:
      "Search products by free text (name or SKU fragment) or exact SKU. Returns up to 10 candidates with unit of measure and list price. " +
      "If the request is ambiguous between several products, do not guess.",
    inputSchema: z
      .object({
        query: z.string().min(2).optional().describe("Name or SKU fragment"),
        sku: z.string().min(2).optional().describe("Exact SKU (case-insensitive)"),
      })
      .refine((v) => v.query || v.sku, { message: "Provide query or sku" }),
    outputSchema: z.object({ matches: z.array(productOut) }),
    execute: async (input) => {
      if (!input.query && !input.sku) throw new ToolError("invalid_input", "Provide query or sku.");
      const matches = await repo.findProducts(input);
      return {
        matches: matches.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          uom: p.uom,
          listPrice: p.listPrice,
        })),
      };
    },
  });
