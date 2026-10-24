import { describe, expect, it, vi } from "vitest";
import { OdooClient } from "./client";
import { OdooAuthError, OdooTransportError } from "./errors";

const ok = (result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
const fault = (name: string, message: string) =>
  new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "x", data: { name, message } } }),
    {
      status: 200,
    },
  );

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return new OdooClient({
    url: "http://odoo.test/",
    db: "db",
    username: "admin",
    password: "pw",
    maxRetries: 2,
    sleep: async () => {},
    fetch: fetchMock as unknown as typeof fetch,
  });
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("OdooClient", () => {
  it("authenticates once and reuses the uid", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(7))
      .mockImplementation(async () => ok([{ id: 1 }]));
    const c = makeClient(f);
    await c.searchRead("res.partner", [], { fields: ["name"] });
    await c.searchRead("res.partner");
    const methods = f.mock.calls.map((call) => bodyOf(call).params.method);
    expect(methods).toEqual(["authenticate", "execute_kw", "execute_kw"]);
    expect(f.mock.calls[0]![0]).toBe("http://odoo.test/jsonrpc");
    expect(bodyOf(f.mock.calls[1]!).params.args).toEqual([
      "db",
      7,
      "pw",
      "res.partner",
      "search_read",
      [[]],
      { fields: ["name"] },
    ]);
  });

  it("throws OdooAuthError when credentials are rejected", async () => {
    const f = vi.fn().mockImplementation(async () => ok(false));
    await expect(makeClient(f).authenticate()).rejects.toBeInstanceOf(OdooAuthError);
  });

  it("surfaces Odoo faults as OdooError without retrying", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(2))
      .mockImplementation(async () => fault("odoo.exceptions.ValidationError", "bad value"));
    await expect(makeClient(f).read("res.partner", [1])).rejects.toMatchObject({
      name: "OdooError",
      message: "bad value",
      odooName: "odoo.exceptions.ValidationError",
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("retries reads on transient errors with backoff", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(2))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok([{ id: 1 }]));
    const c = new OdooClient({
      url: "http://odoo.test",
      db: "db",
      username: "a",
      password: "p",
      baseDelayMs: 100,
      sleep,
      fetch: f as unknown as typeof fetch,
    });
    await expect(c.searchRead("res.partner")).resolves.toEqual([{ id: 1 }]);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([100, 200]);
  });

  it("gives up after maxRetries and throws a transport error", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(2))
      .mockImplementation(async () => new Response("", { status: 502 }));
    await expect(makeClient(f).searchRead("res.partner")).rejects.toBeInstanceOf(
      OdooTransportError,
    );
    expect(f).toHaveBeenCalledTimes(1 + 3);
  });

  it("never retries create, so a lost response cannot duplicate a record", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(2))
      .mockImplementation(async () => new Response("", { status: 503 }));
    await expect(makeClient(f).create("sale.order", { partner_id: 1 })).rejects.toBeInstanceOf(
      OdooTransportError,
    );
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("normalizes create results to a single id", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok(2))
      .mockImplementation(async () => ok([42]));
    await expect(makeClient(f).create("sale.order", {})).resolves.toBe(42);
  });

  it("converts aborts into transport errors", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const f = vi.fn().mockRejectedValue(timeout);
    const c = makeClient(f);
    await expect(c.version()).rejects.toThrow(/timed out/);
  });

  it("skips the network for read with no ids", async () => {
    const f = vi.fn();
    await expect(makeClient(f).read("res.partner", [])).resolves.toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
