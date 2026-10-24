import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { runProcurementAgent } from "../agents/procurement/agent";
import { buildPurchaseProposal } from "../agents/procurement/build";
import type { Issue } from "../agents/issues";
import {
  purchaseProposalSchema,
  quotationProposalSchema,
  type Proposal,
  type PurchaseProposal,
  type QuotationProposal,
} from "../agents/proposals";
import { runQuotingAgent } from "../agents/quoting/agent";
import { buildQuotation } from "../agents/quoting/build";
import type { AgentEvent } from "../agents/runner";
import type { Db } from "../db/client";
import { approvals, proposals, runEvents, runs, type ProposalRow, type Run } from "../db/schema";
import type { OdooClient } from "../odoo/client";
import type { OdooRepository } from "../odoo/repository";
import { createDraftPurchaseOrder, createDraftQuotation } from "../tools/write/drafts";
import { assertTransition, type RunState } from "./state";

export interface WorkflowDeps {
  db: Db;
  repo: OdooRepository;
  /** Used only by the approval executor; agents never receive it. */
  client: OdooClient;
  resolveModel: (spec: string) => LanguageModel;
  now?: () => Date;
}

export type RunKind = "quote" | "procure";

/** What a human may change before approving. `remove` drops the line. */
export interface Edits {
  lines: { productId: number; quantity?: number; unitPrice?: number; remove?: boolean }[];
}

export interface LineChange {
  productId: number;
  field: "quantity" | "unitPrice" | "removed" | "availability";
  from: unknown;
  to: unknown;
}

export type ApprovalResult =
  | { status: "approved"; odooModel: string; odooId: number; odooName: string; created: boolean }
  | { status: "stale"; changes: LineChange[]; message: string }
  | { status: "blocked"; issues: Issue[] }
  | { status: "write_failed"; message: string }
  | { status: "in_progress" }
  | { status: "not_pending"; current: string };

type Built = { ok: true; proposal: Proposal } | { ok: false; violations: Issue[] };

export class WorkflowService {
  constructor(private readonly deps: WorkflowDeps) {}

  private now = () => this.deps.now?.() ?? new Date();

  // --- runs -----------------------------------------------------------------

  async createRun(input: { kind: RunKind; request: string; model: string }): Promise<Run> {
    const [run] = await this.deps.db
      .insert(runs)
      .values({ ...input, status: "RECEIVED" })
      .returning();
    await this.addEvent(run!.id, "run.created", { kind: input.kind, model: input.model });
    return run!;
  }

  /** Runs the agent for an existing run and records the outcome. Never throws. */
  async executeRun(
    runId: string,
    options: { onEvent?: (e: AgentEvent) => void } = {},
  ): Promise<Run> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    try {
      await this.setStatus(runId, "GATHERING");
      // events are written in order through a queue and flushed before the next status change
      let queue: Promise<unknown> = Promise.resolve();
      const onEvent = (e: AgentEvent) => {
        queue = queue
          .then(() =>
            this.addEvent(runId, `agent.${e.type}`, e as unknown as Record<string, unknown>),
          )
          .catch(() => {});
        options.onEvent?.(e);
      };
      const agentOptions = {
        request: run.request,
        repo: this.deps.repo,
        model: this.deps.resolveModel(run.model),
        now: this.deps.now,
        onEvent,
      };
      const result =
        run.kind === "quote"
          ? await runQuotingAgent(agentOptions)
          : await runProcurementAgent(agentOptions);

      await queue;

      switch (result.status) {
        case "proposed": {
          await this.setStatus(runId, "PROPOSING");
          for (const p of result.proposals) {
            await this.deps.db.insert(proposals).values({
              runId,
              kind: p.kind,
              data: p,
              originalData: p,
            });
          }
          await this.setOutcome(runId, { skipped: result.skipped });
          await this.setStatus(runId, "AWAITING_APPROVAL");
          break;
        }
        case "needs_clarification":
          await this.setOutcome(runId, { questions: result.questions, reason: result.reason });
          await this.setStatus(runId, "NEEDS_CLARIFICATION");
          break;
        case "cannot_fulfill":
          await this.setOutcome(runId, { reason: result.reason });
          await this.setStatus(runId, "CANNOT_FULFILL");
          break;
        case "failed":
          await this.fail(runId, result.reason);
          break;
      }
    } catch (err) {
      await this.fail(runId, err instanceof Error ? err.message : String(err));
    }
    return (await this.getRun(runId))!;
  }

  async startRun(
    input: { kind: RunKind; request: string; model: string },
    onEvent?: (e: AgentEvent) => void,
  ) {
    const run = await this.createRun(input);
    return this.executeRun(run.id, { onEvent });
  }

  // --- approval -------------------------------------------------------------

  /** Re-prices a proposal with edits applied, without saving anything. */
  async previewEdit(proposalId: string, edits: Edits) {
    const row = await this.requireProposal(proposalId);
    const built = await this.rebuild(row, edits);
    if (!built.ok) return { ok: false as const, issues: built.violations };
    return {
      ok: true as const,
      proposal: built.proposal,
      changes: diffProposals(row.data as Proposal, built.proposal),
    };
  }

  /**
   * The only path to an Odoo write. Re-validates against current Odoo state,
   * claims the proposal atomically, writes a draft with an idempotency key, and
   * records the outcome. Calling it twice, or concurrently, creates one record.
   */
  async approve(
    proposalId: string,
    input: { actor: string; edits?: Edits },
  ): Promise<ApprovalResult> {
    const row = await this.requireProposal(proposalId);
    if (row.status === "approved") return this.existingApproval(proposalId);
    if (row.status === "writing") return { status: "in_progress" };
    if (row.status !== "pending") return { status: "not_pending", current: row.status };

    const hasEdits = !!input.edits?.lines.length;
    const built = await this.rebuild(row, input.edits);
    if (!built.ok) {
      await this.deps.db
        .update(proposals)
        .set({
          lastError: built.violations.map((v) => v.message).join("; "),
          updatedAt: this.now(),
        })
        .where(eq(proposals.id, proposalId));
      await this.addEvent(row.runId, "approval.blocked", { proposalId, issues: built.violations });
      return { status: "blocked", issues: built.violations };
    }

    const changes = diffProposals(row.data as Proposal, built.proposal);
    if (!hasEdits && changes.length > 0) {
      // Odoo moved since the human reviewed it: show the new numbers and ask again.
      await this.saveProposal(row, built.proposal);
      await this.addEvent(row.runId, "approval.stale", { proposalId, changes });
      return {
        status: "stale",
        changes,
        message:
          "Prices or stock changed since this proposal was made. Review the updated numbers and approve again.",
      };
    }

    // Atomic claim: exactly one caller moves pending -> writing.
    const claimed = await this.deps.db
      .update(proposals)
      .set({
        status: "writing",
        data: built.proposal,
        version: row.version + (hasEdits ? 1 : 0),
        updatedAt: this.now(),
      })
      .where(and(eq(proposals.id, proposalId), eq(proposals.status, "pending")))
      .returning();
    if (claimed.length === 0) {
      const current = await this.requireProposal(proposalId);
      return current.status === "approved"
        ? this.existingApproval(proposalId)
        : { status: "in_progress" };
    }
    const claimedRow = claimed[0]!;

    await this.moveRun(row.runId, "WRITING");
    const key = idempotencyKey(row.runId, proposalId, claimedRow.version, built.proposal);
    try {
      const draft =
        built.proposal.kind === "quotation"
          ? await createDraftQuotation(this.deps.client, built.proposal, key)
          : await createDraftPurchaseOrder(this.deps.client, built.proposal, key);
      const odooModel = built.proposal.kind === "quotation" ? "sale.order" : "purchase.order";

      await this.deps.db.transaction(async (tx) => {
        await tx.insert(approvals).values({
          proposalId,
          decision: "approved",
          actor: input.actor,
          edits: hasEdits ? changes : null,
          idempotencyKey: key,
          odooModel,
          odooId: draft.odooId,
          odooName: draft.name,
        });
        await tx
          .update(proposals)
          .set({ status: "approved", lastError: null, updatedAt: this.now() })
          .where(eq(proposals.id, proposalId));
      });
      await this.addEvent(row.runId, "approval.written", {
        proposalId,
        odooModel,
        odooId: draft.odooId,
        odooName: draft.name,
        created: draft.created,
        actor: input.actor,
      });
      await this.settleRun(row.runId);
      return {
        status: "approved",
        odooModel,
        odooId: draft.odooId,
        odooName: draft.name,
        created: draft.created,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Back to pending: the idempotency key makes a retry safe even if Odoo did create the record.
      await this.deps.db
        .update(proposals)
        .set({ status: "pending", lastError: message, updatedAt: this.now() })
        .where(eq(proposals.id, proposalId));
      await this.addEvent(row.runId, "approval.write_failed", { proposalId, message });
      await this.moveRun(row.runId, "AWAITING_APPROVAL");
      return {
        status: "write_failed",
        message: "The draft could not be created in Odoo. Nothing was confirmed; you can retry.",
      };
    }
  }

  async reject(proposalId: string, input: { actor: string; reason?: string }) {
    const row = await this.requireProposal(proposalId);
    if (row.status === "rejected") return { status: "rejected" as const };
    if (row.status !== "pending") return { status: "not_pending" as const, current: row.status };
    const claimed = await this.deps.db
      .update(proposals)
      .set({ status: "rejected", updatedAt: this.now() })
      .where(and(eq(proposals.id, proposalId), eq(proposals.status, "pending")))
      .returning();
    if (claimed.length === 0) return { status: "not_pending" as const, current: "changed" };
    await this.deps.db
      .insert(approvals)
      .values({
        proposalId,
        decision: "rejected",
        actor: input.actor,
        reason: input.reason ?? null,
      })
      .onConflictDoNothing();
    await this.addEvent(row.runId, "approval.rejected", {
      proposalId,
      actor: input.actor,
      reason: input.reason,
    });
    await this.settleRun(row.runId);
    return { status: "rejected" as const };
  }

  // --- reads ----------------------------------------------------------------

  async getRun(id: string) {
    const [run] = await this.deps.db.select().from(runs).where(eq(runs.id, id));
    return run ?? null;
  }

  async listRuns(limit = 50) {
    return this.deps.db.select().from(runs).orderBy(desc(runs.createdAt)).limit(limit);
  }

  async getProposals(runId: string) {
    return this.deps.db
      .select()
      .from(proposals)
      .where(eq(proposals.runId, runId))
      .orderBy(asc(proposals.createdAt));
  }

  async getEvents(runId: string, afterId = 0) {
    return this.deps.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), sql`${runEvents.id} > ${afterId}`))
      .orderBy(asc(runEvents.id));
  }

  async getApprovals(proposalId: string) {
    return this.deps.db.select().from(approvals).where(eq(approvals.proposalId, proposalId));
  }

  // --- internals ------------------------------------------------------------

  private async requireProposal(id: string): Promise<ProposalRow> {
    const [row] = await this.deps.db.select().from(proposals).where(eq(proposals.id, id));
    if (!row) throw new Error(`Proposal ${id} not found`);
    return row;
  }

  private async existingApproval(proposalId: string): Promise<ApprovalResult> {
    const [a] = await this.getApprovals(proposalId);
    if (a?.decision === "approved" && a.odooId && a.odooModel && a.odooName) {
      return {
        status: "approved",
        odooModel: a.odooModel,
        odooId: a.odooId,
        odooName: a.odooName,
        created: false,
      };
    }
    return { status: "in_progress" };
  }

  private async saveProposal(row: ProposalRow, proposal: Proposal) {
    await this.deps.db
      .update(proposals)
      .set({ data: proposal, version: row.version + 1, updatedAt: this.now() })
      .where(eq(proposals.id, row.id));
  }

  /** Rebuilds a stored proposal from its ids and quantities against current Odoo state. */
  private async rebuild(row: ProposalRow, edits?: Edits): Promise<Built> {
    const now = this.deps.now;
    const byId = new Map(edits?.lines.map((e) => [e.productId, e]));

    if (row.kind === "quotation") {
      const p = quotationProposalSchema.parse(row.data);
      const lines = p.lines.filter((l) => !byId.get(l.productId)?.remove);
      const overrides: Record<number, number> = {};
      for (const l of lines) {
        const price = byId.get(l.productId)?.unitPrice ?? l.priceOverride;
        if (price !== null && price !== undefined) overrides[l.productId] = price;
      }
      return buildQuotation(
        {
          outcome: "propose",
          customerId: p.customer.id,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: byId.get(l.productId)?.quantity ?? l.quantity,
            extraDiscountPct: l.extraDiscountPct || undefined,
            note: l.note ?? undefined,
          })),
          summary: p.summary,
          assumptions: p.assumptions,
          openQuestions: p.openQuestions,
          confidence: p.confidence,
        },
        { repo: this.deps.repo, now, unitPriceOverrides: overrides },
      );
    }

    const p = purchaseProposalSchema.parse(row.data);
    const lines = p.lines.filter((l) => !byId.get(l.productId)?.remove);
    const overrides: Record<number, number> = {};
    for (const l of lines) {
      const price = byId.get(l.productId)?.unitPrice ?? l.priceOverride;
      if (price !== null && price !== undefined) overrides[l.productId] = price;
    }
    return buildPurchaseProposal(
      {
        supplierId: p.supplier.id,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: byId.get(l.productId)?.quantity ?? l.quantity,
          reason: l.reason,
        })),
      },
      { repo: this.deps.repo, now, unitPriceOverrides: overrides },
    );
  }

  private async setOutcome(runId: string, outcome: Record<string, unknown>) {
    await this.deps.db
      .update(runs)
      .set({ outcome, updatedAt: this.now() })
      .where(eq(runs.id, runId));
  }

  private async fail(runId: string, reason: string) {
    await this.deps.db
      .update(runs)
      .set({ failureReason: reason, updatedAt: this.now() })
      .where(eq(runs.id, runId));
    await this.addEvent(runId, "run.failed", { reason });
    await this.setStatus(runId, "FAILED");
  }

  private async setStatus(runId: string, to: RunState) {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    assertTransition(run.status as RunState, to);
    await this.deps.db
      .update(runs)
      .set({ status: to, updatedAt: this.now() })
      .where(eq(runs.id, runId));
    await this.addEvent(runId, "run.status", { from: run.status, to });
  }

  /** Moves a run along a legal path, hopping through intermediate states when needed. */
  private async moveRun(runId: string, to: RunState) {
    const run = await this.getRun(runId);
    const from = run!.status as RunState;
    if (from === to) return;
    if (from === "AWAITING_APPROVAL" && to === "WRITING") await this.setStatus(runId, "APPROVED");
    await this.setStatus(runId, to);
  }

  /** After a decision: completed or rejected once every proposal is decided, otherwise still awaiting. */
  private async settleRun(runId: string) {
    const rows = await this.getProposals(runId);
    if (rows.some((r) => r.status === "writing")) return;
    const pending = rows.some((r) => r.status === "pending");
    const anyApproved = rows.some((r) => r.status === "approved");
    const run = await this.getRun(runId);
    const from = run!.status as RunState;
    if (pending) {
      if (from === "WRITING") await this.setStatus(runId, "AWAITING_APPROVAL");
      return;
    }
    await this.moveRun(runId, anyApproved ? "COMPLETED" : "REJECTED");
  }

  private async addEvent(runId: string, type: string, payload: Record<string, unknown>) {
    await this.deps.db.insert(runEvents).values({ runId, type, payload });
  }
}

/** Stable key for one version of one proposal: the same approval always maps to the same Odoo record. */
export function idempotencyKey(
  runId: string,
  proposalId: string,
  version: number,
  proposal: Proposal,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([runId, proposalId, version, canonical(proposal)]))
    .digest("hex")
    .slice(0, 20);
  return `CPL-${digest}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

type AnyLine = QuotationProposal["lines"][number] | PurchaseProposal["lines"][number];

/** What differs between two versions of a proposal: quantities, prices, removed lines, availability. */
export function diffProposals(before: Proposal, after: Proposal): LineChange[] {
  const changes: LineChange[] = [];
  const b = new Map((before.lines as AnyLine[]).map((l) => [l.productId, l]));
  const a = new Map((after.lines as AnyLine[]).map((l) => [l.productId, l]));
  for (const [id, line] of b) {
    const next = a.get(id);
    if (!next) {
      changes.push({ productId: id, field: "removed", from: line.quantity, to: null });
      continue;
    }
    if (line.quantity !== next.quantity)
      changes.push({ productId: id, field: "quantity", from: line.quantity, to: next.quantity });
    if (line.unitPrice !== next.unitPrice)
      changes.push({ productId: id, field: "unitPrice", from: line.unitPrice, to: next.unitPrice });
    if ("fulfillment" in line && "fulfillment" in next && line.fulfillment !== next.fulfillment) {
      changes.push({
        productId: id,
        field: "availability",
        from: line.fulfillment,
        to: next.fulfillment,
      });
    }
  }
  return changes;
}
