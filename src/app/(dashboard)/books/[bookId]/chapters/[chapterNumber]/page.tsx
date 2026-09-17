import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterEditor } from "@/components/chapters/chapter-editor";
import { ChapterEditorResolver } from "@/components/chapters/chapter-editor-resolver";
import { MOCK_BOOKS, MOCK_CHAPTERS } from "@/data/mock-catalog";

export default async function ChapterEditorPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterNumber: string }>;
}) {
  const { bookId, chapterNumber } = await params;
  const book = MOCK_BOOKS.find((b) => b.id === bookId);
  const number = Number(chapterNumber);

  if (!book) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Books", href: "/books" }, { label: "Not found" }]}
        />
        <div className="card flex flex-col gap-3 p-6">
          <h1 className="text-page-title">Chapter not found</h1>
          <p className="card__sub-line">
            This chapter doesn&apos;t exist or may have been removed.
          </p>
          <div>
            <Button asChild variant="outline">
              <Link href="/books">Back to books</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const bookChapters = MOCK_CHAPTERS.filter((c) => c.bookId === bookId);
  const chapter = bookChapters.find((c) => c.number === number);

  // Not in the seeded mock data — it may still be a chapter created this
  // session via the composer/Manuscript import, which only lives in
  // sessionStorage (see lib/local-chapters.ts). That's a client-only check,
  // so hand off to a small Client Component rather than declaring "not
  // found" here.
  if (!chapter) {
    return (
      <ChapterEditorResolver
        bookId={book.id}
        bookTitle={book.title}
        number={number}
        seededChapterNumbers={bookChapters.map((c) => c.number)}
      />
    );
  }

  const bookChapterNumbers = bookChapters
    .map((c) => c.number)
    .sort((a, b) => a - b);
  const currentIndex = bookChapterNumbers.indexOf(number);
  const previousNumber =
    currentIndex > 0 ? bookChapterNumbers[currentIndex - 1] : null;
  const nextNumber =
    currentIndex < bookChapterNumbers.length - 1
      ? bookChapterNumbers[currentIndex + 1]
      : null;

  return (
    <ChapterEditor
      bookId={book.id}
      bookTitle={book.title}
      chapter={chapter}
      previousHref={
        previousNumber !== null
          ? `/books/${book.id}/chapters/${previousNumber}`
          : null
      }
      nextHref={
        nextNumber !== null ? `/books/${book.id}/chapters/${nextNumber}` : null
      }
    />
  );
}
