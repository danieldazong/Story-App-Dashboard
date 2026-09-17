import { countWords } from "@/lib/catalog";
import type { Database } from "@/types/database";
import type {
  AudioAsset,
  Book,
  Chapter,
  ChapterListItem,
  CoverAsset,
  ScriptAsset,
  ScriptSummary,
} from "@/types/catalog";

type BookRow = Database["public"]["Tables"]["books"]["Row"];
type ChapterRow = Database["public"]["Tables"]["chapters"]["Row"];

/**
 * Builds a public media URL from a storage path.
 *
 * Never store a full URL in the database and never append a cache-busting query
 * string: audio paths are immutable and long-cached, and cached egress costs
 * roughly a third of uncached (AGENTS.md, Upload Rules / Cost). Replacing an
 * asset writes a new path rather than overwriting one.
 */
export function storageUrl(
  cdnDomain: string,
  bucket: string,
  path: string,
): string {
  const base = cdnDomain.replace(/\/+$/, "");
  const clean = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${bucket}/${clean}`;
}

/** `cover_path is null` means no cover. */
export function toCoverAsset(row: BookRow, cdnDomain: string): CoverAsset {
  if (!row.cover_path) return { state: "missing" };
  return {
    state: "ready",
    fileName: row.cover_file_name ?? row.cover_path.split("/").pop() ?? "cover",
    sizeBytes: row.cover_size_bytes ?? 0,
    url: storageUrl(cdnDomain, "covers", row.cover_path),
    width: row.cover_width ?? 800,
    height: row.cover_height ?? 1200,
  };
}

/** `script_text is null` means the script is missing. Word count is derived, never stored. */
export function toScriptAsset(row: ChapterRow): ScriptAsset {
  if (row.script_text === null) return { state: "missing" };
  return {
    state: "ready",
    fileName: row.script_file_name ?? "script.txt",
    text: row.script_text,
    wordCount: countWords(row.script_text),
  };
}

/**
 * `audio_path is null` means narration is missing.
 *
 * `audio_duration_source` is carried through so the Chapter editor renders
 * `Detected`, `Edited`, or neither: detection can report Infinity/NaN, and a
 * file whose duration was never measured has no source at all. Null is a real
 * third state, not a missing value to paper over.
 *
 * Takes no `cdnDomain`: the audio bucket is private, so there is no public URL
 * to build. The path travels instead and playback signs it on demand.
 */
export function toAudioAsset(row: ChapterRow): AudioAsset {
  if (!row.audio_path) return { state: "missing" };
  return {
    state: "ready",
    fileName: row.audio_file_name ?? row.audio_path.split("/").pop() ?? "audio",
    sizeBytes: row.audio_size_bytes ?? 0,
    // Nulls pass straight through. These previously coerced to `0` and
    // `"detected"`, which turned "we never measured this" into "we measured it
    // and it is zero seconds" — see the comment on AudioAsset.
    durationSeconds: row.audio_duration_seconds,
    durationSource: row.audio_duration_source,
    // The path, not a URL: the audio bucket is private, so a public URL does
    // not serve. See the comment on AudioAsset.
    path: row.audio_path,
  };
}

export function toBook(row: BookRow, cdnDomain: string): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    shortDescription: row.short_description ?? "",
    synopsis: row.synopsis ?? "",
    genres: row.genres,
    maturity: row.maturity,
    status: row.status,
    cover: toCoverAsset(row, cdnDomain),
    defaultChapterAccess: row.default_chapter_access,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// No `cdnDomain`: a chapter's script is plain text on the row and its audio is
// a private-bucket path signed on demand, so nothing here builds a public URL.
// Books still take one — covers are public and do.
export function toChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    number: row.number,
    title: row.title,
    script: toScriptAsset(row),
    audio: toAudioAsset(row),
    access: row.access,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// List shapes — from the chapters_list view, which omits script_text
// ---------------------------------------------------------------------------

type ChapterListRow = Database["public"]["Views"]["chapters_list"]["Row"];

/**
 * Maps one `chapters_list` row, or null if the row cannot be trusted.
 *
 * Every column of a view generates as nullable — Postgres cannot prove
 * non-nullability through a view — even though `chapters.id`, `number`, `title`
 * and `access` are all `not null` on the base table. Rather than widening
 * ChapterListItem to match the generator's pessimism, a row missing any of them
 * is treated as unusable and dropped by the caller. Same approach as
 * getNeedsAttention() with the attention view (see types/catalog.ts).
 */
export function toChapterListItem(
  row: ChapterListRow,
): ChapterListItem | null {
  if (
    row.id === null ||
    row.book_id === null ||
    row.number === null ||
    row.title === null ||
    row.access === null ||
    row.updated_at === null
  ) {
    return null;
  }

  return {
    id: row.id,
    bookId: row.book_id,
    number: row.number,
    title: row.title,
    script: toScriptSummary(row),
    audio: toAudioAssetFromList(row),
    access: row.access,
    updatedAt: row.updated_at,
  };
}

/**
 * `has_script` is the view's rendering of `script_text is not null`, and
 * `script_word_count` is computed in SQL to mirror countWords() exactly (proven
 * against live data when the view was added). The text itself is deliberately
 * absent — that is the entire point of the view.
 */
function toScriptSummary(row: ChapterListRow): ScriptSummary {
  if (!row.has_script) return { state: "missing" };
  return {
    state: "ready",
    fileName: row.script_file_name ?? "script.txt",
    wordCount: row.script_word_count ?? 0,
  };
}

/**
 * The same shape toAudioAsset() produces, from the view's nullable columns.
 *
 * Kept separate rather than widening toAudioAsset: that function takes a
 * ChapterRow and is used where columns are known non-null, and loosening it
 * would push view-shaped uncertainty onto the chapter editor's path too.
 */
function toAudioAssetFromList(row: ChapterListRow): AudioAsset {
  if (!row.audio_path) return { state: "missing" };
  return {
    state: "ready",
    fileName: row.audio_file_name ?? row.audio_path.split("/").pop() ?? "audio",
    sizeBytes: row.audio_size_bytes ?? 0,
    // Same as toAudioAsset: an unmeasured duration stays null rather than
    // becoming a confident zero, and the private bucket means a path rather
    // than a URL.
    durationSeconds: row.audio_duration_seconds,
    durationSource: row.audio_duration_source,
    path: row.audio_path,
  };
}
