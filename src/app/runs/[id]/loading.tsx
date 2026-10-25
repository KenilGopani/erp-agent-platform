export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading run">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="h-16 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded bg-muted" />
    </div>
  );
}
