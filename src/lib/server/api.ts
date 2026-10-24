import { z } from "zod";
import type { Edits, WorkflowService } from "../workflow/service";
import { TERMINAL_STATES, type RunState } from "../workflow/state";

export interface ApiConfig {
  service: WorkflowService;
  /** "<provider>:<model-id>" used for new runs, or undefined if not configured. */
  defaultModel?: string;
  odooUrl: string;
  odooDb?: string;
  /** Poll interval for the event stream. */
  pollMs?: number;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, message: string) => json({ error: message }, status);

const createRunSchema = z.object({
  kind: z.enum(["quote", "procure"]),
  request: z
    .string()
    .trim()
    .min(1, "Describe what you need.")
    .max(2000, "Keep the request under 2000 characters."),
});

const editsSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive().optional(),
        unitPrice: z.number().positive().optional(),
        remove: z.boolean().optional(),
      }),
    )
    .max(50),
});

const approveSchema = z.object({
  actor: z.string().trim().min(1).max(80).optional(),
  edits: editsSchema.optional(),
});

const rejectSchema = z.object({
  actor: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().max(500).optional(),
});

async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  return parsed.data;
}

/** Transport-independent handlers; the Next.js route files are one-line wrappers around these. */
export function createApi(config: ApiConfig) {
  const { service } = config;

  /** Odoo record link for the UI. */
  const odooLink = (model: string, id: number) =>
    `${config.odooUrl.replace(/\/+$/, "")}/web#id=${id}&model=${model}&view_type=form`;

  async function runDetail(id: string) {
    const run = await service.getRun(id);
    if (!run) return null;
    const rows = await service.getProposals(id);
    const proposals = await Promise.all(
      rows.map(async (p) => {
        const [approval] = await service.getApprovals(p.id);
        return {
          id: p.id,
          kind: p.kind,
          status: p.status,
          version: p.version,
          lastError: p.lastError,
          data: p.data,
          approval: approval
            ? {
                decision: approval.decision,
                actor: approval.actor,
                reason: approval.reason,
                edits: approval.edits,
                odooModel: approval.odooModel,
                odooId: approval.odooId,
                odooName: approval.odooName,
                odooUrl:
                  approval.odooModel && approval.odooId
                    ? odooLink(approval.odooModel, approval.odooId)
                    : null,
              }
            : null,
        };
      }),
    );
    return { run, proposals };
  }

  return {
    async createRun(req: Request) {
      const body = await readJson(req, createRunSchema);
      if (body instanceof Response) return body;
      if (!config.defaultModel) {
        return fail(
          503,
          'No model configured. Set AGENT_MODEL (for example "anthropic:<model-id>") in .env.',
        );
      }
      const run = await service.createRun({ ...body, model: config.defaultModel });
      // Runs continue in the background; the UI follows progress through the event stream.
      void service.executeRun(run.id);
      return json({ id: run.id }, 202);
    },

    async listRuns() {
      const runs = await service.listRuns(50);
      return json({ runs });
    },

    async getRun(id: string) {
      const detail = await runDetail(id);
      return detail ? json(detail) : fail(404, "Run not found.");
    },

    /** Server-sent events: replays stored events, then follows new ones until the run settles. */
    async events(id: string, req: Request) {
      if (!(await service.getRun(id))) return fail(404, "Run not found.");
      const encoder = new TextEncoder();
      const pollMs = config.pollMs ?? 400;
      const lastId =
        Number(
          req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("after") ?? 0,
        ) || 0;

      const stream = new ReadableStream({
        async start(controller) {
          let after = lastId;
          const send = (event: string, data: unknown, eventId?: number) =>
            controller.enqueue(
              encoder.encode(
                `${eventId ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          try {
            while (!req.signal.aborted) {
              const events = await service.getEvents(id, after);
              for (const e of events) {
                after = e.id;
                send("run", { id: e.id, type: e.type, payload: e.payload, at: e.createdAt }, e.id);
              }
              const run = await service.getRun(id);
              const proposalRows = run ? await service.getProposals(id) : [];
              const settled =
                run &&
                (TERMINAL_STATES.includes(run.status as RunState) ||
                  (run.status === "AWAITING_APPROVAL" &&
                    proposalRows.every((p) => p.status !== "writing")));
              send("status", { status: run?.status });
              // AWAITING_APPROVAL is a resting state: the UI reconnects after a decision.
              if (settled && events.length === 0) break;
              await new Promise((r) => setTimeout(r, pollMs));
            }
          } catch {
            send("error", { message: "Event stream interrupted." });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    },

    async approve(proposalId: string, req: Request) {
      const body = await readJson(req, approveSchema);
      if (body instanceof Response) return body;
      try {
        const result = await service.approve(proposalId, {
          actor: body.actor ?? "operator",
          edits: body.edits as Edits | undefined,
        });
        if (result.status === "approved") {
          return json({ ...result, odooUrl: odooLink(result.odooModel, result.odooId) });
        }
        const status =
          result.status === "blocked"
            ? 422
            : result.status === "write_failed"
              ? 502
              : result.status === "stale"
                ? 409
                : 200;
        return json(result, status);
      } catch (err) {
        return fail(
          err instanceof Error && /not found/.test(err.message) ? 404 : 500,
          "Could not process the approval.",
        );
      }
    },

    async preview(proposalId: string, req: Request) {
      const body = await readJson(req, z.object({ edits: editsSchema }));
      if (body instanceof Response) return body;
      try {
        return json(await service.previewEdit(proposalId, body.edits));
      } catch {
        return fail(404, "Proposal not found.");
      }
    },

    async reject(proposalId: string, req: Request) {
      const body = await readJson(req, rejectSchema);
      if (body instanceof Response) return body;
      try {
        return json(
          await service.reject(proposalId, {
            actor: body.actor ?? "operator",
            reason: body.reason,
          }),
        );
      } catch {
        return fail(404, "Proposal not found.");
      }
    },
  };
}

export type Api = ReturnType<typeof createApi>;
