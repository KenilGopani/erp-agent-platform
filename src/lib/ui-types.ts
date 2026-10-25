import type { PurchaseProposal, QuotationProposal } from "./agents/proposals";
import type { LineChange } from "./workflow/service";

/** Shapes returned by the JSON API, as the browser sees them (dates are strings). */
export interface RunView {
  id: string;
  kind: "quote" | "procure";
  request: string;
  model: string;
  status: string;
  outcome: {
    questions?: string[];
    reason?: string;
    skipped?: { productId: number; reason: string }[];
  } | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalView {
  decision: "approved" | "rejected";
  actor: string;
  reason: string | null;
  edits: LineChange[] | null;
  odooModel: string | null;
  odooId: number | null;
  odooName: string | null;
  odooUrl: string | null;
}

export type ProposalView = {
  id: string;
  status: "pending" | "writing" | "approved" | "rejected";
  version: number;
  lastError: string | null;
  approval: ApprovalView | null;
} & (
  | { kind: "quotation"; data: QuotationProposal }
  | { kind: "purchase_order"; data: PurchaseProposal }
);

export interface RunDetail {
  run: RunView;
  proposals: ProposalView[];
}

export interface EventView {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  at: string;
}
