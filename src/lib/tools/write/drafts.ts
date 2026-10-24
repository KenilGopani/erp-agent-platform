import { assertAllowedFields } from "../../guardrails/checks";
import type { OdooClient } from "../../odoo/client";
import type { PurchaseProposal, QuotationProposal } from "../../agents/proposals";

export interface DraftResult {
  odooId: number;
  name: string;
  /** false when a record with this idempotency key already existed. */
  created: boolean;
}

/**
 * WRITE TOOLS. Only the approval executor may import this module; agents must
 * never see it (enforced by boundary.test.ts). They create DRAFT records only:
 * Odoo creates sale.order and purchase.order in state "draft", and nothing here
 * confirms them.
 */
export async function createDraftQuotation(
  client: OdooClient,
  proposal: QuotationProposal,
  idempotencyKey: string,
): Promise<DraftResult> {
  const existing = await findByRef(client, "sale.order", "client_order_ref", idempotencyKey);
  if (existing) return { ...existing, created: false };

  const values = {
    partner_id: proposal.customer.id,
    client_order_ref: idempotencyKey,
    note: proposal.summary || false,
    order_line: proposal.lines.map((l) => {
      const line = {
        product_id: l.productId,
        product_uom_qty: l.quantity,
        price_unit: l.unitPrice,
      };
      assertAllowedFields("sale.order.line", line);
      return [0, 0, line];
    }),
  };
  assertAllowedFields("sale.order", values);
  const id = await client.create("sale.order", values);
  return { odooId: id, name: await nameOf(client, "sale.order", id), created: true };
}

export async function createDraftPurchaseOrder(
  client: OdooClient,
  proposal: PurchaseProposal,
  idempotencyKey: string,
): Promise<DraftResult> {
  const existing = await findByRef(client, "purchase.order", "partner_ref", idempotencyKey);
  if (existing) return { ...existing, created: false };

  const values = {
    partner_id: proposal.supplier.id,
    partner_ref: idempotencyKey,
    order_line: proposal.lines.map((l) => {
      const line = {
        product_id: l.productId,
        product_qty: l.quantity,
        price_unit: l.unitPrice,
        date_planned: `${l.expectedArrival} 12:00:00`,
      };
      assertAllowedFields("purchase.order.line", line);
      return [0, 0, line];
    }),
  };
  assertAllowedFields("purchase.order", values);
  const id = await client.create("purchase.order", values);
  return { odooId: id, name: await nameOf(client, "purchase.order", id), created: true };
}

async function findByRef(client: OdooClient, model: string, field: string, key: string) {
  const [row] = await client.searchRead<{ id: number; name: string }>(model, [[field, "=", key]], {
    fields: ["name"],
    limit: 1,
  });
  return row ? { odooId: row.id, name: row.name } : null;
}

async function nameOf(client: OdooClient, model: string, id: number) {
  const [row] = await client.read<{ name: string }>(model, [id], ["name"]);
  return row!.name;
}
