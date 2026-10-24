import { createApi, type Api } from "./api";
import { createDb } from "../db/client";
import { getEnv } from "../env";
import { resolveModel } from "../models/registry";
import { OdooClient } from "../odoo/client";
import { OdooRepository } from "../odoo/repository";
import { WorkflowService } from "../workflow/service";

interface Container {
  api: Api;
  service: WorkflowService;
}

// Survives dev-server module reloads so we do not open a new connection pool on every edit.
const globalForServices = globalThis as unknown as { __copilot?: Container };

export function getServices(): Container {
  if (!globalForServices.__copilot) {
    const env = getEnv();
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const client = new OdooClient({
      url: env.ODOO_URL,
      db: env.ODOO_DB,
      username: env.ODOO_USERNAME,
      password: env.ODOO_PASSWORD,
    });
    const service = new WorkflowService({
      db: createDb(env.DATABASE_URL).db,
      repo: new OdooRepository(client),
      client,
      resolveModel: (spec) => resolveModel(spec),
    });
    globalForServices.__copilot = {
      service,
      api: createApi({
        service,
        defaultModel: process.env.AGENT_MODEL || undefined,
        odooUrl: env.ODOO_URL,
      }),
    };
  }
  return globalForServices.__copilot;
}
