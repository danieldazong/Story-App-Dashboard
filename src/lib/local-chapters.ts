import type { Chapter } from "@/types/catalog";

function storageKey(bookId: string): string {
  return `novelnow:local-chapters:${bookId}`;
}

// Chapters created via the Chapter composer or Manuscript import live only in
// the book editor's React state — there is no backend yet (Clerk/Supabase land
// in prompts 11-18). This mirrors that same state into sessionStorage, keyed by
// book id, so the chapter editor page (a separate navigation, reading from
// MOCK_CHAPTERS) can still find and render a chapter created this session.
// It is not persistence: a new tab or a real reload of the underlying data
// starts empty, same honesty rule as everything else in this app.

export function readLocalChapters(bookId: string): Chapter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Chapter[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalChapters(bookId: string, chapters: Chapter[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(bookId),
      JSON.stringify(chapters),
    );
  } catch {
    // sessionStorage can throw in private browsing / storage-full cases —
    // this is a convenience mirror, not a source of truth, so fail silently.
  }
}

export function findLocalChapter(
  bookId: string,
  number: number,
): Chapter | null {
  return (
    readLocalChapters(bookId).find((chapter) => chapter.number === number) ??
    null
  );
}
