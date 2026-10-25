import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { scriptedModel, type ScriptStep } from "../agents/scripted-model";
import { parseEnv } from "../env";
import { OdooClient } from "../odoo/client";
import { OdooRepository } from "../odoo/repository";
import { WorkflowService } from "../workflow/service";
import { createTestDb, resetTestDb } from "../workflow/test-support";
import { createApi } from "./api";

const env = parseEnv(process.env);
const client = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});
const repo = new OdooRepository(client);

let handle: Awaited<ReturnType<typeof createTestDb>>;
let script: ScriptStep[] = [];
const ids: Record<string, number> = {};
const created: { model: string; id: number }[] = [];

const service = () =>
  new WorkflowService({
    db: handle.db,
    repo,
    client,
    now: () => new Date("2026-01-10T00:00:00Z"),
    resolveModel: () => scriptedModel(script),
  });
const api = (over: { defaultModel?: string | undefined } = { defaultModel: "x:y" }) =>
  createApi({ service: service(), odooUrl: env.ODOO_URL, pollMs: 20, ...over });

const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function waitForStatus(a: ReturnType<typeof api>, id: string, wanted: string) {
  for (let i = 0; i < 100; i++) {
    const res = await a.getRun(id);
    const body = (await res.json()) as { run: { status: string } };
    if (body.run.status === wanted) return body;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`run never reached ${wanted}`);
}

beforeAll(async () => {
  handle = await createTestDb(env.DATABASE_URL!);
  ids.brk = (await repo.findProducts({ sku: "BRK-L-100" }))[0]!.id;
  ids.redwood = (await repo.findCustomers("Redwood"))[0]!.id;
});
beforeEach(async () => {
  await resetTestDb(handle.db);
  script = [
    {
      tool: "submit_result",
      input: {
        outcome: "propose",
        customerId: ids.redwood,
        lines: [{ productId: ids.brk, quantity: 10 }],
      },
    },
  ];
});
afterEach(async () => {
  for (const { model, id } of created.splice(0)) await client.executeKw(model, "unlink", [[id]]);
});
afterAll(async () => {
  await handle.close();
});

describe("POST /api/runs", () => {
  it("validates input with readable messages", async () => {
    const a = api();
    const empty = await a.createRun(post({ kind: "quote", request: "  " }));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Describe what you need." });
    expect((await a.createRun(post({ kind: "other", request: "x" }))).status).toBe(400);
    expect((await a.createRun(post("not json"))).status).toBe(400);
  });

  it("explains when no model is configured", async () => {
    const res = await api({ defaultModel: undefined }).createRun(
      post({ kind: "quote", request: "x" }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/AGENT_MODEL/);
  });

  it("starts a run in the background and exposes the proposal", async () => {
    const a = api();
    const res = await a.createRun(post({ kind: "quote", request: "10 brackets for Redwood" }));
    expect(res.status).toBe(202);
    const { id } = await res.json();
    const detail = await waitForStatus(a, id, "AWAITING_APPROVAL");
    expect(detail).toMatchObject({
      proposals: [{ kind: "quotation", status: "pending", data: { total: 95 } }],
    });
  });
});

describe("approval endpoints", () => {
  async function pending() {
    const a = api();
    const { id } = await (await a.createRun(post({ kind: "quote", request: "x" }))).json();
    const detail = (await waitForStatus(a, id, "AWAITING_APPROVAL")) as unknown as {
      proposals: { id: string }[];
    };
    return { a, id, proposalId: detail.proposals[0]!.id };
  }

  it("approves once, returns an Odoo link, and stays idempotent", async () => {
    const { a, proposalId } = await pending();
    const first = await a.approve(proposalId, post({ actor: "kenil" }));
    const body = await first.json();
    expect(first.status).toBe(200);
    expect(body).toMatchObject({ status: "approved", created: true, odooModel: "sale.order" });
    expect(body.odooUrl).toContain(`id=${body.odooId}&model=sale.order`);
    created.push({ model: "sale.order", id: body.odooId });

    const again = await (await a.approve(proposalId, post({}))).json();
    expect(again).toMatchObject({ status: "approved", created: false, odooId: body.odooId });
  });

  it("previews edits without saving and validates the schema", async () => {
    const { a, proposalId } = await pending();
    const preview = await (
      await a.preview(
        proposalId,
        post({ edits: { lines: [{ productId: ids.brk, quantity: 20 }] } }),
      )
    ).json();
    expect(preview).toMatchObject({ ok: true, proposal: { total: 190 } });

    const bad = await a.approve(
      proposalId,
      post({ edits: { lines: [{ productId: ids.brk, quantity: 0 }] } }),
    );
    expect(bad.status).toBe(400); // schema rejects non-positive quantity before reaching Odoo
    const hugeQuantity = await (
      await a.preview(
        proposalId,
        post({ edits: { lines: [{ productId: ids.brk, quantity: 100000 }] } }),
      )
    ).json();
    expect(hugeQuantity).toMatchObject({ ok: true }); // quantity limits are not enforced yet (guardrails deferred)
  });

  it("rejects and then refuses further approval", async () => {
    const { a, id, proposalId } = await pending();
    const rejected = await a.reject(proposalId, post({ reason: "not needed" }));
    expect(await rejected.json()).toEqual({ status: "rejected" });
    await waitForStatus(a, id, "REJECTED");
    expect(await (await a.approve(proposalId, post({}))).json()).toMatchObject({
      status: "not_pending",
    });
  });

  it("returns 404 without internals for unknown ids", async () => {
    const a = api();
    const missing = "00000000-0000-0000-0000-000000000000";
    expect((await a.getRun(missing)).status).toBe(404);
    const res = await a.approve(missing, post({}));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toMatch(/at .*\.ts|stack|drizzle|select /i);
  });
});

describe("GET /api/runs/[id]/events", () => {
  it("streams the timeline as server-sent events and ends when the run rests", async () => {
    const a = api();
    const { id } = await (await a.createRun(post({ kind: "quote", request: "x" }))).json();
    await waitForStatus(a, id, "AWAITING_APPROVAL");

    const res = await a.events(id, new Request("http://test/events"));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: run");
    expect(text).toContain('"type":"run.status"');
    expect(text).toContain("event: status");
    expect(text.indexOf("GATHERING")).toBeLessThan(text.indexOf("AWAITING_APPROVAL"));
  });

  it("resumes after the last event id", async () => {
    const a = api();
    const { id } = await (await a.createRun(post({ kind: "quote", request: "x" }))).json();
    await waitForStatus(a, id, "AWAITING_APPROVAL");
    const events = await service().getEvents(id);
    const last = events.at(-1)!.id;
    const text = await (
      await a.events(
        id,
        new Request("http://test/events", { headers: { "last-event-id": String(last) } }),
      )
    ).text();
    expect(text).not.toContain("event: run");
  });

  it("404s for unknown runs", async () => {
    expect(
      (await api().events("00000000-0000-0000-0000-000000000000", new Request("http://t"))).status,
    ).toBe(404);
  });
});
