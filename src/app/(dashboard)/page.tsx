import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shell/page-header";
import { AttentionRow } from "@/components/shell/attention-row";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import {
  RecentActivityFallback,
  RecentActivityList,
} from "@/components/shell/recent-activity-card";
import { serverSupabase } from "@/lib/server-supabase";
import { getDashboardCounts, getNeedsAttention } from "@/lib/queries";

const MAX_VISIBLE_ATTENTION_ROWS = 10;

// formatTime moved to components/shell/recent-activity-card.tsx along with the
// activity list it served — this page had no other caller.

export default async function DashboardPage() {
  const client = await serverSupabase();
  // Recent activity is deliberately NOT awaited here. It streams inside its own
  // Suspense boundary below, so the tiles and the work queue — the reason an
  // operator opens this screen — no longer wait on a third round trip.
  const [counts, attention] = await Promise.all([
    getDashboardCounts(client),
    getNeedsAttention(client),
  ]);

  // A failed count is not an empty catalog.
  //
  // This was `counts.ok && counts.data.books > 0`, which collapsed "the count
  // failed, so we don't know" and "the count succeeded and there are zero
  // books" into the same `false` — and that is what let this page print
  // "No books yet" over a catalog of two books whose activity was rendering
  // directly below it. Three states, because there are three.
  const catalogState: "unknown" | "empty" | "populated" = !counts.ok
    ? "unknown"
    : counts.data.books > 0
      ? "populated"
      : "empty";
  const visibleAttention = attention.ok
    ? attention.data.slice(0, MAX_VISIBLE_ATTENTION_ROWS)
    : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard" }]}
        title="Dashboard"
        subLine="What needs finishing."
        action={
          <Button asChild>
            <Link href="/books/new">New Story</Link>
          </Button>
        }
      />

      {counts.ok ? (
        <div className="grid grid-cols-3 gap-6">
          <div className="card flex flex-col gap-1 p-6">
            <span className="text-section-label text-muted">BOOKS</span>
            <span className="text-[32px] font-semibold leading-none text-text">
              {counts.data.books}
            </span>
          </div>
          <div className="card flex flex-col gap-1 p-6">
            <span className="text-section-label text-muted">CHAPTERS</span>
            <span className="text-[32px] font-semibold leading-none text-text">
              {counts.data.chapters}
            </span>
          </div>
          <div className="card flex flex-col gap-1 p-6">
            <span className="text-section-label text-muted">MISSING AUDIO</span>
            <span className="text-[32px] font-semibold leading-none text-status-warn">
              {counts.data.missingAudio}
            </span>
          </div>
        </div>
      ) : (
        <QueryErrorCard
          message={counts.error}
          kind={counts.kind}
          retryHref="/"
        />
      )}

      <div className="card">
        <div className="card__header p-6 pb-4">
          <h2 className="card__header-title">Needs attention</h2>
        </div>

        {!attention.ok ? (
          <div className="px-6 pb-6">
            <QueryErrorCard
              message={attention.error}
              kind={attention.kind}
              retryHref="/"
            />
          </div>
        ) : /*
            The work queue is checked BEFORE the catalog size, deliberately.
            If these rows came back they are real, and they must render
            whatever the separate counts query did — that ordering is what
            makes this card structurally incapable of claiming "No books yet"
            beside a populated table.
          */
        attention.data.length > 0 ? (
          <>
            <div className="table-wrapper">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Chapter</TableHead>
                    <TableHead>What&apos;s missing</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAttention.map((row) => (
                    <AttentionRow
                      key={row.chapterId}
                      bookTitle={row.bookTitle}
                      chapterNumber={row.chapterNumber}
                      chapterTitle={row.chapterTitle}
                      missing={row.missing}
                      href={`/books/${row.bookId}/chapters/${row.chapterNumber}`}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-helper text-muted">
                {attention.data.length}{" "}
                {attention.data.length === 1 ? "chapter" : "chapters"} need
                {attention.data.length === 1 ? "s" : ""} attention
              </span>
              {attention.data.length > MAX_VISIBLE_ATTENTION_ROWS && (
                <Link
                  href="/books"
                  className="text-helper text-muted hover:text-text"
                >
                  View all in Books
                </Link>
              )}
            </div>
          </>
        ) : catalogState === "unknown" ? (
          /*
            The queue is genuinely empty but the catalog size is unknown, so we
            cannot honestly say either "nothing exists yet" or "everything is
            done". Neutral, with a way to retry — not an empty state, and not a
            red card, because nothing on this card actually failed.
          */
          <div className="flex flex-col gap-2 px-6 pb-6">
            <p className="card__sub-line">
              Couldn&apos;t confirm the catalog size, so there may be more to
              show here.
            </p>
            <div>
              <Button asChild variant="outline">
                <Link href="/">Try again</Link>
              </Button>
            </div>
          </div>
        ) : catalogState === "empty" ? (
          <div className="flex flex-col gap-3 px-6 pb-6">
            <p className="text-body text-text">No books yet</p>
            <p className="card__sub-line">
              Create a book to start tracking scripts and narration audio.
            </p>
            <div>
              <Button asChild>
                <Link href="/books/new">New Story</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-6 pb-6">
            <span className="status-pill status-pill--ok w-fit">
              Everything is complete
            </span>
            <p className="card__sub-line">
              Every chapter across your catalog has a script and narration
              audio.
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__header p-6 pb-4">
          <h2 className="card__header-title">Recent activity</h2>
        </div>
        <Suspense fallback={<RecentActivityFallback />}>
          <RecentActivityList />
        </Suspense>
      </div>
    </div>
  );
}
