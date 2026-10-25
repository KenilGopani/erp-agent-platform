// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalView } from "@/lib/ui-types";
import { ProposalCard } from "./proposal-card";

const quotation: ProposalView = {
  id: "p1",
  kind: "quotation",
  status: "pending",
  version: 1,
  lastError: null,
  approval: null,
  data: {
    kind: "quotation",
    customer: { id: 7, name: "Acme Corp", paymentTerms: "30 Days", pricelist: "Gold" },
    lines: [
      {
        productId: 1,
        sku: "BRK-1",
        name: "Bracket",
        uom: "Units",
        quantity: 10,
        listPrice: 100,
        unitPrice: 90,
        discountPct: 10,
        lineTotal: 900,
        availableQty: 4,
        fulfillment: "partial_stock",
        estimatedLeadTimeDays: 14,
        note: null,
        extraDiscountPct: 0,
        priceOverride: null,
      },
    ],
    total: 900,
    currency: "USD",
    summary: "10 brackets",
    assumptions: ["Gold pricing"],
    openQuestions: ["Wait 2 weeks?"],
    confidence: "medium",
    flags: [{ code: "insufficient_stock", severity: "warn", message: "BRK-1: only 4 free" }],
  },
};

const respond = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ProposalCard", () => {
  it("shows the numbers a plant manager needs and states that approval only creates a draft", () => {
    render(<ProposalCard proposal={quotation} onChanged={() => {}} />);
    expect(screen.getByText("Quotation for Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("$900.00", { selector: "td.font-medium" })).toBeInTheDocument();
    expect(screen.getByText("Partial stock")).toBeInTheDocument();
    expect(screen.getByText(/only 4 free/)).toBeInTheDocument();
    expect(screen.getByText("Wait 2 weeks?")).toBeInTheDocument();
    expect(screen.getByText(/creates a/i)).toHaveTextContent(/draft/);
    expect(screen.getByRole("button", { name: "Approve and create draft" })).toBeEnabled();
  });

  it("approves through the API and reports back", async () => {
    fetchMock.mockImplementation(() =>
      respond(200, { status: "approved", odooId: 5, odooName: "S00005" }),
    );
    const onChanged = vi.fn();
    render(<ProposalCard proposal={quotation} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve and create draft" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proposals/p1/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({});
  });

  it("explains a stale proposal instead of writing", async () => {
    fetchMock.mockImplementation(() =>
      respond(409, {
        status: "stale",
        message: "Prices or stock changed since this proposal was made.",
        changes: [{ productId: 1, field: "unitPrice", from: 90, to: 85 }],
      }),
    );
    render(<ProposalCard proposal={quotation} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve and create draft" }));
    const alert = await screen.findByText(/Prices or stock changed/);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/BRK-1: unit price 90 → 85/)).toBeInTheDocument();
  });

  it("surfaces a failed write without exposing details, and keeps approval available", async () => {
    fetchMock.mockImplementation(() =>
      respond(502, {
        status: "write_failed",
        message: "The draft could not be created in Odoo. Nothing was confirmed; you can retry.",
      }),
    );
    render(<ProposalCard proposal={quotation} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve and create draft" }));
    expect(await screen.findByText(/could not be created in Odoo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve and create draft" })).toBeEnabled();
  });

  it("sends only changed fields when approving with edits", async () => {
    fetchMock.mockImplementation(() => respond(200, { status: "approved" }));
    render(<ProposalCard proposal={quotation} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const qtyInput = screen.getByLabelText("Quantity for Bracket");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "20");
    await userEvent.click(screen.getByRole("button", { name: "Approve with edits" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      edits: { lines: [{ productId: 1, quantity: 20 }] },
    });
  });

  it("previews edits and shows the recalculated total", async () => {
    fetchMock.mockImplementation(() =>
      respond(200, {
        ok: true,
        proposal: { total: 1800 },
        changes: [{ productId: 1, field: "quantity", from: 10, to: 20 }],
      }),
    );
    render(<ProposalCard proposal={quotation} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const qtyInput = screen.getByLabelText("Quantity for Bracket");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "20");
    await userEvent.click(screen.getByRole("button", { name: "Preview edits" }));
    expect(await screen.findByText("$1,800.00")).toBeInTheDocument();
    expect(screen.getByText("with your edits")).toBeInTheDocument();
  });

  it("rejects with an optional reason", async () => {
    fetchMock.mockImplementation(() => respond(200, { status: "rejected" }));
    const onChanged = vi.fn();
    render(<ProposalCard proposal={quotation} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.type(screen.getByLabelText("Reason (optional)"), "wrong customer");
    await userEvent.click(screen.getByRole("button", { name: "Confirm reject" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ reason: "wrong customer" });
  });

  it("hides actions once a draft exists and links to Odoo", () => {
    const approved: ProposalView = {
      ...quotation,
      status: "approved",
      approval: {
        decision: "approved",
        actor: "kenil",
        reason: null,
        edits: null,
        odooModel: "sale.order",
        odooId: 9,
        odooName: "S00009",
        odooUrl: "http://odoo/web#id=9&model=sale.order&view_type=form",
      },
    };
    render(<ProposalCard proposal={approved} onChanged={() => {}} />);
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open in Odoo" });
    expect(link).toHaveAttribute("href", expect.stringContaining("id=9"));
    expect(
      within(link.closest("[role=status]") as HTMLElement).getByText("S00009"),
    ).toBeInTheDocument();
  });
});
