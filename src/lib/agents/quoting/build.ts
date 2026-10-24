import { hasBlocking, type BuildResult, type Issue } from "../issues";
import type { OdooRepository } from "../../odoo/repository";
import { computePrice, roundMoney } from "../../pricing/pricelist";
import {
  quotationProposalSchema,
  type QuotationProposal,
  type QuotationSubmission,
} from "../proposals";

export type QuotingRepo = Pick<
  OdooRepository,
  | "getCustomer"
  | "getProduct"
  | "getStockLevels"
  | "getPricelistRules"
  | "getHistoricalAvgPrice"
  | "getSupplierPrices"
>;

export interface BuildDeps {
  repo: QuotingRepo;
  now?: () => Date;
  /** Human edits made before approval: productId -> unit price replacing the computed one. */
  unitPriceOverrides?: Record<number, number>;
}

const CURRENCY = "USD";

/**
 * Turns the model's choice of customer, products and quantities into a
 * priced, validated proposal. Every number comes from Odoo data and code.
 * Blocking violations are returned so the model can correct and resubmit.
 */
export async function buildQuotation(
  submission: QuotationSubmission,
  deps: BuildDeps,
): Promise<BuildResult<QuotationProposal>> {
  const violations: Issue[] = [];
  const fail = (v: Issue) => ({ ok: false as const, violations: [...violations, v] });
  const lines = submission.lines ?? [];

  if (!submission.customerId) {
    return fail({
      code: "missing_customer",
      severity: "block",
      message: "customerId is required.",
      path: "customerId",
    });
  }
  if (lines.length === 0) {
    violations.push({
      code: "no_lines",
      severity: "block",
      message: "At least one line is required.",
      path: "lines",
    });
  }
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) {
    violations.push({
      code: "duplicate_product",
      severity: "block",
      message: "A product appears on more than one line; combine the quantities.",
      path: "lines",
    });
  }
  if (hasBlocking(violations)) return { ok: false, violations };

  const customer = await deps.repo.getCustomer(submission.customerId);
  if (!customer) {
    return fail({
      code: "customer_not_found",
      severity: "block",
      message: `No customer with id ${submission.customerId}.`,
      path: "customerId",
    });
  }

  const rules = customer.pricelistId ? await deps.repo.getPricelistRules(customer.pricelistId) : [];
  const now = deps.now?.() ?? new Date();
  const built: QuotationProposal["lines"] = [];

  for (const [i, line] of lines.entries()) {
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

    if (!(line.quantity > 0)) {
      violations.push({
        code: "non_positive_quantity",
        severity: "block",
        message: `Quantity must be greater than zero, got ${line.quantity}.`,
        path: `${path}.quantity`,
      });
      continue;
    }

    const tier = computePrice({
      listPrice: product.listPrice,
      quantity: line.quantity,
      productId: product.id,
      productTemplateId: product.templateId,
      rules,
      at: now,
    });

    // An explicit extra discount is applied on top of the tier price, then judged against the limit.
    const extra = line.extraDiscountPct ?? 0;
    const override = deps.unitPriceOverrides?.[product.id];
    if (override !== undefined && !(override > 0)) {
      violations.push({
        code: "non_positive_price",
        severity: "block",
        message: `Unit price must be greater than zero, got ${override}.`,
        path: `${path}.unitPrice`,
      });
      continue;
    }
    const unitPrice =
      override ?? (extra > 0 ? roundMoney(tier.unitPrice * (1 - extra / 100)) : tier.unitPrice);
    const discountPct =
      product.listPrice > 0
        ? roundMoney(((product.listPrice - unitPrice) / product.listPrice) * 100)
        : 0;

    const [level] = await deps.repo.getStockLevels([product.id]);
    const available = level?.available ?? 0;
    const fulfillment =
      available >= line.quantity ? "in_stock" : available > 0 ? "partial_stock" : "out_of_stock";
    if (fulfillment !== "in_stock") {
      violations.push({
        code: "insufficient_stock",
        severity: "warn",
        message: `${product.sku ?? product.name}: ${available} ${product.uom} free for ${line.quantity} requested; the rest depends on replenishment.`,
        path: `${path}.quantity`,
      });
    }

    let leadTime: number | null = 0;
    if (fulfillment !== "in_stock") {
      const suppliers = await deps.repo.getSupplierPrices(product.id);
      leadTime = suppliers.length > 0 ? Math.min(...suppliers.map((s) => s.leadTimeDays)) : null;
    }

    built.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      uom: product.uom,
      quantity: line.quantity,
      listPrice: product.listPrice,
      unitPrice,
      discountPct,
      lineTotal: roundMoney(unitPrice * line.quantity),
      availableQty: available,
      fulfillment,
      estimatedLeadTimeDays: leadTime,
      note: line.note ?? null,
      extraDiscountPct: extra,
      priceOverride: override ?? null,
    });
  }

  if (hasBlocking(violations)) return { ok: false, violations };

  const total = roundMoney(built.reduce((s, l) => s + l.lineTotal, 0));
  const proposal = quotationProposalSchema.parse({
    kind: "quotation",
    customer: {
      id: customer.id,
      name: customer.name,
      paymentTerms: customer.paymentTerms,
      pricelist: customer.pricelist,
    },
    lines: built,
    total,
    currency: CURRENCY,
    summary: submission.summary ?? "",
    assumptions: submission.assumptions ?? [],
    openQuestions: submission.openQuestions ?? [],
    confidence: submission.confidence ?? "medium",
    flags: violations,
  });
  return { ok: true, proposal };
}
