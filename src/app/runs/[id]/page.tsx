import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RunView } from "@/components/run-view";
import { getServices } from "@/lib/server/services";
import type { EventView, RunDetail } from "@/lib/ui-types";
import Loading from "./loading";

export default function RunPage(props: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <RunContent params={props.params} />
    </Suspense>
  );
}

async function RunContent({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  const { api, service } = getServices();
  const res = await api.getRun(id);
  if (res.status === 404) notFound();
  const detail = (await res.json()) as RunDetail;
  const events: EventView[] = (await service.getEvents(id)).map((e) => ({
    id: e.id,
    type: e.type,
    payload: e.payload as Record<string, unknown>,
    at: e.createdAt.toISOString(),
  }));
  return <RunView initial={detail} initialEvents={events} />;
}
