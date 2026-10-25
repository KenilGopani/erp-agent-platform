"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { FULFILLMENT_LABEL } from "@/lib/describe";
import type { LineChange } from "@/lib/workflow/service";
import type { ProposalView } from "@/lib/ui-types";
import { money, qty } from "@/lib/utils";

type EditState = Record<number, { quantity: string; unitPrice: string; remove: boolean }>;
type Notice = {
  tone: "danger" | "warning" | "info" | "success";
  text: string;
  items?: string[];
} | null;

const FIELD_LABEL: Record<LineChange["field"], string> = {
  quantity: "quantity",
  unitPrice: "unit price",
  removed: "line removed",
  availability: "availability",
};

function describeChanges(changes: LineChange[], names: Map<number, string>) {
  return changes.map(
    (c) =>
      `${names.get(c.productId) ?? c.productId}: ${FIELD_LABEL[c.field]} ${String(c.from)} → ${String(c.to)}`,
  );
}

export function ProposalCard({
  proposal,
  onChanged,
}: {
  proposal: ProposalView;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<EditState>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<{ total: number; items: string[] } | null>(null);

  const p = proposal.data;
  const names = new Map(p.lines.map((l) => [l.productId, l.sku ?? l.name]));
  const pending = proposal.status === "pending";
  const warnings = p.flags.filter((f) => f.severity === "warn");

  const editPayload = () => ({
    lines: p.lines.flatMap((l) => {
      const e = edits[l.productId];
      if (!e) return [];
      const quantity = Number(e.quantity);
      const unitPrice = Number(e.unitPrice);
      return [
        {
          productId: l.productId,
          remove: e.remove || undefined,
          quantity: quantity !== l.quantity && quantity > 0 ? quantity : undefined,
          unitPrice: unitPrice !== l.unitPrice && unitPrice > 0 ? unitPrice : undefined,
        },
      ].filter((x) => x.remove || x.quantity !== undefined || x.unitPrice !== undefined);
    }),
  });

  async function call(path: string, body: unknown) {
    const res = await fetch(`/api/proposals/${proposal.id}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function doPreview() {
    setBusy(true);
    setNotice(null);
    const { body } = await call("preview", { edits: editPayload() });
    setBusy(false);
    if (body.ok) {
      setPreview({ total: body.proposal.total, items: describeChanges(body.changes, names) });
    } else {
      setPreview(null);
      setNotice({
        tone: "danger",
        text: "These edits are not valid.",
        items: (body.issues ?? []).map((i: { message: string }) => i.message),
      });
    }
  }

  async function approve() {
    setBusy(true);
    setNotice(null);
    try {
      const withEdits = editing ? editPayload() : undefined;
      const { body } = await call("approve", {
        edits: withEdits?.lines.length ? withEdits : undefined,
      });
      switch (body.status) {
        case "approved":
          setEditing(false);
          onChanged();
          break;
        case "stale":
          setNotice({
            tone: "warning",
            text: body.message,
            items: describeChanges(body.changes, names),
          });
          setEditing(false);
          onChanged();
          break;
        case "blocked":
          setNotice({
            tone: "danger",
            text: "This cannot be created as it stands.",
            items: body.issues.map((i: { message: string }) => i.message),
          });
          break;
        case "write_failed":
          setNotice({ tone: "danger", text: body.message });
          break;
        case "in_progress":
          setNotice({ tone: "info", text: "This approval is already being processed." });
          onChanged();
          break;
        default:
          setNotice({
            tone: "danger",
            text: body.error ?? "Something went wrong. Nothing was changed in Odoo.",
          });
      }
    } catch {
      setNotice({
        tone: "danger",
        text: "Could not reach the server. Nothing was changed in Odoo.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    await call("reject", { reason: reason.trim() || undefined });
    setBusy(false);
    setRejecting(false);
    onChanged();
  }

  function startEdit() {
    setEdits(
      Object.fromEntries(
        p.lines.map((l) => [
          l.productId,
          { quantity: String(l.quantity), unitPrice: String(l.unitPrice), remove: false },
        ]),
      ),
    );
    setPreview(null);
    setNotice(null);
    setEditing(true);
  }

  const setEdit = (id: number, patch: Partial<EditState[number]>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
    setPreview(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {p.kind === "quotation"
              ? `Quotation for ${p.customer.name}`
              : `Purchase order to ${p.supplier.name}`}
          </h2>
          <div className="flex items-center gap-2">
            {proposal.status === "approved" && <Badge tone="success">Draft created</Badge>}
            {proposal.status === "rejected" && <Badge>Rejected</Badge>}
            {proposal.status === "writing" && <Badge tone="info">Creating draft…</Badge>}
            {pending && <Badge tone="warning">Awaiting approval</Badge>}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {p.kind === "quotation"
            ? `${p.customer.paymentTerms ?? "No payment terms"} · ${p.customer.pricelist ?? "Standard pricing"}`
            : `Expected delivery ${p.expectedDelivery}`}
        </p>
        {p.summary && <p className="text-sm">{p.summary}</p>}
      </CardHeader>

      <CardBody className="space-y-5">
        {proposal.approval?.odooUrl && (
          <Alert tone="success">
            Draft <strong>{proposal.approval.odooName}</strong> was created in Odoo by{" "}
            {proposal.approval.actor}. It is a draft only; nothing has been confirmed.{" "}
            <a
              className="font-medium underline"
              href={proposal.approval.odooUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open in Odoo
            </a>
            {proposal.approval.edits && proposal.approval.edits.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {describeChanges(proposal.approval.edits, names).map((t) => (
                  <li key={t}>Edited: {t}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        {proposal.status === "rejected" && (
          <Alert tone="info">
            Rejected{proposal.approval?.reason ? `: ${proposal.approval.reason}` : ""}. Nothing was
            created in Odoo.
          </Alert>
        )}
        {proposal.lastError && pending && (
          <Alert tone="warning">Last attempt: {proposal.lastError}</Alert>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Proposed lines</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="py-2 pl-3 font-medium">
                  {p.kind === "quotation" ? "Availability" : "Arrival"}
                </th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => {
                const e = edits[l.productId];
                const removed = editing && e?.remove;
                return (
                  <tr
                    key={l.productId}
                    className={`border-b border-border align-top ${removed ? "opacity-40" : ""}`}
                  >
                    <td className="py-3 pr-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.sku}</div>
                      {"reason" in l && l.reason && (
                        <div className="mt-1 text-xs text-muted-foreground">{l.reason}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editing && e ? (
                        <Input
                          aria-label={`Quantity for ${l.name}`}
                          type="number"
                          min="0"
                          step="any"
                          className="ml-auto h-8 w-24 text-right"
                          value={e.quantity}
                          onChange={(ev) => setEdit(l.productId, { quantity: ev.target.value })}
                        />
                      ) : (
                        <>
                          {qty(l.quantity)}{" "}
                          <span className="text-xs text-muted-foreground">{l.uom}</span>
                          {"moq" in l && (
                            <div className="text-xs text-muted-foreground">MOQ {qty(l.moq)}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editing && e ? (
                        <Input
                          aria-label={`Unit price for ${l.name}`}
                          type="number"
                          min="0"
                          step="0.01"
                          className="ml-auto h-8 w-24 text-right"
                          value={e.unitPrice}
                          onChange={(ev) => setEdit(l.productId, { unitPrice: ev.target.value })}
                        />
                      ) : (
                        <>
                          {money(l.unitPrice)}
                          {"discountPct" in l && l.discountPct > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {l.discountPct}% off {money(l.listPrice)}
                            </div>
                          )}
                          {l.priceOverride !== null && (
                            <div className="text-xs text-warning">manually set</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">{money(l.lineTotal)}</td>
                    <td className="py-3 pl-3">
                      {"fulfillment" in l ? (
                        <>
                          <Badge tone={FULFILLMENT_LABEL[l.fulfillment].tone}>
                            {FULFILLMENT_LABEL[l.fulfillment].text}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {qty(l.availableQty)} free
                            {l.fulfillment !== "in_stock" &&
                              l.estimatedLeadTimeDays !== null &&
                              ` · ~${l.estimatedLeadTimeDays} days to restock`}
                          </div>
                        </>
                      ) : (
                        <>
                          {l.expectedArrival}
                          <div className="text-xs text-muted-foreground">
                            {l.leadTimeDays} day lead time
                          </div>
                        </>
                      )}
                      {editing && e && (
                        <label className="mt-2 flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={e.remove}
                            onChange={(ev) => setEdit(l.productId, { remove: ev.target.checked })}
                          />
                          Remove line
                        </label>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-right font-medium">
                  Total
                </td>
                <td className="pt-3 text-right text-base font-semibold">
                  {money(preview?.total ?? p.total)}
                </td>
                <td className="pt-3 pl-3 text-xs text-muted-foreground">
                  {preview ? "with your edits" : p.currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {warnings.length > 0 && (
          <Alert tone="warning">
            <p className="font-medium">Worth a look</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((f, i) => (
                <li key={i}>{f.message}</li>
              ))}
            </ul>
          </Alert>
        )}

        {p.kind === "quotation" && (p.assumptions.length > 0 || p.openQuestions.length > 0) && (
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            {p.assumptions.length > 0 && (
              <div>
                <h3 className="mb-1 font-medium">Assumptions</h3>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {p.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {p.openQuestions.length > 0 && (
              <div>
                <h3 className="mb-1 font-medium">Open questions</h3>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {p.openQuestions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {preview && preview.items.length > 0 && (
          <Alert tone="info">
            <p className="font-medium">Your edits</p>
            <ul className="mt-1 list-disc pl-5">
              {preview.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Alert>
        )}
        {notice && (
          <Alert tone={notice.tone}>
            {notice.text}
            {notice.items && (
              <ul className="mt-1 list-disc pl-5">
                {notice.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}

        {pending && (
          <div className="space-y-3 border-t border-border pt-4">
            {rejecting ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor={`reason-${proposal.id}`}>
                  Reason (optional)
                </label>
                <Textarea
                  id={`reason-${proposal.id}`}
                  className="min-h-16"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="danger" onClick={reject} disabled={busy}>
                    Confirm reject
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="success" onClick={approve} disabled={busy}>
                  {busy ? "Working…" : editing ? "Approve with edits" : "Approve and create draft"}
                </Button>
                {editing ? (
                  <>
                    <Button variant="outline" onClick={doPreview} disabled={busy}>
                      Preview edits
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                      Cancel edit
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={startEdit} disabled={busy}>
                    Edit
                  </Button>
                )}
                <Button
                  variant="danger"
                  className="ml-auto"
                  onClick={() => setRejecting(true)}
                  disabled={busy}
                >
                  Reject
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Approving creates a <strong>draft</strong> in Odoo. Nothing is confirmed or sent to
              anyone.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
