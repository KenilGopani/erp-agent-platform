import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("applies defaults for non-secret values", () => {
    const env = parseEnv({ ODOO_PASSWORD: "secret" });
    expect(env.ODOO_URL).toBe("http://localhost:8069");
    expect(env.ODOO_DB).toBe("odoo");
    expect(env.ODOO_USERNAME).toBe("admin");
  });

  it("fails with a readable message when required values are missing", () => {
    expect(() => parseEnv({})).toThrow(/ODOO_PASSWORD/);
  });

  it("rejects a malformed url", () => {
    expect(() => parseEnv({ ODOO_PASSWORD: "x", ODOO_URL: "not a url" })).toThrow(/ODOO_URL/);
  });
});
