import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createReadTools } from "../tools/read";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("write boundary", () => {
  it("never exposes a write tool to the model", () => {
    const names = createReadTools({ repo: {} as never }).map((t) => t.name);
    expect(names.filter((n) => /create|write|confirm|update|delete|approve/.test(n))).toEqual([]);
  });

  it("keeps agent code from importing the write layer or Odoo mutation methods", () => {
    const agentFiles = walk(path.resolve(__dirname)).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    expect(agentFiles.length).toBeGreaterThan(5);
    for (const file of agentFiles) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/tools\/write/);
      expect(src, file).not.toMatch(/\.(create|write|executeKw)\(/);
    }
  });
});
