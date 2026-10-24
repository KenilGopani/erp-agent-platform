import { MockLanguageModelV4 } from "ai/test";

type ToolCall = { tool: string; input: unknown };
export type ScriptStep = ToolCall | ToolCall[] | { text: string };

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** A deterministic stand-in for an LLM: replays a fixed sequence of tool calls and text. For tests only. */
export function scriptedModel(steps: ScriptStep[]) {
  let n = 0;
  return new MockLanguageModelV4({
    doGenerate: steps.map((step) => {
      if ("text" in step) {
        return {
          content: [{ type: "text" as const, text: step.text }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      const calls = Array.isArray(step) ? step : [step];
      return {
        content: calls.map((c) => ({
          type: "tool-call" as const,
          toolCallId: `call-${++n}`,
          toolName: c.tool,
          input: JSON.stringify(c.input),
        })),
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      };
    }),
  });
}
