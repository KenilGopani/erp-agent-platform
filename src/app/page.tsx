import Link from "next/link";
import { Suspense } from "react";
import { RequestForm } from "@/components/request-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardBody } from "@/components/ui/card";
import { KIND_LABEL, formatDate } from "@/lib/describe";
import { getServices } from "@/lib/server/services";

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">What do you need?</h1>
        <p className="text-muted-foreground">
          The assistant prepares a proposal from live Odoo data. You review it; nothing is written
          to Odoo until you approve, and then only a draft.
        </p>
      </div>

      <Card>
        <CardBody>
          <RequestForm />
        </CardBody>
      </Card>

      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-3 text-lg font-semibold">
          Recent runs
        </h2>
        <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
          <RecentRuns />
        </Suspense>
      </section>
    </div>
  );
}

async function RecentRuns() {
  const runs = await getServices().service.listRuns(8);
  return (
    <>
      {runs.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted-foreground">
            No runs yet. Submit a request above to get started.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted sm:px-5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{r.request}</span>
                  <span className="text-xs text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                  <StatusBadge status={r.status} />
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={r.createdAt.toISOString()}
                  >
                    {formatDate(r.createdAt.toISOString())}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
