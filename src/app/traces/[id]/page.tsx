import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KIND_LABEL, describeEvent } from "@/lib/describe";
import { getServices } from "@/lib/server/services";
import type { EventView } from "@/lib/ui-types";

export default function TraceDetail(props: PageProps<"/traces/[id]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
      <TraceContent params={props.params} />
    </Suspense>
  );
}

async function TraceContent({ params }: { params: PageProps<"/traces/[id]">["params"] }) {
  const { id } = await params;
  const { service } = getServices();
  const run = await service.getRun(id);
  if (!run) notFound();
  const events: EventView[] = (await service.getEvents(id)).map((e) => ({
    id: e.id,
    type: e.type,
    payload: e.payload as Record<string, unknown>,
    at: e.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/traces" className="text-sm text-primary underline">
          All traces
        </Link>
        <h1 className="text-2xl font-semibold">{KIND_LABEL[run.kind]}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <StatusBadge status={run.status} />
          <span className="font-mono text-xs">{run.model}</span>
          <Link href={`/runs/${run.id}`} className="text-primary underline">
            Open run
          </Link>
        </div>
        <p className="text-sm">{run.request}</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Timeline</h2>
        </CardHeader>
        <CardBody>
          <Timeline events={events} showTime />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Raw events</h2>
        </CardHeader>
        <CardBody className="space-y-2">
          {events.map((e) => (
            <details key={e.id} className="rounded border border-border p-2 text-sm">
              <summary className="cursor-pointer">
                <span className="font-mono text-xs">{e.type}</span>
                {describeEvent(e) ? ` — ${describeEvent(e)!.text}` : ""}
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </details>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
