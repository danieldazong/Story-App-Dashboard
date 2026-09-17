"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Catches a THROWN error anywhere in the dashboard route group.
 *
 * This would not have caught the "Could not count missing audio:" incident —
 * that path returns a QueryResult and never throws, which is why the fix for it
 * lives in lib/db-errors.ts and lib/queries.ts instead. This boundary exists for
 * the paths that genuinely do throw and currently have nothing above them but
 * Next's default error page:
 *
 *   - requireAdmin() in (dashboard)/layout.tsx calls Clerk's auth(), which is
 *     network I/O to the exact service documented as timing out on this machine
 *     (AGENTS.md, Debugging Playbooks).
 *   - `await params` unwrapping, and any mapper that throws on malformed data.
 *
 * One boundary at the group root rather than six near-identical ones under each
 * segment: the throws it catches mostly originate in the shared layout anyway.
 *
 * `reset()` re-renders the segment without a full navigation, which makes this
 * the first genuine retry affordance in the app — QueryErrorCard's "Try again"
 * is a plain <Link>.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack in production,
    // where the message itself is redacted. Without logging it here there is no
    // way to correlate a report with a server log line.
    console.error("Dashboard route error:", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-3 border-destructive p-6">
        <h1 className="card__header-title text-destructive">
          Something went wrong on this screen
        </h1>
        <p className="card__sub-line">
          This is usually temporary. Trying again often works.
        </p>
        {/*
          The raw message is deliberately not rendered. In production Next
          redacts it to a generic string anyway, and in development it reads as
          a stack trace to an operator who cannot act on it — the same reason
          describeDbError exists for query failures.
        */}
        {error.digest && (
          <p className="font-mono text-mono text-muted">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
