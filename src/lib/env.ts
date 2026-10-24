import { z } from "zod";

const envSchema = z.object({
  ODOO_URL: z.url().default("http://localhost:8069"),
  ODOO_DB: z.string().min(1).default("odoo"),
  ODOO_USERNAME: z.string().min(1).default("admin"),
  // Password or an Odoo API key.
  ODOO_PASSWORD: z.string().min(1),
  DATABASE_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated environment, parsed once from process.env. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
