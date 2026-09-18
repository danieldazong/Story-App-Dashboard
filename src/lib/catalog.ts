import type { Book, Chapter, MissingAsset } from "@/types/catalog";

const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

export function readTimeMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

export function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;

  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  return `${(bytes / KB).toFixed(1)} KB`;
}

export function chapterMissingAsset(chapter: Chapter): MissingAsset | null {
  const scriptMissing = chapter.script.state === "missing";
  const audioMissing = chapter.audio.state === "missing";

  if (scriptMissing && audioMissing) return "both";
  if (scriptMissing) return "script";
  if (audioMissing) return "audio";
  return null;
}

// These two take the structural minimum they actually read, rather than a full
// Chapter, so they serve both Chapter and ChapterListItem. A list item has no
// script text, and neither of these ever needed it.
export function bookChapterProgress(
  chapters: { script: { state: "missing" | "ready" } }[],
): {
  ready: number;
  total: number;
} {
  const ready = chapters.filter((c) => c.script.state === "ready").length;
  return { ready, total: chapters.length };
}

export function bookAudioProgress(
  chapters: { audio: { state: "missing" | "ready" } }[],
): {
  ready: number;
  total: number;
} {
  const ready = chapters.filter((c) => c.audio.state === "ready").length;
  return { ready, total: chapters.length };
}

/**
 * Audio coverage as a ratio, for the Dashboard's third tile.
 *
 * Deliberately expressed as ready-of-total rather than the missing count the
 * tile used to show. "MISSING AUDIO 20" labels the catalog by its deficit and
 * reads as a failure even on a healthy catalog; "2/22" is the same fact stated
 * so the denominator is visible. This matches the Books list, which already
 * renders chapters and audio as ratios (AGENTS.md, Screen Inventory A2) — so
 * this is an existing pattern reaching one screen late, not a new one.
 *
 * `percent` is null, never NaN and never 0, when there is nothing to divide by.
 * A catalog with no chapters has no coverage percentage — 0% would claim it is
 * failing at something it has not started.
 */
export function audioCoverage(
  ready: number,
  total: number,
): { ready: number; total: number; percent: number | null } {
  return {
    ready,
    total,
    percent: total === 0 ? null : Math.round((ready / total) * 100),
  };
}

export type ChapterNeedingAttention = {
  book: Book;
  chapter: Chapter;
  missing: MissingAsset;
};

/**
 * The work queue, split into one run per story.
 *
 * The rows arrive already ordered by story then chapter number (the
 * `chapters_needing_attention` view does the sort), so this only has to detect
 * the boundaries — it never reorders. Runs, not a map keyed by story, for that
 * reason: grouping by key would silently reorder if the view's sort ever
 * changed, and the caller would not notice.
 */
export function groupAttentionByBook<
  T extends { bookId: string; bookTitle: string },
>(rows: T[]): { bookId: string; bookTitle: string; rows: T[] }[] {
  const groups: { bookId: string; bookTitle: string; rows: T[] }[] = [];

  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (current && current.bookId === row.bookId) {
      current.rows.push(row);
      continue;
    }
    groups.push({ bookId: row.bookId, bookTitle: row.bookTitle, rows: [row] });
  }

  return groups;
}

/**
 * One activity row, or a run of near-identical ones collapsed into a summary.
 *
 * `count` is 1 for an ordinary entry. Above 1, `message` is the shared suffix
 * and `entries` holds the originals so the row can expand.
 */
export type ActivityGroup = {
  id: string;
  timestamp: string;
  message: string;
  count: number;
  entries: { id: string; timestamp: string; message: string }[];
};

export type ActivityDay = {
  /** "Today", "Yesterday", or a formatted date. */
  label: string;
  groups: ActivityGroup[];
};

/**
 * Strips a leading "Chapter NN" so consecutive entries differing only by
 * chapter number collapse together.
 *
 * "Chapter 01 set locked" and "Chapter 02 set locked" share the action; the
 * chapter number is what makes twenty of them unreadable. Anything that does
 * not start with a chapter reference is returned unchanged and therefore only
 * ever groups with an exact repeat of itself.
 */
function activityKind(message: string): string {
  return message.replace(/^Chapter\s+\d+\s*/i, "").trim();
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Groups activity by local day, then collapses consecutive same-kind entries.
 *
 * Day boundaries are the OPERATOR's, not UTC's. `created_at` is stored UTC, and
 * bucketing on its ISO date would put an 8pm PDT event under "tomorrow" —
 * labelling something the operator did this evening as Yesterday the next
 * morning. `Date` parses the timestamp to an instant and the getters below read
 * it in the runtime's zone, which on a Server Component is the server's. That
 * is a known, accepted limitation of rendering this server-side; it is correct
 * for an operator in the deployment's zone and off by a few hours otherwise.
 *
 * Only CONSECUTIVE entries collapse. A run of six "set locked" broken by a
 * "cover uploaded" is three groups, not two — the order events happened in is
 * part of what the card is for, and reordering to merge them would rewrite the
 * timeline to look tidier than it was.
 */
export function groupActivity(
  entries: { id: string; timestamp: string; message: string }[],
  now: Date = new Date(),
): ActivityDay[] {
  const today = startOfLocalDay(now);
  const oneDay = 24 * 60 * 60 * 1000;

  const days: ActivityDay[] = [];
  let currentDayKey: number | null = null;

  for (const entry of entries) {
    const dayKey = startOfLocalDay(new Date(entry.timestamp));

    if (dayKey !== currentDayKey) {
      const diff = today - dayKey;
      const label =
        diff === 0
          ? "Today"
          : diff === oneDay
            ? "Yesterday"
            : new Date(entry.timestamp).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year:
                  new Date(entry.timestamp).getFullYear() === now.getFullYear()
                    ? undefined
                    : "numeric",
              });
      days.push({ label, groups: [] });
      currentDayKey = dayKey;
    }

    const day = days[days.length - 1];
    const previous = day.groups[day.groups.length - 1];
    const kind = activityKind(entry.message);

    // Only fold into the previous group when it is the same kind AND that kind
    // is a real shared action — an empty kind means the message was nothing but
    // a chapter reference, which is not something to summarise.
    if (previous && kind !== "" && activityKind(previous.message) === kind) {
      previous.count += 1;
      previous.entries.push(entry);
      // The group carries the OLDEST timestamp in its run, because the run
      // reads as one piece of work and that is when it started.
      previous.timestamp = entry.timestamp;
      continue;
    }

    day.groups.push({
      id: entry.id,
      timestamp: entry.timestamp,
      message: entry.message,
      count: 1,
      entries: [entry],
    });
  }

  return days;
}

/** "6 chapters set locked" for a run; the original message for a single. */
export function activityGroupLabel(group: ActivityGroup): string {
  if (group.count === 1) return group.message;
  return `${group.count} chapters ${activityKind(group.message)}`;
}

export function chaptersNeedingAttention(
  books: Book[],
  chapters: Chapter[],
): ChapterNeedingAttention[] {
  const booksById = new Map(books.map((book) => [book.id, book]));

  return chapters
    .map((chapter) => {
      const missing = chapterMissingAsset(chapter);
      const book = booksById.get(chapter.bookId);
      if (!missing || !book) return null;
      return { book, chapter, missing };
    })
    .filter((entry): entry is ChapterNeedingAttention => entry !== null)
    .sort((a, b) => {
      if (a.book.id !== b.book.id) {
        return a.book.title.localeCompare(b.book.title);
      }
      return a.chapter.number - b.chapter.number;
    });
}
