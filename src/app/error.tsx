"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Never render error.message: server errors can contain internal details.
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <Alert tone="danger">
        <p className="font-medium">Something went wrong loading this page.</p>
        <p>Check that Odoo and the database are running, then try again.</p>
      </Alert>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
