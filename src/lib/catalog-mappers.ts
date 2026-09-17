import { countWords } from "@/lib/catalog";
import type { Database } from "@/types/database";
import type {
  AudioAsset,
  Book,
  Chapter,
  CoverAsset,
  ScriptAsset,
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
 * `audio_duration_source` is carried through so the Chapter editor keeps
 * rendering `Detected` versus `Edited` correctly — detection can report
 * Infinity/NaN, in which case the operator's manual value is authoritative.
 */
export function toAudioAsset(row: ChapterRow, cdnDomain: string): AudioAsset {
  if (!row.audio_path) return { state: "missing" };
  return {
    state: "ready",
    fileName: row.audio_file_name ?? row.audio_path.split("/").pop() ?? "audio",
    sizeBytes: row.audio_size_bytes ?? 0,
    durationSeconds: row.audio_duration_seconds ?? 0,
    durationSource: row.audio_duration_source ?? "detected",
    url: storageUrl(cdnDomain, "audio", row.audio_path),
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

export function toChapter(row: ChapterRow, cdnDomain: string): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    number: row.number,
    title: row.title,
    script: toScriptAsset(row),
    audio: toAudioAsset(row, cdnDomain),
    access: row.access,
    updatedAt: row.updated_at,
  };
}
