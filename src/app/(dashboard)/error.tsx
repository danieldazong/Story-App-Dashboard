"use client";

import { RouteErrorCard } from "@/components/shell/route-error-card";

/**
 * Catches a THROWN error anywhere in the dashboard route group that a more
 * specific segment boundary did not already catch.
 *
 * This would not have caught the "Could not count missing audio:" incident —
 * that path returns a QueryResult and never throws, which is why the fix for it
 * lives in lib/db-errors.ts and lib/queries.ts instead. This boundary exists for
 * the paths that genuinely do throw:
 *
 *   - requireAdmin() in (dashboard)/layout.tsx calls Clerk's auth(), which is
 *     network I/O to the exact service documented as timing out on this machine
 *     (AGENTS.md, Debugging Playbooks).
 *   - `await params` unwrapping, and any mapper that throws on malformed data.
 *
 * Migrated from `reset()` to `retry()` in prompt 19. On next 16.3.5 both props
 * exist and they are NOT interchangeable: `reset()` clears error state and
 * re-renders WITHOUT re-fetching, so against a Supabase read that is still
 * failing it renders straight back into the same error and reads as a dead
 * button. `retry()` re-fetches. The comment that used to sit here claimed
 * `reset()` "re-renders the segment", which described the wrong prop's
 * behaviour for this version.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteErrorCard
      error={error}
      retry={retry}
      breadcrumbs={[{ label: "Dashboard" }]}
      parentHref="/books"
      parentLabel="books"
      context="this screen"
    />
  );
}
