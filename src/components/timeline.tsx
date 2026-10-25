import { Badge } from "@/components/ui/badge";
import { describeEvent } from "@/lib/describe";
import type { EventView } from "@/lib/ui-types";

const dot = {
  neutral: "bg-border",
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

/** Plain-language progress list. `live` announces new entries to screen readers. */
export function Timeline({
  events,
  live = false,
  showTime = false,
}: {
  events: EventView[];
  live?: boolean;
  showTime?: boolean;
}) {
  const rows = events.map((e) => ({ e, d: describeEvent(e) })).filter((r) => r.d !== null);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-2" aria-live={live ? "polite" : undefined}>
      {rows.map(({ e, d }) => (
        <li key={e.id} className="flex items-start gap-3 text-sm">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[d!.tone]}`} aria-hidden />
          <span className="min-w-0 flex-1 break-words">{d!.text}</span>
          {showTime && (
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.at}>
              {new Date(e.at).toLocaleTimeString()}
            </time>
          )}
        </li>
      ))}
    </ol>
  );
}

export function EventCount({ events }: { events: EventView[] }) {
  return <Badge>{events.length} events</Badge>;
}
