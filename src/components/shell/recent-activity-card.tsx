import { QueryErrorCard } from "@/components/shell/query-error-card";
import { Skeleton } from "@/components/ui/skeleton";
import { serverSupabase } from "@/lib/server-supabase";
import { getRecentActivity } from "@/lib/queries";
import { activityGroupLabel, groupActivity } from "@/lib/catalog";
import type { ActivityGroup } from "@/lib/catalog";

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
 *
 * Still a Server Component after the grouping pass. Collapsing runs of similar
 * events needs an expand affordance, and the obvious way to get one is
 * `useState` — which would make this a Client Component, ship the whole list as
 * serialised props, and give up the streaming above. `<details>`/`<summary>`
 * does the same job in the browser with no JavaScript and no state, so the
 * card keeps streaming and stays server-rendered.
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

function ActivityTime({ timestamp }: { timestamp: string }) {
  return (
    <span className="w-14 shrink-0 font-mono text-mono text-muted">
      {formatTime(timestamp)}
    </span>
  );
}

function ActivityRowShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border px-6 py-3 last:border-0">
      {children}
    </div>
  );
}

function CollapsedGroup({ group }: { group: ActivityGroup }) {
  if (group.count === 1) {
    return (
      <ActivityRowShell>
        <ActivityTime timestamp={group.timestamp} />
        <span className="text-body text-text">{group.message}</span>
      </ActivityRowShell>
    );
  }

  return (
    <details className="group border-b border-border last:border-0">
      <summary className="flex cursor-pointer list-none items-baseline gap-4 px-6 py-3 hover:bg-page">
        <ActivityTime timestamp={group.timestamp} />
        <span className="text-body text-text">
          {activityGroupLabel(group)}
        </span>
        <span className="ml-auto text-helper text-muted group-open:hidden">
          Show
        </span>
        <span className="ml-auto hidden text-helper text-muted group-open:inline">
          Hide
        </span>
      </summary>
      <div className="flex flex-col bg-page">
        {group.entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-baseline gap-4 px-6 py-2 pl-10"
          >
            <ActivityTime timestamp={entry.timestamp} />
            <span className="text-helper text-muted">{entry.message}</span>
          </div>
        ))}
      </div>
    </details>
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

  const days = groupActivity(activity.data);

  // No group cap. The card scrolls internally (see the Dashboard's
  // ACTIVITY_MAX_HEIGHT), so everything fetched is reachable by scrolling —
  // a cap would hide entries inside a container that already looks scrollable,
  // which reads as a bug rather than a limit. The `limit` passed to
  // getRecentActivity is the real bound on how much exists here.
  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <div key={day.label} className="flex flex-col">
          {/*
            Sticky, so the day a row belongs to stays on screen while its rows
            scroll past. `top-0` works because the scroll container is the
            card body wrapper on the page, not this element.
          */}
          <div className="sticky top-0 z-10 border-b border-border bg-page px-6 py-2">
            <span className="text-section-label text-muted">{day.label}</span>
          </div>
          {day.groups.map((group) => (
            <CollapsedGroup key={group.id} group={group} />
          ))}
        </div>
      ))}
    </div>
  );
}
