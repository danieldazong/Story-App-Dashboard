import type { SupabaseClient } from "@supabase/supabase-js";
import { toBook, toChapter } from "@/lib/catalog-mappers";
import { SETTINGS_DEFAULTS } from "@/data/settings-defaults";
import type { Database } from "@/types/database";
import type { Book, Chapter, MissingAsset } from "@/types/catalog";

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
  | { ok: false; error: string };

function fail(context: string, error: { message: string }): {
  ok: false;
  error: string;
} {
  return { ok: false, error: `${context}: ${error.message}` };
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

/** Constants used when no settings row exists yet. */
function settingsFallback(): AppSettings {
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
  const { data, error } = await client
    .from("app_settings")
    .select("*")
    .maybeSingle();

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
  const { data: books, error: booksError } = await client
    .from("books")
    .select("*")
    .order("title");

  if (booksError) return fail("Could not load books", booksError);

  const { data: chapters, error: chaptersError } = await client
    .from("chapters")
    .select("book_id, script_text, audio_path");

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
  const { data, error } = await client
    .from("books")
    .select("*")
    .eq("id", bookId)
    .maybeSingle();

  if (error) return fail("Could not load this book", error);
  return { ok: true, data: data ? toBook(data, cdnDomain) : null };
}

export async function getChapters(
  client: Client,
  bookId: string,
  cdnDomain: string,
): Promise<QueryResult<Chapter[]>> {
  const { data, error } = await client
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("number");

  if (error) return fail("Could not load chapters", error);
  return {
    ok: true,
    data: (data ?? []).map((row: ChapterRow) => toChapter(row, cdnDomain)),
  };
}

export async function getChapter(
  client: Client,
  bookId: string,
  number: number,
  cdnDomain: string,
): Promise<QueryResult<Chapter | null>> {
  const { data, error } = await client
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .eq("number", number)
    .maybeSingle();

  if (error) return fail("Could not load this chapter", error);
  return { ok: true, data: data ? toChapter(data, cdnDomain) : null };
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
  chapters: number;
  missingAudio: number;
};

/** Counted in Postgres — no rows are transferred to compute these tiles. */
export async function getDashboardCounts(
  client: Client,
): Promise<QueryResult<DashboardCounts>> {
  const [books, chapters, missingAudio] = await Promise.all([
    client.from("books").select("*", { count: "exact", head: true }),
    client.from("chapters").select("*", { count: "exact", head: true }),
    client
      .from("chapters")
      .select("*", { count: "exact", head: true })
      .is("audio_path", null),
  ]);

  if (books.error) return fail("Could not count books", books.error);
  if (chapters.error) return fail("Could not count chapters", chapters.error);
  if (missingAudio.error)
    return fail("Could not count missing audio", missingAudio.error);

  return {
    ok: true,
    data: {
      books: books.count ?? 0,
      chapters: chapters.count ?? 0,
      missingAudio: missingAudio.count ?? 0,
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
  const { data, error } = await client
    .from("chapters_needing_attention")
    .select("*");

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
