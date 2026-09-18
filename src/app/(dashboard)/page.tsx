import { Fragment, Suspense } from "react";
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
import {
  AttentionGroupHeader,
  AttentionRow,
} from "@/components/shell/attention-row";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import {
  RecentActivityFallback,
  RecentActivityList,
} from "@/components/shell/recent-activity-card";
import { serverSupabase } from "@/lib/server-supabase";
import { getDashboardCounts, getNeedsAttention } from "@/lib/queries";
import { audioCoverage, groupAttentionByBook } from "@/lib/catalog";

/**
 * Five 48px rows plus the 40px sticky header, so the sixth row is half-visible.
 *
 * A cut-off row is the affordance: a container that ends exactly on a row
 * boundary looks complete, and an operator has no reason to scroll it. This is
 * `304px` rather than a round number for that reason — 40 + (5 × 48) + 24.
 *
 * **This is not the nested-scroll defect** recorded under "Known implementation
 * defects". That rule is about the Chapters table, which *is* its own screen:
 * an inner scrollbar there competes with the page scroll for the same gesture
 * over the same content, and the fix was to let the page own the scroll with a
 * sticky header. Here the card is one of several on a composed dashboard, and
 * the alternative is not "the page scrolls this table" but "this table makes
 * the page 2,100px tall and buries every card below it". Bounded cards on a
 * multi-card screen are the case inner scroll exists for.
 */
const QUEUE_MAX_HEIGHT = "304px";

/**
 * Taller than the queue, and deliberately so.
 *
 * The two cards are not equally important. The queue is what an operator acts
 * on and five rows is enough to start; activity is what they consult, and its
 * day headers mean a 304px window could show `Today` plus two entries before
 * cutting off. 360px clears a header and roughly six rows.
 */
const ACTIVITY_MAX_HEIGHT = "360px";

/**
 * Narration coverage, as a ratio rather than a deficit.
 *
 * This tile read `MISSING AUDIO 20` — the catalog's single most important fact
 * stated as a bare negative, with no denominator. 20 missing out of 22 and 20
 * missing out of 2,000 are very different situations and the tile could not
 * tell them apart.
 *
 * The bar is a proportion readout of one known ratio, not a chart: no axis, no
 * series, no time dimension, nothing inferred. It is the same `2/22` rendered
 * a second way, which is what makes it legible at a glance rather than
 * something an operator has to divide in their head. The colour never carries
 * the meaning alone — the ratio and the sub-line both state it in words
 * (AGENTS.md, Design System).
 */
function AudioCoverageTile({
  ready,
  total,
}: {
  ready: number;
  total: number;
}) {
  const coverage = audioCoverage(ready, total);
  const missing = total - ready;

  // A catalog with no chapters has no coverage. `—` rather than 0%, which would
  // claim it is failing at something it has not started (§9, division by zero).
  const tone =
    coverage.percent === null
      ? "bg-border"
      : coverage.percent >= 80
        ? "bg-status-ok"
        : coverage.percent >= 20
          ? "bg-status-warn"
          : "bg-destructive";

  return (
    <div className="card flex flex-col gap-2 p-6">
      <span className="text-section-label text-muted">AUDIO COVERAGE</span>
      <span className="font-mono text-[32px] font-semibold leading-none text-text">
        {total === 0 ? "—" : `${ready}/${total}`}
      </span>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={
          coverage.percent === null
            ? "No chapters yet"
            : `${coverage.percent}% of chapters have narration`
        }
      >
        <div
          className={`h-full ${tone}`}
          style={{ width: `${coverage.percent ?? 0}%` }}
        />
      </div>
      <span className="card__sub-line">
        {total === 0
          ? "No chapters yet."
          : missing === 0
            ? "Every chapter has narration."
            : `${missing} ${missing === 1 ? "chapter" : "chapters"} still need${
                missing === 1 ? "s" : ""
              } narration.`}
      </span>
    </div>
  );
}

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
  // No slice. The card scrolls internally now, so every chapter in the queue is
  // reachable without leaving the Dashboard — capping at ten would hide work
  // behind a "View all" link for no benefit, and the footer's own count would
  // then disagree with what the table shows.
  const attentionGroups = attention.ok
    ? groupAttentionByBook(attention.data)
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
            <span className="text-section-label text-muted">STORIES</span>
            <span className="text-[32px] font-semibold leading-none text-text">
              {counts.data.books}
            </span>
            <span className="card__sub-line">
              {counts.data.publishedBooks} published ·{" "}
              {counts.data.books - counts.data.publishedBooks} draft
            </span>
          </div>
          <div className="card flex flex-col gap-1 p-6">
            <span className="text-section-label text-muted">CHAPTERS</span>
            <span className="text-[32px] font-semibold leading-none text-text">
              {counts.data.chapters}
            </span>
            <span className="card__sub-line">
              {counts.data.freeChapters} free ·{" "}
              {counts.data.chapters - counts.data.freeChapters} locked
            </span>
          </div>
          <AudioCoverageTile
            ready={counts.data.audioReady}
            total={counts.data.chapters}
          />
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
            {/*
              Scrolls internally at five rows rather than growing with the
              queue. See MAX_QUEUE_HEIGHT for why this is not the nested-scroll
              defect AGENTS.md prohibits.
            */}
            <div
              className="overflow-y-auto"
              style={{ maxHeight: QUEUE_MAX_HEIGHT }}
            >
              <Table>
                {/*
                  Sticky so the column labels survive the scroll — a header that
                  scrolls away leaves the pills and Open buttons unlabelled.
                  `bg-card` is required: without an opaque background the rows
                  show through it as they pass underneath.
                */}
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Chapter</TableHead>
                    <TableHead>What&apos;s missing</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/*
                    Grouped under a story sub-header rather than repeating the
                    title in a column on every row. The header only appears when
                    more than one story is in the queue — with a single story it
                    would restate the obvious and cost a row (§7.4).
                  */}
                  {attentionGroups.map((group) => (
                    <Fragment key={group.bookId}>
                      {attentionGroups.length > 1 && (
                        <AttentionGroupHeader
                          title={group.bookTitle}
                          count={group.rows.length}
                        />
                      )}
                      {group.rows.map((row) => (
                        <AttentionRow
                          key={row.chapterId}
                          chapterNumber={row.chapterNumber}
                          chapterTitle={row.chapterTitle}
                          missing={row.missing}
                          href={`/books/${row.bookId}/chapters/${row.chapterNumber}`}
                        />
                      ))}
                    </Fragment>
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
              {/*
                Always shown now. It used to appear only when the queue
                overflowed a ten-row cap; with the table scrolling internally
                there is no cap to overflow, but the link is still the way to
                the full catalog rather than just the unfinished part of it.
              */}
              <Link
                href="/books"
                className="text-helper text-muted hover:text-text"
              >
                View all in Stories
              </Link>
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
            <p className="text-body text-text">No stories yet</p>
            <p className="card__sub-line">
              Create a story to start tracking scripts and narration audio.
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
        {/*
          Bounded like the queue above. This card is reference material — it
          should not be the tallest thing on the screen, which it was at twenty
          ungrouped rows.
        */}
        <div className="overflow-y-auto" style={{ maxHeight: ACTIVITY_MAX_HEIGHT }}>
          <Suspense fallback={<RecentActivityFallback />}>
            <RecentActivityList />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
