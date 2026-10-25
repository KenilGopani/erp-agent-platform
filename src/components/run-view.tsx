"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProposalCard } from "@/components/proposal-card";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IN_PROGRESS, KIND_LABEL, formatDate } from "@/lib/describe";
import type { EventView, RunDetail } from "@/lib/ui-types";

export function RunView({
  initial,
  initialEvents,
}: {
  initial: RunDetail;
  initialEvents: EventView[];
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [events, setEvents] = useState(initialEvents);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastEventId = useRef(initialEvents.at(-1)?.id ?? 0);
  const { run, proposals } = detail;
  const streaming = IN_PROGRESS.has(run.status);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDetail(await res.json());
      setLoadError(null);
    } catch {
      setLoadError("Could not refresh this run. Check your connection and try again.");
    }
  }, [run.id]);

  // Follow progress while the run is working; the stream is closed once it rests.
  useEffect(() => {
    if (!streaming) return;
    const source = new EventSource(`/api/runs/${run.id}/events?after=${lastEventId.current}`);
    source.addEventListener("run", (m) => {
      const e = JSON.parse((m as MessageEvent).data) as EventView;
      if (e.id <= lastEventId.current) return;
      lastEventId.current = e.id;
      setEvents((prev) => [...prev, e]);
    });
    source.addEventListener("status", (m) => {
      const { status } = JSON.parse((m as MessageEvent).data) as { status: string };
      if (status !== run.status) void refresh();
    });
    source.onerror = () => source.close();
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id, streaming, run.status]);

  function ingest(sse: string) {
    const fresh: EventView[] = [];
    for (const block of sse.split("\n\n")) {
      if (!block.includes("event: run")) continue;
      const data = block.split("\n").find((l) => l.startsWith("data: "));
      if (!data) continue;
      const e = JSON.parse(data.slice(6)) as EventView;
      if (e.id > lastEventId.current) fresh.push(e);
    }
    if (fresh.length > 0) {
      lastEventId.current = fresh.at(-1)!.id;
      setEvents((prev) => [...prev, ...fresh]);
    }
  }

  async function retry() {
    setRetrying(true);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: run.kind, request: run.request }),
    });
    const body = await res.json();
    if (res.ok) router.push(`/runs/${body.id}`);
    else {
      setLoadError(body.error ?? "Could not start a new run.");
      setRetrying(false);
    }
  }

  const onChanged = useCallback(() => void refresh(), [refresh]);

  // Pick up approval events after a decision, when no stream is open.
  useEffect(() => {
    if (streaming) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/runs/${run.id}/events?after=${lastEventId.current}`).catch(
        () => null,
      );
      if (res?.ok) ingest(await res.text());
    }, 300);
    return () => clearTimeout(t);
  }, [detail, streaming, run.id]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{KIND_LABEL[run.kind]}</Badge>
          <StatusBadge status={run.status} />
          <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
        </div>
        <blockquote className="rounded-md border-l-4 border-border bg-muted px-4 py-3 text-sm whitespace-pre-wrap">
          {run.request}
        </blockquote>
      </div>

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {streaming && (
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden /> Working
              on it…
            </h2>
          </CardHeader>
          <CardBody>
            <Timeline events={events} live />
          </CardBody>
        </Card>
      )}

      {run.status === "NEEDS_CLARIFICATION" && (
        <Alert tone="warning">
          <p className="font-medium">More information needed before a proposal can be made.</p>
          <ul className="mt-1 list-disc pl-5">
            {(run.outcome?.questions ?? []).map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <Link href="/" className="mt-2 inline-block font-medium underline">
            Start a new request with these details
          </Link>
        </Alert>
      )}
      {run.status === "CANNOT_FULFILL" && (
        <Alert tone="info">
          <p className="font-medium">No proposal was made.</p>
          <p>{run.outcome?.reason}</p>
        </Alert>
      )}
      {run.status === "FAILED" && (
        <Alert tone="danger">
          <p className="font-medium">This run could not finish.</p>
          <p>{run.failureReason ?? "Unknown error."}</p>
          <p className="mt-1">Nothing was created in Odoo.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry} disabled={retrying}>
            {retrying ? "Starting…" : "Try again"}
          </Button>
        </Alert>
      )}

      {proposals.map((p) => (
        <ProposalCard key={`${p.id}-${p.version}-${p.status}`} proposal={p} onChanged={onChanged} />
      ))}

      {(run.outcome?.skipped?.length ?? 0) > 0 && (
        <Alert tone="info">
          <p className="font-medium">Deliberately not ordered</p>
          <ul className="mt-1 list-disc pl-5">
            {run.outcome!.skipped!.map((s) => (
              <li key={s.productId}>
                Product {s.productId}: {s.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {!streaming && (
        <details className="rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">What the assistant did</summary>
          <div className="mt-3">
            <Timeline events={events} />
            <Link
              href={`/traces/${run.id}`}
              className="mt-3 inline-block text-sm text-primary underline"
            >
              Full trace
            </Link>
          </div>
        </details>
      )}
    </div>
  );
}
