import { OdooAuthError, OdooError, OdooTransportError } from "./errors";

export type OdooDomain = (string | [string, string, unknown])[];

export interface OdooClientConfig {
  url: string;
  db: string;
  username: string;
  /** Password or Odoo API key. */
  password: string;
  timeoutMs?: number;
  /** Retries for idempotent calls on transient errors (attempts = retries + 1). */
  maxRetries?: number;
  baseDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface SearchReadOptions {
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
  context?: Record<string, unknown>;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { message?: string; data?: { name?: string; message?: string; debug?: string } };
}

/** Methods that are safe to repeat. Writes are never retried: a lost response could duplicate them. */
const IDEMPOTENT_METHODS = new Set([
  "search",
  "search_read",
  "search_count",
  "read",
  "fields_get",
  "name_search",
  "read_group",
]);

/**
 * Thin typed wrapper over Odoo's external JSON-RPC API (`/jsonrpc`, supported in 18.0).
 * Callers parse results into domain types (see ./types).
 */
export class OdooClient {
  private readonly cfg: Required<Omit<OdooClientConfig, "fetch" | "sleep">>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private uid: number | undefined;
  private rpcId = 0;

  constructor(config: OdooClientConfig) {
    this.cfg = {
      url: config.url.replace(/\/+$/, ""),
      db: config.db,
      username: config.username,
      password: config.password,
      timeoutMs: config.timeoutMs ?? 15_000,
      maxRetries: config.maxRetries ?? 3,
      baseDelayMs: config.baseDelayMs ?? 250,
    };
    this.fetchImpl = config.fetch ?? fetch;
    this.sleep = config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async version(): Promise<string> {
    const info = (await this.call("common", "version", [], true)) as { server_version: string };
    return info.server_version;
  }

  async authenticate(): Promise<number> {
    if (this.uid !== undefined) return this.uid;
    const uid = await this.call(
      "common",
      "authenticate",
      [this.cfg.db, this.cfg.username, this.cfg.password, {}],
      true,
    );
    if (typeof uid !== "number") throw new OdooAuthError();
    this.uid = uid;
    return uid;
  }

  async executeKw<T = unknown>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const uid = await this.authenticate();
    return (await this.call(
      "object",
      "execute_kw",
      [this.cfg.db, uid, this.cfg.password, model, method, args, kwargs],
      IDEMPOTENT_METHODS.has(method),
    )) as T;
  }

  searchRead<T = Record<string, unknown>>(
    model: string,
    domain: OdooDomain = [],
    options: SearchReadOptions = {},
  ): Promise<T[]> {
    return this.executeKw<T[]>(model, "search_read", [domain], { ...options });
  }

  searchCount(model: string, domain: OdooDomain = []): Promise<number> {
    return this.executeKw<number>(model, "search_count", [domain]);
  }

  read<T = Record<string, unknown>>(model: string, ids: number[], fields?: string[]): Promise<T[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.executeKw<T[]>(model, "read", [ids], fields ? { fields } : {});
  }

  /** Creates one record and returns its id. Not retried. */
  async create(
    model: string,
    values: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<number> {
    const id = await this.executeKw<number | number[]>(
      model,
      "create",
      [values],
      context ? { context } : {},
    );
    return Array.isArray(id) ? id[0]! : id;
  }

  /** Updates records. Not retried. */
  write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return this.executeKw<boolean>(model, "write", [ids, values]);
  }

  private async call(
    service: "common" | "object",
    method: string,
    args: unknown[],
    retryable: boolean,
  ): Promise<unknown> {
    const attempts = retryable ? this.cfg.maxRetries + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await this.sleep(this.cfg.baseDelayMs * 2 ** (attempt - 1));
      try {
        return await this.post(service, method, args);
      } catch (err) {
        lastError = err;
        if (!(err instanceof OdooTransportError)) throw err;
      }
    }
    throw lastError;
  }

  private async post(service: string, method: string, args: unknown[]): Promise<unknown> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: ++this.rpcId,
    });

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.url}/jsonrpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      throw new OdooTransportError(
        timedOut ? `Odoo request timed out after ${this.cfg.timeoutMs}ms` : "Odoo unreachable",
        err,
      );
    }

    if (res.status >= 500) throw new OdooTransportError(`Odoo returned HTTP ${res.status}`);
    if (!res.ok) throw new OdooError(`Odoo returned HTTP ${res.status}`);

    let payload: JsonRpcResponse;
    try {
      payload = (await res.json()) as JsonRpcResponse;
    } catch (err) {
      throw new OdooTransportError("Odoo returned a non-JSON response", err);
    }

    if (payload.error) {
      const data = payload.error.data;
      const message = data?.message ?? payload.error.message ?? "Unknown Odoo error";
      if (data?.name === "odoo.exceptions.AccessDenied") throw new OdooAuthError(message);
      throw new OdooError(message, data?.name, data?.debug);
    }
    return payload.result;
  }
}
