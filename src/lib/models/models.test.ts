import { describe, expect, it } from "vitest";
import { estimateCost, loadPriceTable } from "./cost";
import { defaultModelSpec, formatModelSpec, parseModelSpec, resolveModel } from "./registry";

describe("model specs", () => {
  it("parses provider and model id", () => {
    expect(parseModelSpec("anthropic:some-model-1")).toEqual({
      provider: "anthropic",
      modelId: "some-model-1",
    });
    expect(formatModelSpec(parseModelSpec("google:a:b"))).toBe("google:a:b");
  });

  it.each(["nope", "azure:x", "openai:", ":x"])("rejects %s", (bad) => {
    expect(() => parseModelSpec(bad)).toThrow(/Invalid model/);
  });

  it("fails early when the api key is missing", () => {
    expect(() => resolveModel("openai:m", {})).toThrow(/OPENAI_API_KEY/);
    expect(() => resolveModel("anthropic:m", {})).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => resolveModel("google:m", {})).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => resolveModel("nvidia:m", {})).toThrow(/NVIDIA_API_KEY/);
  });

  it("builds a model when the key is present", () => {
    const model = resolveModel("anthropic:some-model", { ANTHROPIC_API_KEY: "x" });
    expect(model).toBeTruthy();
  });

  it("builds an nvidia model from provider-qualified ids that contain slashes", () => {
    expect(parseModelSpec("nvidia:meta/llama-3.3-70b-instruct")).toEqual({
      provider: "nvidia",
      modelId: "meta/llama-3.3-70b-instruct",
    });
    expect(resolveModel("nvidia:org/model", { NVIDIA_API_KEY: "x" })).toBeTruthy();
  });

  it("requires AGENT_MODEL for the default", () => {
    expect(() => defaultModelSpec({})).toThrow(/AGENT_MODEL/);
    expect(defaultModelSpec({ AGENT_MODEL: "openai:m" })).toBe("openai:m");
  });
});

describe("cost estimation", () => {
  const prices = loadPriceTable('{"openai:m":{"input":2,"output":10}}');

  it("prices tokens per million", () => {
    expect(
      estimateCost("openai:m", { inputTokens: 1_000_000, outputTokens: 100_000 }, prices),
    ).toBe(3);
  });

  it("returns null for unpriced models instead of guessing", () => {
    expect(estimateCost("openai:other", { inputTokens: 5, outputTokens: 5 }, prices)).toBeNull();
    expect(loadPriceTable(undefined)).toEqual({});
  });

  it("rejects malformed price tables", () => {
    expect(() => loadPriceTable('{"x":{"input":-1,"output":1}}')).toThrow();
  });
});
