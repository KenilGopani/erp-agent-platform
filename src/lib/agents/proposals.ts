import { z } from "zod";

const violationSchema = z.object({
  code: z.string(),
  severity: z.enum(["block", "warn"]),
  message: z.string(),
  path: z.string().optional(),
});

export const quotationLineSchema = z.object({
  productId: z.number(),
  sku: z.string().nullable(),
  name: z.string(),
  uom: z.string(),
  quantity: z.number().positive(),
  listPrice: z.number(),
  unitPrice: z.number(),
  discountPct: z.number(),
  lineTotal: z.number(),
  availableQty: z.number(),
  fulfillment: z.enum(["in_stock", "partial_stock", "out_of_stock"]),
  /** 0 when shipping from stock; otherwise the shortest supplier lead time. */
  estimatedLeadTimeDays: z.number().nullable(),
  note: z.string().nullable(),
});

export const quotationProposalSchema = z.object({
  kind: z.literal("quotation"),
  customer: z.object({
    id: z.number(),
    name: z.string(),
    paymentTerms: z.string().nullable(),
    pricelist: z.string().nullable(),
  }),
  lines: z.array(quotationLineSchema).min(1),
  total: z.number(),
  currency: z.string(),
  summary: z.string(),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  flags: z.array(violationSchema),
});
export type QuotationProposal = z.infer<typeof quotationProposalSchema>;

export const purchaseLineSchema = z.object({
  productId: z.number(),
  sku: z.string().nullable(),
  name: z.string(),
  uom: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  moq: z.number(),
  leadTimeDays: z.number(),
  expectedArrival: z.string(),
  forecastedBefore: z.number(),
  reorderPoint: z.number().nullable(),
  reason: z.string(),
});

export const purchaseProposalSchema = z.object({
  kind: z.literal("purchase_order"),
  supplier: z.object({ id: z.number(), name: z.string() }),
  lines: z.array(purchaseLineSchema).min(1),
  total: z.number(),
  currency: z.string(),
  expectedDelivery: z.string(),
  summary: z.string(),
  flags: z.array(violationSchema),
});
export type PurchaseProposal = z.infer<typeof purchaseProposalSchema>;

export type Proposal = QuotationProposal | PurchaseProposal;

// ---------------------------------------------------------------------------
// What the model submits. Deliberately flat (no unions) for portability across
// providers, and deliberately free of any price, total or stock figure: code
// computes those. The model chooses what and how much, and explains.
// ---------------------------------------------------------------------------

export const outcomeSchema = z.enum(["propose", "needs_clarification", "cannot_fulfill"]);

export const quotationSubmissionSchema = z.object({
  outcome: outcomeSchema.describe(
    "propose: a complete quotation can be made. needs_clarification: customer, product or quantity is ambiguous or missing. cannot_fulfill: the request is impossible or not allowed.",
  ),
  customerId: z.number().int().positive().optional(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
        extraDiscountPct: z
          .number()
          .min(0)
          .optional()
          .describe(
            "Only if the customer explicitly asked for an additional discount beyond their tier.",
          ),
        note: z.string().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional().describe("One or two sentences for the approver."),
  assumptions: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  questions: z
    .array(z.string())
    .optional()
    .describe("For needs_clarification: what to ask the requester."),
  reason: z.string().optional().describe("For needs_clarification or cannot_fulfill: why."),
});
export type QuotationSubmission = z.infer<typeof quotationSubmissionSchema>;

export const procurementSubmissionSchema = z.object({
  outcome: outcomeSchema.describe(
    "propose: one or more purchase orders are recommended. needs_clarification: the trigger is ambiguous. cannot_fulfill: nothing to order or ordering is not possible.",
  ),
  orders: z
    .array(
      z.object({
        supplierId: z.number().int().positive(),
        lines: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantity: z.number().positive(),
              reason: z.string().describe("Why this quantity and this supplier."),
            }),
          )
          .min(1),
      }),
    )
    .optional()
    .describe("One entry per supplier."),
  skipped: z
    .array(z.object({ productId: z.number().int().positive(), reason: z.string() }))
    .optional()
    .describe(
      "Short products you deliberately did not order, e.g. already covered by an open purchase order.",
    ),
  summary: z.string().optional(),
  questions: z.array(z.string()).optional(),
  reason: z.string().optional(),
});
export type ProcurementSubmission = z.infer<typeof procurementSubmissionSchema>;

// ---------------------------------------------------------------------------
// Agent results
// ---------------------------------------------------------------------------

export type AgentResult<P> =
  | { status: "proposed"; proposals: P[]; skipped: { productId: number; reason: string }[] }
  | { status: "needs_clarification"; questions: string[]; reason: string }
  | { status: "cannot_fulfill"; reason: string }
  | { status: "failed"; reason: string };

export type QuotingResult = AgentResult<QuotationProposal>;
export type ProcurementResult = AgentResult<PurchaseProposal>;
