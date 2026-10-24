export const RUN_STATES = [
  "RECEIVED",
  "GATHERING",
  "PROPOSING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "WRITING",
  "COMPLETED",
  "REJECTED",
  "NEEDS_CLARIFICATION",
  "CANNOT_FULFILL",
  "FAILED",
] as const;
export type RunState = (typeof RUN_STATES)[number];

const TRANSITIONS: Record<RunState, readonly RunState[]> = {
  RECEIVED: ["GATHERING", "FAILED"],
  GATHERING: ["PROPOSING", "NEEDS_CLARIFICATION", "CANNOT_FULFILL", "FAILED"],
  PROPOSING: ["AWAITING_APPROVAL", "GATHERING", "NEEDS_CLARIFICATION", "CANNOT_FULFILL", "FAILED"],
  AWAITING_APPROVAL: ["APPROVED", "REJECTED", "FAILED"],
  APPROVED: ["WRITING", "AWAITING_APPROVAL", "FAILED"],
  // a failed write returns to AWAITING_APPROVAL so the human can retry safely
  WRITING: ["COMPLETED", "AWAITING_APPROVAL", "FAILED"],
  COMPLETED: [],
  REJECTED: [],
  NEEDS_CLARIFICATION: [],
  CANNOT_FULFILL: [],
  FAILED: [],
};

export const TERMINAL_STATES: readonly RunState[] = [
  "COMPLETED",
  "REJECTED",
  "NEEDS_CLARIFICATION",
  "CANNOT_FULFILL",
  "FAILED",
];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RunState,
    readonly to: RunState,
  ) {
    super(`Invalid run transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export const canTransition = (from: RunState, to: RunState) => TRANSITIONS[from].includes(to);

export function assertTransition(from: RunState, to: RunState) {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Mermaid source for docs/architecture.md, generated from the table so the two cannot drift. */
export function toMermaid(): string {
  const lines = ["stateDiagram-v2", "  [*] --> RECEIVED"];
  for (const from of RUN_STATES)
    for (const to of TRANSITIONS[from]) lines.push(`  ${from} --> ${to}`);
  for (const s of TERMINAL_STATES) lines.push(`  ${s} --> [*]`);
  return lines.join("\n");
}
