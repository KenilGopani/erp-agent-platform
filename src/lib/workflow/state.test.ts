import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  RUN_STATES,
  TERMINAL_STATES,
  toMermaid,
} from "./state";

describe("run state machine", () => {
  it("allows the happy path", () => {
    const path = [
      "RECEIVED",
      "GATHERING",
      "PROPOSING",
      "AWAITING_APPROVAL",
      "APPROVED",
      "WRITING",
      "COMPLETED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });

  it("never lets a model-driven state skip human approval", () => {
    expect(canTransition("PROPOSING", "WRITING")).toBe(false);
    expect(canTransition("PROPOSING", "APPROVED")).toBe(false);
    expect(canTransition("AWAITING_APPROVAL", "WRITING")).toBe(false);
    expect(canTransition("AWAITING_APPROVAL", "COMPLETED")).toBe(false);
  });

  it("makes terminal states final", () => {
    for (const t of TERMINAL_STATES)
      for (const s of RUN_STATES) expect(canTransition(t, s)).toBe(false);
  });

  it("allows a failed write to return to approval for a safe retry", () => {
    expect(canTransition("WRITING", "AWAITING_APPROVAL")).toBe(true);
  });

  it("throws a typed error on illegal transitions", () => {
    expect(() => assertTransition("REJECTED", "WRITING")).toThrow(InvalidTransitionError);
  });

  it("renders every transition to mermaid", () => {
    const diagram = toMermaid();
    expect(diagram).toContain("AWAITING_APPROVAL --> APPROVED");
    expect(diagram.startsWith("stateDiagram-v2")).toBe(true);
  });
});
