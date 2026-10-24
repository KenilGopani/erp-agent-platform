import { tool, type Tool } from "ai";
import type { z } from "zod";

/** Expected, recoverable failure (not found, bad input). The model sees the message and can adapt. */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** Framework-independent tool definition: Zod in, Zod out, plain async function. */
export interface ToolDef<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute: (input: I) => Promise<O>;
}

/** A tool of any input/output type, for lists of heterogeneous tools. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef = ToolDef<any, any>;

export function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return {
    ...def,
    // Validate every output so a mapper bug cannot leak malformed data to the model.
    execute: async (input) => def.outputSchema.parse(await def.execute(input)),
  };
}

export type ToolFailure = { error: { code: string; message: string } };

/** Hook for observers (step recorder). */
export type ToolObserver = (event: {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  latencyMs: number;
}) => void;

/** Adapts definitions to AI SDK tools. ToolErrors become `{ error }` results the model can read. */
export function toAiTools(defs: AnyToolDef[], observe?: ToolObserver): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const def of defs) {
    out[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown) => {
        const started = performance.now();
        try {
          const output = await def.execute(input);
          observe?.({ name: def.name, input, output, latencyMs: performance.now() - started });
          return output;
        } catch (err) {
          const failure: ToolFailure =
            err instanceof ToolError
              ? { error: { code: err.code, message: err.message } }
              : { error: { code: "tool_failed", message: `${def.name} failed unexpectedly.` } };
          observe?.({
            name: def.name,
            input,
            error: err instanceof Error ? err.message : String(err),
            latencyMs: performance.now() - started,
          });
          return failure;
        }
      },
    });
  }
  return out;
}
