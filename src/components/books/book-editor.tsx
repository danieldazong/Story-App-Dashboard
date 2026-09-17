"use client";

import { useEffect, useRef, useState } from "react";
import { FormProvider, useWatch } from "react-hook-form";
import { PageHeader } from "@/components/shell/page-header";
import {
  BookDetailsForm,
  BookEditorSaveButton,
  useBookDetailsForm,
  type BookDetailsValues,
} from "@/components/books/book-details-form";
import { CoverThumbnailCard } from "@/components/books/cover-thumbnail-card";
import { ManuscriptCard } from "@/components/books/manuscript-card";
import {
  ChapterComposer,
  type ChapterComposerHandle,
} from "@/components/books/chapter-composer";
import { ChaptersCard } from "@/components/books/chapters-table";
import {
  CreateBookDialog,
  type CreateBookDialogHandle,
} from "@/components/books/create-book-dialog";
import { writeLocalChapters } from "@/lib/local-chapters";
import type { Book, Chapter } from "@/types/catalog";

export type BookEditorMode =
  | { kind: "create" }
  | { kind: "edit"; book: Book; chapters: Chapter[] };

function ComposerRow({
  bookId,
  chapters,
  composerRef,
  onCreate,
}: {
  bookId: string;
  chapters: Chapter[];
  composerRef: React.Ref<ChapterComposerHandle>;
  onCreate: (chapter: Chapter) => void;
}) {
  const defaultChapterAccess = useWatch<BookDetailsValues>({
    name: "defaultChapterAccess",
  }) as BookDetailsValues["defaultChapterAccess"];

  const nextNumber =
    chapters.length === 0
      ? 1
      : Math.max(...chapters.map((chapter) => chapter.number)) + 1;

  return (
    <ChapterComposer
      ref={composerRef}
      bookId={bookId}
      nextNumber={nextNumber}
      defaultAccess={defaultChapterAccess}
      existingNumbers={chapters.map((chapter) => chapter.number)}
      onCreate={onCreate}
    />
  );
}

export function BookEditor({ mode }: { mode: BookEditorMode }) {
  const isCreate = mode.kind === "create";
  const book = mode.kind === "edit" ? mode.book : null;
  const seededChapterIds = new Set(
    mode.kind === "edit" ? mode.chapters.map((chapter) => chapter.id) : [],
  );

  const [chapters, setChapters] = useState<Chapter[]>(
    mode.kind === "edit" ? mode.chapters : [],
  );

  const form = useBookDetailsForm(book);
  const title = book?.title ?? "New Story";
  const composerRef = useRef<ChapterComposerHandle>(null);
  const createDialogRef = useRef<CreateBookDialogHandle>(null);

  // Mirror chapters created this session (composer / Manuscript import — not
  // part of the seeded mock data) into sessionStorage, keyed by book id, so
  // the chapter editor page can find them after a navigation. No backend
  // exists yet; this is a same-tab convenience, not persistence.
  useEffect(() => {
    if (!book) return;
    const localOnly = chapters.filter(
      (chapter) => !seededChapterIds.has(chapter.id),
    );
    writeLocalChapters(book.id, localOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapters]);

  function handleCreateChapter(chapter: Chapter) {
    setChapters((current) =>
      [...current, chapter].sort((a, b) => a.number - b.number),
    );
  }

  function handleImportChapters(imported: Chapter[]) {
    setChapters((current) =>
      [...current, ...imported].sort((a, b) => a.number - b.number),
    );
  }

  function handleToggleAccess(chapterId: string) {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === chapterId
          ? {
              ...chapter,
              access: chapter.access === "free" ? "locked" : "free",
            }
          : chapter,
      ),
    );
  }

  function handleDeleteChapter(chapterId: string) {
    setChapters((current) =>
      current.filter((chapter) => chapter.id !== chapterId),
    );
  }

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={
            book
              ? [{ label: "Books", href: "/books" }, { label: book.title }]
              : [{ label: "Books", href: "/books" }, { label: "New Story" }]
          }
          title={title}
          action={
            <BookEditorSaveButton
              isCreate={isCreate}
              onCreateClick={() => createDialogRef.current?.open()}
            />
          }
        />
        {isCreate && <CreateBookDialog ref={createDialogRef} />}

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <BookDetailsForm isCreate={isCreate} />
          </div>
          <div className="col-span-1 flex flex-col gap-6">
            <CoverThumbnailCard cover={book?.cover ?? { state: "missing" }} />
            <ManuscriptCard
              bookId={book?.id ?? ""}
              existingNumbers={chapters.map((chapter) => chapter.number)}
              onImport={handleImportChapters}
            />
          </div>
        </div>

        <ComposerRow
          bookId={book?.id ?? ""}
          chapters={chapters}
          composerRef={composerRef}
          onCreate={handleCreateChapter}
        />

        <ChaptersCard
          bookId={book?.id ?? ""}
          chapters={chapters}
          onAddChapter={() => composerRef.current?.focusTitle()}
          onToggleAccess={handleToggleAccess}
          onDeleteChapter={handleDeleteChapter}
        />
      </div>
    </FormProvider>
  );
}
