import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool, ToolError, toAiTools } from "./define";

const echo = defineTool({
  name: "echo",
  description: "echo",
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ doubled: z.number() }),
  execute: async ({ n }) => ({ doubled: n * 2 }),
});

type Executable = { execute: (input: unknown, options: unknown) => Promise<unknown> };
const run = (tools: ReturnType<typeof toAiTools>, name: string, input: unknown) =>
  (tools[name] as unknown as Executable).execute(input, { toolCallId: "t", messages: [] });

describe("toAiTools", () => {
  it("returns validated output and notifies the observer", async () => {
    const observe = vi.fn();
    const tools = toAiTools([echo], observe);
    expect(await run(tools, "echo", { n: 2 })).toEqual({ doubled: 4 });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ name: "echo", output: { doubled: 4 } }),
    );
  });

  it("turns ToolError into a readable result instead of throwing", async () => {
    const t = defineTool({
      ...echo,
      name: "missing",
      execute: async () => {
        throw new ToolError("not_found", "No such thing.");
      },
    });
    expect(await run(toAiTools([t]), "missing", { n: 1 })).toEqual({
      error: { code: "not_found", message: "No such thing." },
    });
  });

  it("hides unexpected error details from the model but reports them to the observer", async () => {
    const observe = vi.fn();
    const t = defineTool({
      ...echo,
      name: "boom",
      execute: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
    });
    const result = await run(toAiTools([t], observe), "boom", { n: 1 });
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("ECONNREFUSED") }),
    );
  });

  it("rejects output that does not match the schema", async () => {
    const bad = defineTool({
      ...echo,
      name: "bad",
      execute: async () => ({ doubled: "x" }) as unknown as { doubled: number },
    });
    const result = await run(toAiTools([bad]), "bad", { n: 1 });
    expect(result).toEqual({ error: { code: "tool_failed", message: "bad failed unexpectedly." } });
  });
});
