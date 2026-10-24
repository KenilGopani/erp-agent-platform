/** A problem found while building a proposal. `block` must be fixed; `warn` is shown to the approver. */
export interface Issue {
  code: string;
  severity: "block" | "warn";
  message: string;
  path?: string;
}

export const hasBlocking = (issues: Issue[]) => issues.some((i) => i.severity === "block");

export type BuildResult<P> = { ok: true; proposal: P } | { ok: false; violations: Issue[] };
