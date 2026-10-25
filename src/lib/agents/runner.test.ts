import { describe, expect, it } from "vitest";
import { describeError } from "./runner";

describe("describeError", () => {
  it("uses the message when there is one", () => {
    expect(describeError(new Error("rate limited"))).toBe("rate limited");
  });

  it("falls back to status and a body excerpt for empty provider messages", () => {
    const err = Object.assign(new Error(""), {
      name: "AI_APICallError",
      statusCode: 404,
      responseBody: '{"detail":"not found"}',
    });
    expect(describeError(err)).toBe('AI_APICallError HTTP 404 {"detail":"not found"}');
  });

  it("stringifies non-errors", () => {
    expect(describeError("boom")).toBe("boom");
  });
});
