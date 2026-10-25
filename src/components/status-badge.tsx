import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/describe";

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}
