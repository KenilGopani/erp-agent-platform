export type StepType = "llm" | "tool" | "validation" | "retry" | "write" | "error";

export interface TraceStep {
  index: number;
  type: StepType;
  name: string;
  startedAt: string;
  latencyMs: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** null when the model has no entry in the price table. */
  costUsd?: number | null;
}

export type NewStep = Omit<TraceStep, "index">;

/** Receives every LLM call, tool call, validation and retry. Phase 3 persists these to Postgres. */
export interface StepRecorder {
  record(step: NewStep): void | Promise<void>;
}

export class MemoryRecorder implements StepRecorder {
  readonly steps: TraceStep[] = [];

  record(step: NewStep): void {
    this.steps.push({ ...step, index: this.steps.length });
  }

  totals() {
    const llm = this.steps.filter((s) => s.type === "llm");
    const costs = llm.map((s) => s.costUsd);
    return {
      steps: this.steps.length,
      llmCalls: llm.length,
      inputTokens: sum(llm.map((s) => s.inputTokens ?? 0)),
      outputTokens: sum(llm.map((s) => s.outputTokens ?? 0)),
      // unknown if any call used an unpriced model
      costUsd:
        costs.length > 0 && costs.every((c) => typeof c === "number")
          ? sum(costs as number[])
          : null,
      latencyMs: sum(this.steps.map((s) => s.latencyMs)),
    };
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
