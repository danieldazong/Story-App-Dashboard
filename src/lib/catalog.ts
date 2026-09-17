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

export function bookChapterProgress(chapters: Chapter[]): {
  ready: number;
  total: number;
} {
  const ready = chapters.filter((c) => c.script.state === "ready").length;
  return { ready, total: chapters.length };
}

export function bookAudioProgress(chapters: Chapter[]): {
  ready: number;
  total: number;
} {
  const ready = chapters.filter((c) => c.audio.state === "ready").length;
  return { ready, total: chapters.length };
}

export type ChapterNeedingAttention = {
  book: Book;
  chapter: Chapter;
  missing: MissingAsset;
};

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
