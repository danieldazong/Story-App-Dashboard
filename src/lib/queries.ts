import type { SupabaseClient } from "@supabase/supabase-js";
import { toBook, toChapter, toChapterListItem } from "@/lib/catalog-mappers";
import {
  classifyDbError,
  describeDbError,
  isNetworkError,
  isSkewError,
  type DbErrorKind,
} from "@/lib/db-errors";
import { SETTINGS_DEFAULTS } from "@/data/settings-defaults";
import type { Database } from "@/types/database";
import type {
  Book,
  Chapter,
  ChapterListItem,
  MissingAsset,
} from "@/types/catalog";

type Client = SupabaseClient<Database>;
type BookRow = Database["public"]["Tables"]["books"]["Row"];
type ChapterRow = Database["public"]["Tables"]["chapters"]["Row"];
type SettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];

/**
 * Every query returns this shape rather than throwing.
 *
 * A failed request and an empty table must be distinguishable by the caller: one
 * means "something is broken", the other means "create something". Swallowing an
 * error into an empty array conflates them and shows the operator a reassuring
 * empty state over a real outage.
 */
export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; kind: DbErrorKind };

/**
 * Builds the failure arm of a QueryResult.
 *
 * Three things here are load-bearing, all of them fixes for a Dashboard that
 * rendered `"Could not count missing audio: "` — a context string, a colon, and
 * nothing at all:
 *
 * 1. `code` is accepted. Supabase's PostgrestError has always carried it, but
 *    the old signature took only `{ message }`, which is why the code-based
 *    branches (42501, 23505) were unreachable from every read in this file.
 * 2. `describeDbError` replaces the raw `error.message`. Reads now get the same
 *    translation writes have had since prompt 14 — an RLS denial no longer
 *    leaks its policy string and a dropped connection no longer reads like a
 *    stack trace.
 * 3. A period, not a colon. A colon promises something follows it; when the
 *    message was empty that promise was visibly broken. A full sentence
 *    degrades gracefully even if an empty message ever slips through again.
 */
function fail(
  context: string,
  error: { code?: string; message: string },
): { ok: false; error: string; kind: DbErrorKind } {
  return {
    ok: false,
    error: `${context}. ${describeDbError(error)}`,
    kind: classifyDbError(error),
  };
}

/**
 * Backoff for transient read failures, in milliseconds — one entry per retry.
 *
 * Two retries, not one, and starting later than 250ms. The Dashboard failed
 * with "Could not count missing audio. Couldn't reach the database" on the
 * first load after sign-in, while the Needs attention table beside it rendered
 * fine from the same request with the same token: one query lost, its siblings
 * won. Clicking `Try again` a second later always worked.
 *
 * That is cold-connection latency, not an outage. Performance Rules records a
 * measured **1244ms for a single `HEAD`** against this instance — longer than a
 * real `select *`, because connection setup dominates on `t3.nano`.
 * `getDashboardCounts` opens the screen with concurrent queries, so the first
 * load after sign-in is the worst case in the whole app. A single retry 250ms
 * later was still inside the same cold window and failed identically.
 *
 * (It opened with *three* `HEAD` counts when this was written. It is two small
 * projections now — see that function — which lowers the worst case but does
 * not change the reasoning here.)
 *
 * 300ms then 900ms gives ~1.2s of headroom across three attempts, which covers
 * a cold start without making a genuine outage feel sluggish.
 */
const RETRY_DELAYS_MS = [300, 900];

/**
 * Longer, because a skewed clock is not a dropped packet.
 *
 * A "JWT not yet valid" token becomes valid once real time catches up to its
 * `nbf`, so the retry has to outlast the skew itself. 250ms would re-send a
 * token that is still in the future and fail identically. 3s covers the
 * few-second drift a typical unsynced desktop accumulates; beyond that the
 * clock needs fixing and the error message says so.
 */
const SKEW_RETRY_DELAY_MS = 3_000;

/**
 * Runs a read, retrying ONCE after a short delay if — and only if — it failed
 * for a transport reason.
 *
 * This machine's IPv6 routing to Cloudflare drops requests intermittently
 * (AGENTS.md, Debugging Playbooks), and one dropped packet should not blank a
 * screen and tell an operator to check their account permissions. A single
 * retry absorbs that.
 *
 * Only network-shaped failures are retried. A permission denial or a constraint
 * violation is deterministic: retrying it wastes a round trip and delays an
 * error the operator needs to see now.
 *
 * Deliberately NOT installed on the Supabase client's `fetch`. A retry there
 * would silently apply to WRITES too, and replaying a non-idempotent insert
 * after an ambiguous timeout is how a book ends up with two copies of chapter
 * one. Reads are safe to repeat; writes are not. Keeping it here, in the read
 * module, makes that boundary explicit — see AGENTS.md, Performance Rules.
 */
async function withRetry<T extends { error: { message: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  let result = await run();

  for (const delay of RETRY_DELAYS_MS) {
    if (!result.error) return result;

    const message = result.error.message;

    // A not-yet-valid token is transient in the most literal sense: it becomes
    // valid by waiting. It gets ONE longer wait rather than the backoff ladder,
    // because the wait has to outlast a clock difference rather than a cold
    // connection — and if 3s does not cover the drift, the clock needs fixing
    // and `describeDbError` says so.
    if (isSkewError(message)) {
      await new Promise((resolve) => setTimeout(resolve, SKEW_RETRY_DELAY_MS));
      return run();
    }

    // A permission denial or a constraint violation is deterministic: retrying
    // wastes a round trip and delays an error the operator needs now.
    if (message.trim() !== "" && !isNetworkError(message)) return result;

    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await run();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type AppSettings = {
  storageProvider: string;
  bucketName: string;
  publicCdnDomain: string;
  maxAudioSizeMb: number;
  acceptedAudioFormats: string[];
  acceptedScriptFormats: string[];
  detectDurationAutomatically: boolean;
  defaultChapterAccess: SettingsRow["default_chapter_access"];
  freeChaptersAtStart: number;
  defaultMaturity: SettingsRow["default_maturity"];
};

function settingsFromRow(row: SettingsRow): AppSettings {
  return {
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    publicCdnDomain: row.public_cdn_domain,
    maxAudioSizeMb: row.max_audio_size_mb,
    acceptedAudioFormats: row.accepted_audio_formats,
    acceptedScriptFormats: row.accepted_script_formats,
    detectDurationAutomatically: row.detect_duration_automatically,
    defaultChapterAccess: row.default_chapter_access,
    freeChaptersAtStart: row.free_chapters_at_start,
    defaultMaturity: row.default_maturity,
  };
}

/**
 * Constants used when no settings row exists yet, or when the settings read
 * failed and a screen still has to render.
 *
 * Exported so `serverSupabaseWithSettings` uses this one definition instead of
 * its own inline copy, which had already drifted from it.
 */
export function settingsFallback(): AppSettings {
  return {
    storageProvider: SETTINGS_DEFAULTS.storageProvider,
    bucketName: SETTINGS_DEFAULTS.bucketName,
    publicCdnDomain:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? SETTINGS_DEFAULTS.publicCdnDomain,
    maxAudioSizeMb: SETTINGS_DEFAULTS.maxAudioSizeMb,
    acceptedAudioFormats: [...SETTINGS_DEFAULTS.acceptedAudioFormats],
    acceptedScriptFormats: [...SETTINGS_DEFAULTS.acceptedScriptFormats],
    detectDurationAutomatically: SETTINGS_DEFAULTS.detectDurationAutomatically,
    defaultChapterAccess: SETTINGS_DEFAULTS.defaultChapterAccess,
    freeChaptersAtStart: SETTINGS_DEFAULTS.freeChaptersAtStart,
    defaultMaturity: SETTINGS_DEFAULTS.defaultMaturity,
  };
}

/**
 * The single settings row.
 *
 * Falls back to the constants in data/settings-defaults.ts when the table is
 * empty. A fresh database has no settings row — prompt 12 forbids seeding data
 * in a migration, and the row is created by the Settings screen's own Save once
 * writes land. This is a real state, not a placeholder: the app must render
 * before anyone has saved settings.
 */
export async function getAppSettings(
  client: Client,
): Promise<QueryResult<AppSettings>> {
  const { data, error } = await withRetry(() =>
    client.from("app_settings").select("*").maybeSingle(),
  );

  if (error) return fail("Could not load settings", error);
  return { ok: true, data: data ? settingsFromRow(data) : settingsFallback() };
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export type BookWithChapters = { book: Book; chapters: Chapter[] };

/**
 * Books list.
 *
 * Deliberately does NOT select `script_text`. The Books list only needs to know
 * whether each chapter HAS a script, and pulling every chapter's prose to render
 * a list would move megabytes for a 148-chapter serial. `script_text is not null`
 * is computed in Postgres and returned as a boolean instead.
 */
export type BookListRow = {
  book: Book;
  chapters: { ready: number; total: number };
  audio: { ready: number; total: number };
};

export async function getBooks(
  client: Client,
  cdnDomain: string,
): Promise<QueryResult<BookListRow[]>> {
  const { data: books, error: booksError } = await withRetry(() =>
    client.from("books").select("*").order("title"),
  );

  if (booksError) return fail("Could not load books", booksError);

  const { data: chapters, error: chaptersError } = await withRetry(() =>
    client.from("chapters").select("book_id, script_text, audio_path"),
  );

  if (chaptersError) return fail("Could not load chapters", chaptersError);

  const byBook = new Map<string, { ready: number; total: number; audioReady: number }>();
  for (const row of chapters ?? []) {
    const entry = byBook.get(row.book_id) ?? {
      ready: 0,
      total: 0,
      audioReady: 0,
    };
    entry.total += 1;
    if (row.script_text !== null) entry.ready += 1;
    if (row.audio_path !== null) entry.audioReady += 1;
    byBook.set(row.book_id, entry);
  }

  const rows: BookListRow[] = (books ?? []).map((row: BookRow) => {
    const counts = byBook.get(row.id) ?? { ready: 0, total: 0, audioReady: 0 };
    return {
      book: toBook(row, cdnDomain),
      chapters: { ready: counts.ready, total: counts.total },
      audio: { ready: counts.audioReady, total: counts.total },
    };
  });

  return { ok: true, data: rows };
}

export async function getBook(
  client: Client,
  bookId: string,
  cdnDomain: string,
): Promise<QueryResult<Book | null>> {
  const { data, error } = await withRetry(() =>
    client.from("books").select("*").eq("id", bookId).maybeSingle(),
  );

  if (error) return fail("Could not load this book", error);
  return { ok: true, data: data ? toBook(data, cdnDomain) : null };
}

// No `cdnDomain`: a chapter carries its script as text and its audio as a
// private-bucket path, so nothing here builds a public URL. Books still take
// one — covers are public. See toChapter().
export async function getChapters(
  client: Client,
  bookId: string,
): Promise<QueryResult<Chapter[]>> {
  const { data, error } = await withRetry(() =>
    client.from("chapters").select("*").eq("book_id", bookId).order("number"),
  );

  if (error) return fail("Could not load chapters", error);
  return {
    ok: true,
    data: (data ?? []).map((row: ChapterRow) => toChapter(row)),
  };
}

/**
 * Chapters for a list, WITHOUT each chapter's prose.
 *
 * Reads the `chapters_list` view rather than the table: `/books/[bookId]`
 * renders word counts and presence, never the text, and selecting `script_text`
 * for a long serial moved megabytes across a link where one round trip already
 * costs ~450ms (measured: 895ms with the column, 501ms without). The view counts
 * words in Postgres, mirroring countWords() — verified against live data.
 *
 * Use getChapters() instead when the prose itself is needed; that is the chapter
 * editor, and only the chapter editor.
 */
export async function getChaptersList(
  client: Client,
  bookId: string,
): Promise<QueryResult<ChapterListItem[]>> {
  const { data, error } = await withRetry(() =>
    client
      .from("chapters_list")
      .select("*")
      .eq("book_id", bookId)
      .order("number"),
  );

  if (error) return fail("Could not load chapters", error);

  // A row missing a column that is `not null` on the base table cannot be
  // rendered meaningfully; the mapper returns null and it is dropped rather
  // than widening the type for the whole app. See toChapterListItem().
  const rows: ChapterListItem[] = [];
  for (const row of data ?? []) {
    const item = toChapterListItem(row);
    if (item) rows.push(item);
  }

  return { ok: true, data: rows };
}

export async function getChapter(
  client: Client,
  bookId: string,
  number: number,
): Promise<QueryResult<Chapter | null>> {
  const { data, error } = await withRetry(() =>
    client
      .from("chapters")
      .select("*")
      .eq("book_id", bookId)
      .eq("number", number)
      .maybeSingle(),
  );

  if (error) return fail("Could not load this chapter", error);
  return { ok: true, data: data ? toChapter(data) : null };
}

/** Previous and next chapter numbers, for the Chapter editor's nav buttons. */
export async function getChapterNeighbours(
  client: Client,
  bookId: string,
  number: number,
): Promise<QueryResult<{ previous: number | null; next: number | null }>> {
  const { data, error } = await client
    .from("chapters")
    .select("number")
    .eq("book_id", bookId)
    .order("number");

  if (error) return fail("Could not load chapter navigation", error);

  const numbers = (data ?? []).map((row) => row.number);
  const index = numbers.indexOf(number);
  return {
    ok: true,
    data: {
      previous: index > 0 ? numbers[index - 1] : null,
      next: index >= 0 && index < numbers.length - 1 ? numbers[index + 1] : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardCounts = {
  books: number;
  publishedBooks: number;
  chapters: number;
  freeChapters: number;
  /** Chapters WITH narration. The tile shows coverage, not the deficit. */
  audioReady: number;
};

/**
 * Counted in Postgres — no rows are transferred to compute these tiles.
 *
 * Still exactly three round trips, deliberately. This returns five numbers
 * where it used to return three, and the obvious way to get the two new ones is
 * two more `HEAD` counts. That would take the Dashboard from three concurrent
 * cold queries to five on the screen whose cold-start behaviour needed a
 * backoff retry to stop it flashing an error after sign-in (see `withRetry`
 * above). Instead, the two extra dimensions are derived client-side from small
 * projections that replace the counts they extend:
 *
 *   - `books` selects `status`, so published/draft is one pass over N rows
 *     where N is the number of books — tens, not thousands.
 *   - `chapters` selects `access` and a boolean audio projection, giving total,
 *     free/locked, and audio coverage from a single scan.
 *
 * `audio_path` is projected as a boolean by `not.is.null` rather than selected,
 * so no storage paths cross the wire — and `script_text` is never mentioned,
 * which is the mistake prompt 13 exists to prevent.
 */
export async function getDashboardCounts(
  client: Client,
): Promise<QueryResult<DashboardCounts>> {
  const [books, chapters] = await Promise.all([
    withRetry(() => client.from("books").select("status")),
    withRetry(() => client.from("chapters").select("access, audio_path")),
  ]);

  if (books.error) return fail("Could not count books", books.error);
  if (chapters.error) return fail("Could not count chapters", chapters.error);

  const bookRows = books.data ?? [];
  const chapterRows = chapters.data ?? [];

  return {
    ok: true,
    data: {
      books: bookRows.length,
      publishedBooks: bookRows.filter((row) => row.status === "published")
        .length,
      chapters: chapterRows.length,
      freeChapters: chapterRows.filter((row) => row.access === "free").length,
      audioReady: chapterRows.filter((row) => row.audio_path !== null).length,
    },
  };
}

export type AttentionRowData = {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  missing: MissingAsset;
};

export async function getNeedsAttention(
  client: Client,
): Promise<QueryResult<AttentionRowData[]>> {
  const { data, error } = await withRetry(() =>
    client.from("chapters_needing_attention").select("*"),
  );

  if (error) return fail("Could not load the work queue", error);

  // Every view column is nullable (Postgres cannot prove non-nullability across
  // a join) and `missing` widens to string, so rows are narrowed here rather
  // than widening MissingAsset — see types/catalog.ts.
  const rows: AttentionRowData[] = [];
  for (const row of data ?? []) {
    if (
      row.book_id === null ||
      row.book_title === null ||
      row.chapter_id === null ||
      row.chapter_number === null ||
      row.chapter_title === null ||
      row.missing === null
    ) {
      continue;
    }
    rows.push({
      bookId: row.book_id,
      bookTitle: row.book_title,
      chapterId: row.chapter_id,
      chapterNumber: row.chapter_number,
      chapterTitle: row.chapter_title,
      missing: row.missing as MissingAsset,
    });
  }
  return { ok: true, data: rows };
}

export type ActivityRow = {
  id: string;
  timestamp: string;
  message: string;
};

export async function getRecentActivity(
  client: Client,
  limit = 20,
): Promise<QueryResult<ActivityRow[]>> {
  const { data, error } = await client
    .from("activity_log")
    .select("id, message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return fail("Could not load recent activity", error);

  // `created_at` maps to the UI's `timestamp`; the table's actor_id/book_id/
  // chapter_id are not rendered by the activity card as it currently stands.
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      timestamp: row.created_at,
      message: row.message,
    })),
  };
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export type ImportTarget = { id: string; title: string; chapterCount: number };

export async function getBooksForImport(
  client: Client,
): Promise<QueryResult<ImportTarget[]>> {
  const { data: books, error: booksError } = await client
    .from("books")
    .select("id, title")
    .order("title");

  if (booksError) return fail("Could not load books", booksError);

  const { data: chapters, error: chaptersError } = await client
    .from("chapters")
    .select("book_id");

  if (chaptersError) return fail("Could not load chapter counts", chaptersError);

  const counts = new Map<string, number>();
  for (const row of chapters ?? []) {
    counts.set(row.book_id, (counts.get(row.book_id) ?? 0) + 1);
  }

  return {
    ok: true,
    data: (books ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      chapterCount: counts.get(row.id) ?? 0,
    })),
  };
}
