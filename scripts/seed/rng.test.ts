import { describe, expect, it } from "vitest";
import { makeRng } from "./rng";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect(Array.from({ length: 5 }, () => a.int(1, 100))).toEqual(
      Array.from({ length: 5 }, () => b.int(1, 100)),
    );
  });

  it("stays within bounds", () => {
    const r = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});
