import { describe, expect, it } from "vitest";
import { tokenDomain } from "./repository";

describe("tokenDomain", () => {
  it("ORs fields per word and ANDs the words", () => {
    expect(tokenDomain("dn100 flange", ["name", "default_code"])).toEqual([
      "|",
      ["name", "ilike", "dn100"],
      ["default_code", "ilike", "dn100"],
      "|",
      ["name", "ilike", "flange"],
      ["default_code", "ilike", "flange"],
    ]);
  });

  it("handles extra whitespace and empty input", () => {
    expect(tokenDomain("  a  ", ["name"])).toEqual([["name", "ilike", "a"]]);
    expect(tokenDomain("   ", ["name"])).toEqual([]);
  });
});
