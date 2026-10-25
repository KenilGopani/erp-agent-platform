import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage } from "ai";
import type { z } from "zod";
import { toAiTools, type AnyToolDef } from "../tools/define";
import type { Issue } from "./issues";

export type AgentEvent =
  | {
      type: "tool";
      name: string;
      input: unknown;
      output?: unknown;
      error?: string;
      latencyMs: number;
    }
  | { type: "step"; step: number; inputTokens: number; outputTokens: number }
  | { type: "submit"; accepted: boolean; issues: Issue[] };

export type SubmitOutcome<R> = { accepted: true; result: R } | { accepted: false; issues: Issue[] };

export interface RunAgentOptions<S, R> {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  tools: AnyToolDef[];
  submitSchema: z.ZodType<S>;
  submitDescription: string;
  /** Validates and converts the model's submission. Rejections are fed back to the model. */
  handleSubmission: (submission: S) => Promise<SubmitOutcome<R>>;
  /** Hard cap on model calls per attempt. */
  maxSteps?: number;
  /** How many times to remind a model that stopped without submitting. */
  maxNudges?: number;
  timeoutMs?: number;
  onEvent?: (event: AgentEvent) => void;
}

export type RunOutcome<R> = { ok: true; result: R } | { ok: false; reason: string };

/**
 * Runs one agent: the model calls read tools freely and finishes by calling
 * `submit_result`. The submission is validated by code; rejections go back to
 * the model as a tool result so it can fix and resubmit. There is no write
 * tool in this loop, by construction.
 */
export async function runAgent<S, R>(options: RunAgentOptions<S, R>): Promise<RunOutcome<R>> {
  const { maxSteps = 14, maxNudges = 2, timeoutMs = 120_000, onEvent } = options;
  let accepted: R | undefined;
  let done = false;

  const tools = {
    ...toAiTools(options.tools, (e) => onEvent?.({ type: "tool", ...e })),
    submit_result: tool({
      description: options.submitDescription,
      inputSchema: options.submitSchema,
      execute: async (input: S) => {
        const outcome = await options.handleSubmission(input);
        onEvent?.({
          type: "submit",
          accepted: outcome.accepted,
          issues: outcome.accepted ? [] : outcome.issues,
        });
        if (outcome.accepted) {
          accepted = outcome.result;
          done = true;
          return { accepted: true };
        }
        return {
          accepted: false,
          issues: outcome.issues,
          instruction: "Fix these issues and call submit_result again, or choose another outcome.",
        };
      },
    }),
  };

  let messages: ModelMessage[] = [{ role: "user", content: options.prompt }];
  for (let attempt = 0; attempt <= maxNudges; attempt++) {
    try {
      const res = await generateText({
        model: options.model,
        instructions: options.instructions,
        messages,
        tools,
        stopWhen: [isStepCount(maxSteps), () => done],
        timeout: timeoutMs,
        temperature: 0,
        onStepEnd: (step) =>
          onEvent?.({
            type: "step",
            step: step.stepNumber,
            inputTokens: step.usage.inputTokens ?? 0,
            outputTokens: step.usage.outputTokens ?? 0,
          }),
      });
      if (done && accepted !== undefined) return { ok: true, result: accepted };
      messages = [
        ...messages,
        ...res.response.messages,
        {
          role: "user",
          content:
            "You have not submitted a result. Finish by calling submit_result with outcome propose, needs_clarification or cannot_fulfill.",
        },
      ];
    } catch (err) {
      return {
        ok: false,
        reason: `Model call failed: ${describeError(err)}`,
      };
    }
  }
  return { ok: false, reason: "The model did not produce a valid submission." };
}

/** Provider errors often have an empty message; fall back to the HTTP status and a short body excerpt. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as Error & { statusCode?: number; responseBody?: string };
  if (e.message) return e.message;
  const detail = typeof e.responseBody === "string" ? e.responseBody.slice(0, 200) : "";
  return [e.name, e.statusCode ? `HTTP ${e.statusCode}` : "", detail].filter(Boolean).join(" ");
}
