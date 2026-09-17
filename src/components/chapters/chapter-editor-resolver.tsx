"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterEditor } from "@/components/chapters/chapter-editor";
import { readLocalChapters } from "@/lib/local-chapters";

function NotFoundCard({
  bookId,
  bookTitle,
}: {
  bookId: string;
  bookTitle: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Books", href: "/books" },
          { label: bookTitle, href: `/books/${bookId}` },
          { label: "Not found" },
        ]}
      />
      <div className="card flex flex-col gap-3 p-6">
        <h1 className="text-page-title">Chapter not found</h1>
        <p className="card__sub-line">
          This chapter doesn&apos;t exist or may have been removed.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href={`/books/${bookId}`}>Back to book</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function noopSubscribe() {
  return () => {};
}

// sessionStorage never has content during server rendering (or before
// hydration), so the client and server snapshots must agree on an empty
// result to avoid a hydration mismatch — see getServerSnapshot below.
function emptySnapshot(): [] {
  return [];
}

export function ChapterEditorResolver({
  bookId,
  bookTitle,
  number,
  seededChapterNumbers,
}: {
  bookId: string;
  bookTitle: string;
  number: number;
  seededChapterNumbers: number[];
}) {
  const localChapters = useSyncExternalStore(
    noopSubscribe,
    () => readLocalChapters(bookId),
    emptySnapshot,
  );

  const localChapter =
    localChapters.find((chapter) => chapter.number === number) ?? null;

  if (!localChapter) {
    return <NotFoundCard bookId={bookId} bookTitle={bookTitle} />;
  }

  const localNumbers = localChapters.map((chapter) => chapter.number);
  const allNumbers = [
    ...new Set([...seededChapterNumbers, ...localNumbers]),
  ].sort((a, b) => a - b);
  const currentIndex = allNumbers.indexOf(number);
  const previousNumber = currentIndex > 0 ? allNumbers[currentIndex - 1] : null;
  const nextNumber =
    currentIndex < allNumbers.length - 1 ? allNumbers[currentIndex + 1] : null;

  return (
    <ChapterEditor
      bookId={bookId}
      bookTitle={bookTitle}
      chapter={localChapter}
      previousHref={
        previousNumber !== null
          ? `/books/${bookId}/chapters/${previousNumber}`
          : null
      }
      nextHref={
        nextNumber !== null ? `/books/${bookId}/chapters/${nextNumber}` : null
      }
    />
  );
}
