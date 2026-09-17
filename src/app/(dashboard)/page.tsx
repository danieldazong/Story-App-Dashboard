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
import { MOCK_BOOKS, MOCK_CHAPTERS } from "@/data/mock-catalog";
import { MOCK_ACTIVITY } from "@/data/mock-activity";
import { chaptersNeedingAttention } from "@/lib/catalog";

const MAX_VISIBLE_ATTENTION_ROWS = 10;

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const hasBooks = MOCK_BOOKS.length > 0;
  const missingAudioCount = MOCK_CHAPTERS.filter(
    (chapter) => chapter.audio.state === "missing",
  ).length;
  const attention = chaptersNeedingAttention(MOCK_BOOKS, MOCK_CHAPTERS);
  const visibleAttention = attention.slice(0, MAX_VISIBLE_ATTENTION_ROWS);

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

      <div className="grid grid-cols-3 gap-6">
        <div className="card flex flex-col gap-1 p-6">
          <span className="text-section-label text-muted">BOOKS</span>
          <span className="text-[32px] font-semibold leading-none text-text">
            {MOCK_BOOKS.length}
          </span>
        </div>
        <div className="card flex flex-col gap-1 p-6">
          <span className="text-section-label text-muted">CHAPTERS</span>
          <span className="text-[32px] font-semibold leading-none text-text">
            {MOCK_CHAPTERS.length}
          </span>
        </div>
        <div className="card flex flex-col gap-1 p-6">
          <span className="text-section-label text-muted">MISSING AUDIO</span>
          <span className="text-[32px] font-semibold leading-none text-status-warn">
            {missingAudioCount}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card__header p-6 pb-4">
          <h2 className="card__header-title">Needs attention</h2>
        </div>

        {!hasBooks ? (
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
        ) : attention.length === 0 ? (
          <div className="flex flex-col gap-2 px-6 pb-6">
            <span className="status-pill status-pill--ok w-fit">
              Everything is complete
            </span>
            <p className="card__sub-line">
              Every chapter across your catalog has a script and narration
              audio.
            </p>
          </div>
        ) : (
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
                  {visibleAttention.map(({ book, chapter, missing }) => (
                    <AttentionRow
                      key={chapter.id}
                      bookTitle={book.title}
                      chapterNumber={chapter.number}
                      chapterTitle={chapter.title}
                      missing={missing}
                      href={`/books/${book.id}/chapters/${chapter.number}`}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-helper text-muted">
                {attention.length}{" "}
                {attention.length === 1 ? "chapter" : "chapters"} need
                {attention.length === 1 ? "s" : ""} attention
              </span>
              {attention.length > MAX_VISIBLE_ATTENTION_ROWS && (
                <Link
                  href="/books"
                  className="text-helper text-muted hover:text-text"
                >
                  View all in Books
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card__header p-6 pb-4">
          <h2 className="card__header-title">Recent activity</h2>
        </div>
        {MOCK_ACTIVITY.length === 0 ? (
          <p className="card__sub-line px-6 pb-6">No recent activity.</p>
        ) : (
          <div className="flex flex-col">
            {MOCK_ACTIVITY.map((entry) => (
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
        )}
      </div>
    </div>
  );
}
