"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const MODES = {
  quote: {
    label: "Quote request",
    help: "Paste a customer request. The assistant finds the customer and products, checks stock and proposes a draft quotation.",
    placeholder:
      "Ironbridge Fabrication needs 40 base plates 300x300 and 20 DN100 flanges by end of month.",
  },
  procure: {
    label: "Check shortages",
    help: "Find products running short against open orders and propose purchase orders. Add a product or leave the default.",
    placeholder: "Check shortages",
  },
} as const;

export function RequestForm() {
  const router = useRouter();
  const [kind, setKind] = useState<keyof typeof MODES>("quote");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textId = useId();
  const mode = MODES[kind];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          request: text.trim() || (kind === "procure" ? "Check shortages" : ""),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start the run.");
      router.push(`/runs/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the run.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Request type"
        className="inline-flex rounded-md border border-border bg-muted p-1"
      >
        {(Object.keys(MODES) as (keyof typeof MODES)[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "cursor-pointer rounded px-3 py-1.5 text-sm font-medium",
              kind === k ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MODES[k].label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <label htmlFor={textId} className="block text-sm font-medium">
          {kind === "quote" ? "Customer request" : "What should be checked? (optional)"}
        </label>
        <Textarea
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode.placeholder}
          maxLength={2000}
        />
        <p className="text-sm text-muted-foreground">{mode.help}</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" disabled={busy || (kind === "quote" && !text.trim())}>
        {busy ? "Starting…" : kind === "quote" ? "Prepare quotation" : "Check shortages"}
      </Button>
    </form>
  );
}
