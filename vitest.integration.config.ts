import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs against a live Odoo (docker compose up -d odoo). Reads .env.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.integration.test.ts"],
    env: loadEnv(),
    testTimeout: 30_000,
  },
});

function loadEnv(): Record<string, string> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env; rely on the ambient environment
  }
  return Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  );
}
