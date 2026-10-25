import Link from "next/link";

export default function RunNotFound() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Run not found</h1>
      <p className="text-muted-foreground">This run does not exist or was removed.</p>
      <Link href="/" className="text-primary underline">
        Back to new request
      </Link>
    </div>
  );
}
