import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind", { enum: ["quote", "procure"] }).notNull(),
  request: text("request").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull(),
  /** Agent outcome details that are not proposals: clarification questions, refusal reason. */
  outcome: jsonb("outcome"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    kind: text("kind", { enum: ["quotation", "purchase_order"] }).notNull(),
    /** Current proposal, including any human edits and re-validation updates. */
    data: jsonb("data").notNull(),
    /** Proposal exactly as the agent produced it. */
    originalData: jsonb("original_data").notNull(),
    status: text("status").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("proposals_run_idx").on(t.runId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id),
    decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
    actor: text("actor").notNull(),
    reason: text("reason"),
    /** What the human changed before approving: [{ path, from, to }]. */
    edits: jsonb("edits"),
    idempotencyKey: text("idempotency_key"),
    odooModel: text("odoo_model"),
    odooId: integer("odoo_id"),
    odooName: text("odoo_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // exactly one decision per proposal, which is what makes double approval harmless
  (t) => [uniqueIndex("approvals_proposal_unique").on(t.proposalId)],
);

/** Progress events, shown live in the UI and kept as a per-run timeline. */
export const runEvents = pgTable(
  "run_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("run_events_run_idx").on(t.runId, t.id)],
);

export type Run = typeof runs.$inferSelect;
export type ProposalRow = typeof proposals.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
