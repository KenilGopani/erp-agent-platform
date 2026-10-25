import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardBody } from "@/components/ui/card";
import { KIND_LABEL, formatDate } from "@/lib/describe";
import { getServices } from "@/lib/server/services";

const duration = (a: Date, b: Date) => {
  const s = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export default function Traces() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Traces</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
        <TraceTable />
      </Suspense>
    </div>
  );
}

async function TraceTable() {
  const runs = await getServices().service.listRuns(100);
  return (
    <>
      {runs.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted-foreground">No runs yet.</CardBody>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">All runs</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="max-w-xs truncate px-4 py-3">
                    <Link href={`/traces/${r.id}`} className="text-primary underline">
                      {r.request}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{KIND_LABEL[r.kind]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.model}</td>
                  <td className="px-4 py-3">{duration(r.createdAt, r.updatedAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(r.createdAt.toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
