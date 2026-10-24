import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { scriptedModel, type ScriptStep } from "../agents/scripted-model";
import { OdooClient } from "../odoo/client";
import { OdooRepository } from "../odoo/repository";
import { parseEnv } from "../env";
import { WorkflowService, type WorkflowDeps } from "./service";
import { createTestDb, resetTestDb } from "./test-support";

// Real Postgres (app-db), real Odoo, scripted LLM. Needs `docker compose up -d` and a seeded Odoo.
const env = parseEnv(process.env);
const client = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});
const repo = new OdooRepository(client);
const NOW = () => new Date("2026-01-10T00:00:00Z");

let handle: Awaited<ReturnType<typeof createTestDb>>;
const cleanup: { model: string; id: number }[] = [];
const ids: Record<string, number> = {};
let script: ScriptStep[] = [];

const makeService = (overrides: Partial<WorkflowDeps> = {}) =>
  new WorkflowService({
    db: handle.db,
    repo,
    client,
    now: NOW,
    resolveModel: () => scriptedModel(script),
    ...overrides,
  });

beforeAll(async () => {
  handle = await createTestDb(env.DATABASE_URL!);
  for (const sku of ["PLT-BASE-300", "BRK-L-100", "STL-SHT-5.0"])
    ids[sku] = (await repo.findProducts({ sku }))[0]!.id;
  ids.Ironbridge = (await repo.findCustomers("Ironbridge"))[0]!.id;
  ids.Redwood = (await repo.findCustomers("Redwood"))[0]!.id;
});
beforeEach(async () => {
  await resetTestDb(handle.db);
});
afterEach(async () => {
  // Remove drafts created by the test so the Odoo baseline stays pristine.
  for (const { model, id } of cleanup.splice(0)) {
    if (model === "purchase.order") await client.executeKw(model, "button_cancel", [[id]]);
    await client.executeKw(model, "unlink", [[id]]);
  }
});
afterAll(async () => {
  await handle.close();
});

const quoteScript = (qty = 10): ScriptStep[] => [
  {
    tool: "submit_result",
    input: {
      outcome: "propose",
      customerId: ids.Redwood,
      lines: [{ productId: ids["BRK-L-100"], quantity: qty }],
      summary: "brackets",
    },
  },
];

async function proposeQuote(service: WorkflowService, qty = 10) {
  script = quoteScript(qty);
  const run = await service.startRun({
    kind: "quote",
    request: "10 brackets for Redwood",
    model: "x:y",
  });
  const [proposal] = await service.getProposals(run.id);
  return { run, proposal: proposal! };
}

const track = (r: Awaited<ReturnType<WorkflowService["approve"]>>) => {
  if (r.status === "approved" && r.created) cleanup.push({ model: r.odooModel, id: r.odooId });
  return r;
};

describe("run lifecycle", () => {
  it("walks RECEIVED to AWAITING_APPROVAL and stores the proposal and timeline", async () => {
    const service = makeService();
    const { run, proposal } = await proposeQuote(service);
    expect(run.status).toBe("AWAITING_APPROVAL");
    expect(proposal.status).toBe("pending");
    expect(proposal.data).toMatchObject({ kind: "quotation", total: 95 });
    const events = await service.getEvents(run.id);
    const statuses = events
      .filter((e) => e.type === "run.status")
      .map((e) => (e.payload as { to: string }).to);
    expect(statuses).toEqual(["GATHERING", "PROPOSING", "AWAITING_APPROVAL"]);
  });

  it("records clarification and refusal without any proposal", async () => {
    const service = makeService();
    script = [
      {
        tool: "submit_result",
        input: { outcome: "needs_clarification", questions: ["Which Summit?"] },
      },
    ];
    const asked = await service.startRun({ kind: "quote", request: "Summit steel", model: "x:y" });
    expect(asked.status).toBe("NEEDS_CLARIFICATION");
    expect(asked.outcome).toMatchObject({ questions: ["Which Summit?"] });

    script = [
      {
        tool: "submit_result",
        input: { outcome: "cannot_fulfill", reason: "Cannot confirm orders" },
      },
    ];
    const refused = await service.startRun({ kind: "quote", request: "confirm it", model: "x:y" });
    expect(refused.status).toBe("CANNOT_FULFILL");
    expect(await service.getProposals(refused.id)).toHaveLength(0);
  });

  it("fails cleanly when the model errors", async () => {
    const { MockLanguageModelV4 } = await import("ai/test");
    const service = makeService({
      resolveModel: () =>
        new MockLanguageModelV4({
          doGenerate: async () => {
            throw new Error("provider down");
          },
        }),
    });
    const run = await service.startRun({ kind: "quote", request: "x", model: "x:y" });
    expect(run.status).toBe("FAILED");
    expect(run.failureReason).toContain("provider down");
  });
});

describe("approval executor", () => {
  it("writes a draft quotation and completes the run", async () => {
    const service = makeService();
    const { run, proposal } = await proposeQuote(service);
    const result = track(await service.approve(proposal.id, { actor: "kenil" }));
    expect(result).toMatchObject({ status: "approved", created: true, odooModel: "sale.order" });

    const [order] = await client.read<{
      state: string;
      amount_untaxed: number;
      client_order_ref: string;
    }>(
      "sale.order",
      [(result as { odooId: number }).odooId],
      ["state", "amount_untaxed", "client_order_ref"],
    );
    expect(order).toMatchObject({ state: "draft", amount_untaxed: 95 });
    expect(order!.client_order_ref).toMatch(/^CPL-/);
    expect((await service.getRun(run.id))!.status).toBe("COMPLETED");
    const [approval] = await service.getApprovals(proposal.id);
    expect(approval).toMatchObject({
      decision: "approved",
      actor: "kenil",
      odooModel: "sale.order",
    });
  });

  it("creates one record when approved twice", async () => {
    const service = makeService();
    const { proposal } = await proposeQuote(service);
    const first = track(await service.approve(proposal.id, { actor: "a" }));
    const second = track(await service.approve(proposal.id, { actor: "a" }));
    expect(first.status).toBe("approved");
    expect(second).toMatchObject({ status: "approved", created: false });
    expect((second as { odooId: number }).odooId).toBe((first as { odooId: number }).odooId);
    expect(await service.getApprovals(proposal.id)).toHaveLength(1);
  });

  it("creates one record under concurrent double-clicks", async () => {
    const service = makeService();
    const { proposal } = await proposeQuote(service);
    const results = (
      await Promise.all([1, 2, 3].map(() => service.approve(proposal.id, { actor: "a" })))
    ).map(track);
    const approved = results.filter((r) => r.status === "approved");
    expect(approved.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(approved.map((r) => (r as { odooId: number }).odooId));
    expect(ids.size).toBe(1);
    const refs = await client.searchRead("sale.order", [["client_order_ref", "like", "CPL-"]], {
      fields: ["id"],
    });
    expect(refs).toHaveLength(1);
  });

  it("asks for re-approval when prices changed since the proposal", async () => {
    const service = makeService();
    const { proposal } = await proposeQuote(service);
    const [product] = await client.read<{ product_tmpl_id: [number, string]; list_price: number }>(
      "product.product",
      [ids["BRK-L-100"]!],
      ["product_tmpl_id", "list_price"],
    );
    const tmpl = product!.product_tmpl_id[0];
    try {
      await client.write("product.template", [tmpl], { list_price: 20 });
      const stale = await service.approve(proposal.id, { actor: "a" });
      expect(stale.status).toBe("stale");
      expect(stale.status === "stale" && stale.changes.some((c) => c.field === "unitPrice")).toBe(
        true,
      );
      expect(await client.searchCount("sale.order", [["client_order_ref", "like", "CPL-"]])).toBe(
        0,
      );

      // after reviewing the new numbers the human can approve
      const ok = track(await service.approve(proposal.id, { actor: "a" }));
      expect(ok.status).toBe("approved");
    } finally {
      await client.write("product.template", [tmpl], { list_price: product!.list_price });
    }
  });

  it("applies edits, re-validates them and logs the diff", async () => {
    const service = makeService();
    const { proposal } = await proposeQuote(service, 10);

    const preview = await service.previewEdit(proposal.id, {
      lines: [{ productId: ids["BRK-L-100"]!, quantity: 20, unitPrice: 9 }],
    });
    expect(preview.ok && preview.proposal.total).toBe(180);

    const result = track(
      await service.approve(proposal.id, {
        actor: "kenil",
        edits: { lines: [{ productId: ids["BRK-L-100"]!, quantity: 20, unitPrice: 9 }] },
      }),
    );
    expect(result.status).toBe("approved");
    const [approval] = await service.getApprovals(proposal.id);
    expect(approval!.edits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "quantity", from: 10, to: 20 }),
        expect.objectContaining({ field: "unitPrice", to: 9 }),
      ]),
    );
    const [line] = await client.searchRead<{ product_uom_qty: number; price_unit: number }>(
      "sale.order.line",
      [["order_id", "=", (result as { odooId: number }).odooId]],
      { fields: ["product_uom_qty", "price_unit"] },
    );
    expect(line).toMatchObject({ product_uom_qty: 20, price_unit: 9 });
    // the original agent output is preserved for audit
    const [row] = await service.getProposals(proposal.runId);
    expect((row!.originalData as { total: number }).total).toBe(95);
    expect((row!.data as { total: number }).total).toBe(180);
  });

  it("blocks invalid edits and writes nothing", async () => {
    const service = makeService();
    const { proposal } = await proposeQuote(service);
    const result = await service.approve(proposal.id, {
      actor: "a",
      edits: { lines: [{ productId: ids["BRK-L-100"]!, quantity: -5 }] },
    });
    expect(result).toMatchObject({ status: "blocked" });
    expect(await client.searchCount("sale.order", [["client_order_ref", "like", "CPL-"]])).toBe(0);
    expect((await service.getProposals(proposal.runId))[0]!.status).toBe("pending");
  });

  it("recovers from a transient Odoo failure without duplicating", async () => {
    let failNextCreate = true;
    const flaky = new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === "create") {
          return async (...args: Parameters<OdooClient["create"]>) => {
            if (failNextCreate) {
              failNextCreate = false;
              throw new Error("connection reset");
            }
            return target.create(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const service = makeService({ client: flaky });
    const { run, proposal } = await proposeQuote(service);

    const failed = await service.approve(proposal.id, { actor: "a" });
    expect(failed.status).toBe("write_failed");
    expect(JSON.stringify(failed)).not.toContain("connection reset");
    expect((await service.getRun(run.id))!.status).toBe("AWAITING_APPROVAL");
    expect(await service.getApprovals(proposal.id)).toHaveLength(0);

    const retried = track(await service.approve(proposal.id, { actor: "a" }));
    expect(retried.status).toBe("approved");
    expect(await client.searchCount("sale.order", [["client_order_ref", "like", "CPL-"]])).toBe(1);
  });

  it("rejecting records the decision and never touches Odoo", async () => {
    const service = makeService();
    const { run, proposal } = await proposeQuote(service);
    expect(await service.reject(proposal.id, { actor: "kenil", reason: "wrong customer" })).toEqual(
      { status: "rejected" },
    );
    expect((await service.getRun(run.id))!.status).toBe("REJECTED");
    const [a] = await service.getApprovals(proposal.id);
    expect(a).toMatchObject({ decision: "rejected", reason: "wrong customer" });
    expect(await service.approve(proposal.id, { actor: "a" })).toMatchObject({
      status: "not_pending",
    });
    expect(await client.searchCount("sale.order", [["client_order_ref", "like", "CPL-"]])).toBe(0);
  });
});

describe("procurement runs", () => {
  it("handles several proposals independently and completes after all are decided", async () => {
    const service = makeService();
    const prices = await repo.getSupplierPrices(ids["STL-SHT-5.0"]!);
    const midwest = prices.find((p) => p.supplierName.startsWith("Midwest"))!;
    const apex = prices.find((p) => p.supplierName.startsWith("Apex"))!;
    script = [
      {
        tool: "submit_result",
        input: {
          outcome: "propose",
          orders: [
            {
              supplierId: midwest.supplierId,
              lines: [{ productId: ids["STL-SHT-5.0"], quantity: 66, reason: "fast" }],
            },
            {
              supplierId: apex.supplierId,
              lines: [{ productId: ids["STL-SHT-5.0"], quantity: 66, reason: "alt" }],
            },
          ],
        },
      },
    ];
    const run = await service.startRun({
      kind: "procure",
      request: "check shortages",
      model: "x:y",
    });
    const [first, second] = await service.getProposals(run.id);

    const a = track(await service.approve(first!.id, { actor: "a" }));
    expect(a).toMatchObject({ status: "approved", odooModel: "purchase.order" });
    expect((await service.getRun(run.id))!.status).toBe("AWAITING_APPROVAL");

    await service.reject(second!.id, { actor: "a" });
    expect((await service.getRun(run.id))!.status).toBe("COMPLETED");
    const [po] = await client.read<{ state: string }>(
      "purchase.order",
      [(a as { odooId: number }).odooId],
      ["state"],
    );
    expect(po!.state).toBe("draft");
  });
});
