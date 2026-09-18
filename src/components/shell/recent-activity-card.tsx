import { QueryErrorCard } from "@/components/shell/query-error-card";
import { Skeleton } from "@/components/ui/skeleton";
import { serverSupabase } from "@/lib/server-supabase";
import { getRecentActivity } from "@/lib/queries";

/**
 * The Dashboard's Recent activity card, extracted so it can stream.
 *
 * It runs its OWN query rather than receiving one as a prop: a Suspense
 * boundary only defers work that starts inside it, so an awaited result passed
 * down from the page would already have blocked the page before this rendered.
 *
 * The tiles and the needs-attention queue are what an operator opens the
 * Dashboard for; this card is reference material. On a ~450ms-per-query
 * database (AGENTS.md, Performance Rules) letting it resolve separately gets
 * the useful half of the screen up a full round trip sooner.
 */

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

/** Matches the real card's row height and rhythm so nothing shifts. */
export function RecentActivityFallback() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-baseline gap-4 border-b border-border px-6 py-3 last:border-0"
        >
          <Skeleton className="h-3 w-14 shrink-0" />
          <Skeleton className="h-3 w-64" />
        </div>
      ))}
    </div>
  );
}

export async function RecentActivityList() {
  const client = await serverSupabase();
  const activity = await getRecentActivity(client);

  if (!activity.ok) {
    return (
      <div className="px-6 pb-6">
        <QueryErrorCard
          message={activity.error}
          kind={activity.kind}
          retryHref="/"
        />
      </div>
    );
  }

  if (activity.data.length === 0) {
    return <p className="card__sub-line px-6 pb-6">No recent activity.</p>;
  }

  return (
    <div className="flex flex-col">
      {activity.data.map((entry) => (
        <div
          key={entry.id}
          className="flex items-baseline gap-4 border-b border-border px-6 py-3 last:border-0"
        >
          <span className="w-14 shrink-0 font-mono text-mono text-muted">
            {formatTime(entry.timestamp)}
          </span>
          <span className="text-body text-text">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}
