"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/shell/breadcrumbs";

/**
 * The body every route-level `error.tsx` renders.
 *
 * Six near-identical boundaries would drift, so the differences between them —
 * breadcrumb trail, what the parent route is called — are props, and everything
 * a boundary must get RIGHT is here once:
 *
 *   - `error.message` is never rendered. Next replaces it with a generic string
 *     in production anyway, and in development it reads as a stack trace to an
 *     operator who cannot act on it. Same reasoning as describeDbError.
 *   - `error.digest` IS rendered, as the only handle on the server-side stack in
 *     production. Without it a report cannot be correlated with a log line.
 *   - console.error on mount, so it reaches server logs.
 *
 * NOT to be confused with QueryErrorCard. That one renders a FAILED QueryResult
 * — a read that returned `{ok:false}` and never threw, which is most reads in
 * this app. This renders a genuine THROW: requireAdmin()'s Clerk call, `await
 * params` unwrapping, a mapper meeting malformed data. Routing QueryResult
 * failures through a boundary would lose the error kind and the specific copy
 * that goes with it.
 */
export function RouteErrorCard({
  error,
  retry,
  breadcrumbs,
  parentHref,
  parentLabel,
  context,
}: {
  error: Error & { digest?: string };
  /**
   * Next 16.3's stable `retry` prop, NOT `reset`.
   *
   * `retry()` re-fetches and re-renders the boundary's children, which is what
   * a failed Supabase read needs. `reset()` only clears error state and
   * re-renders — against a read that is still failing it renders straight back
   * into the same error, which looks like a dead button.
   */
  retry: () => void;
  breadcrumbs: BreadcrumbItem[];
  parentHref: string;
  parentLabel: string;
  /** Names what failed to load, e.g. "this story". */
  context: string;
}) {
  useEffect(() => {
    console.error(`Route error (${context}):`, error.digest ?? "", error);
  }, [error, context]);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={breadcrumbs} />
      <div className="card flex flex-col gap-3 border-destructive p-6">
        <h1 className="card__header-title text-destructive">
          Couldn&apos;t load {context}
        </h1>
        <p className="card__sub-line">
          This is usually temporary. Trying again often works.
        </p>
        {error.digest && (
          <p className="font-mono text-mono text-muted">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={retry}>Try again</Button>
          <Button asChild variant="muted">
            <Link href={parentHref}>Back to {parentLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
