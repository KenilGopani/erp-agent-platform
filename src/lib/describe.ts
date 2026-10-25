import type { EventView } from "./ui-types";

export const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Received",
  GATHERING: "Gathering information",
  PROPOSING: "Preparing proposal",
  AWAITING_APPROVAL: "Needs your approval",
  APPROVED: "Approved",
  WRITING: "Creating draft in Odoo",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  NEEDS_CLARIFICATION: "Needs clarification",
  CANNOT_FULFILL: "Cannot fulfil",
  FAILED: "Failed",
};

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS_TONE: Record<string, Tone> = {
  RECEIVED: "neutral",
  GATHERING: "info",
  PROPOSING: "info",
  AWAITING_APPROVAL: "warning",
  APPROVED: "info",
  WRITING: "info",
  COMPLETED: "success",
  REJECTED: "neutral",
  NEEDS_CLARIFICATION: "warning",
  CANNOT_FULFILL: "neutral",
  FAILED: "danger",
};

export const IN_PROGRESS = new Set(["RECEIVED", "GATHERING", "PROPOSING", "APPROVED", "WRITING"]);

const TOOL_LABEL: Record<string, (input: Record<string, unknown>) => string> = {
  find_customer: (i) => `Looking up customer “${i.query}”`,
  find_products: (i) => `Searching products for “${i.query ?? i.sku}”`,
  get_inventory: () => "Checking stock levels",
  get_open_demand: () => "Checking open customer orders",
  get_open_purchase_orders: () => "Checking incoming purchase orders",
  get_supplier_prices: () => "Comparing supplier prices",
  get_pricing: () => "Calculating customer price",
  find_shortages: () => "Scanning for shortages",
  get_replenishment_options: () => "Calculating replenishment options",
};

function toolResult(name: string, output: unknown): string {
  const o = (output ?? {}) as Record<string, unknown>;
  if (o.error) return `problem: ${(o.error as { message?: string }).message ?? "failed"}`;
  const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).length : null);
  if (name === "find_customer" || name === "find_products") {
    const n = list("matches");
    return n === 0 ? "no match" : `${n} match${n === 1 ? "" : "es"}`;
  }
  if (name === "find_shortages") return `${list("shortages")} short`;
  if (name === "get_supplier_prices") return `${list("suppliers")} supplier(s)`;
  if (name === "get_inventory") return `${o.available} free, forecast ${o.forecasted}`;
  return "done";
}

/** One-line, plain-language description of a timeline event, or null to hide it. */
export function describeEvent(e: EventView): { text: string; tone: Tone } | null {
  const p = e.payload;
  switch (e.type) {
    case "run.created":
      return { text: "Request received", tone: "neutral" };
    case "run.status": {
      const to = p.to as string;
      return { text: STATUS_LABEL[to] ?? to, tone: STATUS_TONE[to] ?? "neutral" };
    }
    case "agent.tool": {
      const name = p.name as string;
      const label = TOOL_LABEL[name]?.((p.input ?? {}) as Record<string, unknown>) ?? name;
      return {
        text: `${label} — ${toolResult(name, p.output ?? (p.error ? { error: { message: p.error } } : null))}`,
        tone: "neutral",
      };
    }
    case "agent.submit": {
      if (p.accepted) return { text: "Proposal validated against Odoo", tone: "success" };
      const issues = (p.issues as { message: string }[]) ?? [];
      return {
        text: `Proposal needed changes: ${issues.map((i) => i.message).join(" ")}`,
        tone: "warning",
      };
    }
    case "agent.step":
      return null;
    case "approval.written":
      return { text: `Draft ${p.odooName} created in Odoo`, tone: "success" };
    case "approval.rejected":
      return { text: "Proposal rejected", tone: "neutral" };
    case "approval.stale":
      return { text: "Prices or stock changed; re-approval requested", tone: "warning" };
    case "approval.blocked":
      return { text: "Approval blocked by validation", tone: "warning" };
    case "approval.write_failed":
      return { text: "Draft could not be created; nothing was changed in Odoo", tone: "danger" };
    case "run.failed":
      return { text: `Run failed: ${p.reason}`, tone: "danger" };
    default:
      return { text: e.type, tone: "neutral" };
  }
}

export const KIND_LABEL = { quote: "Quote request", procure: "Shortage check" } as const;

export const FULFILLMENT_LABEL = {
  in_stock: { text: "In stock", tone: "success" },
  partial_stock: { text: "Partial stock", tone: "warning" },
  out_of_stock: { text: "Out of stock", tone: "danger" },
} as const;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
