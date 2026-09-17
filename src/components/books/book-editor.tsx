"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormProvider, useWatch } from "react-hook-form";
import { PageHeader } from "@/components/shell/page-header";
import {
  BookDetailsForm,
  BookEditorSaveButton,
  useBookDetailsForm,
  type BookDetailsValues,
} from "@/components/books/book-details-form";
import {
  CoverThumbnailCard,
  type CoverThumbnailCardHandle,
} from "@/components/books/cover-thumbnail-card";
import {
  ManuscriptCard,
  type ManuscriptCardHandle,
} from "@/components/books/manuscript-card";
import {
  ChapterComposer,
  type ChapterComposerHandle,
} from "@/components/books/chapter-composer";
import { ChaptersCard } from "@/components/books/chapters-table";
import {
  CreateBookDialog,
  type CreateBookDialogHandle,
} from "@/components/books/create-book-dialog";
import { updateBook } from "@/app/actions/books";
import type { Book, ChapterListItem } from "@/types/catalog";

export type BookEditorMode =
  | { kind: "create" }
  // ChapterListItem, not Chapter: this screen needs presence and word counts,
  // never the prose. See AGENTS.md, Performance Rules.
  | { kind: "edit"; book: Book; chapters: ChapterListItem[] };

function ComposerRow({
  bookId,
  chapters,
  composerRef,
  onCreate,
  acceptedAudioFormats,
  maxAudioSizeMb,
}: {
  bookId: string;
  chapters: ChapterListItem[];
  composerRef: React.Ref<ChapterComposerHandle>;
  onCreate: () => void;
  acceptedAudioFormats: string[];
  maxAudioSizeMb: number;
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
      acceptedAudioFormats={acceptedAudioFormats}
      maxAudioSizeMb={maxAudioSizeMb}
    />
  );
}

export function BookEditor({
  mode,
  acceptedAudioFormats,
  maxAudioSizeMb,
}: {
  mode: BookEditorMode;
  /** From app_settings, for the composer's Narration card constraint line. */
  acceptedAudioFormats: string[];
  maxAudioSizeMb: number;
}) {
  const router = useRouter();
  const isCreate = mode.kind === "create";
  const book = mode.kind === "edit" ? mode.book : null;

  // Chapters come from the database via the page's Server Component. There is
  // no local chapter state any more — a mutation refreshes the route and the
  // server sends the new rows down.
  const chapters = mode.kind === "edit" ? mode.chapters : [];

  const form = useBookDetailsForm(book);
  const title = book?.title ?? "New Story";
  const composerRef = useRef<ChapterComposerHandle>(null);
  const manuscriptRef = useRef<ManuscriptCardHandle>(null);
  const coverRef = useRef<CoverThumbnailCardHandle>(null);
  const createDialogRef = useRef<CreateBookDialogHandle>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setSaving] = useState(false);

  async function handleSave(values: BookDetailsValues) {
    if (!book) return;
    setFormError(null);
    setSaving(true);

    let result;
    try {
      result = await updateBook(book.id, {
        title: values.title,
        author: values.author,
        shortDescription: values.shortDescription,
        synopsis: values.synopsis,
        genres: values.genres,
        maturity: values.maturity,
        status: values.status,
        defaultChapterAccess: values.defaultChapterAccess,
      });
    } catch {
      // A thrown exception (rather than a returned ActionResult) would
      // otherwise leave `pending` stuck true forever with nothing shown —
      // see AGENTS.md, prompt 14 notes.
      setSaving(false);
      setFormError(
        "Couldn't reach the database. Check your connection and try again.",
      );
      return;
    }

    setSaving(false);

    if (!result.ok) {
      setFormError(result.formError);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as keyof BookDetailsValues, { message });
      }
      return;
    }

    toast.success("Book saved");

    // Move the dirty baseline to what was just saved, so Save disables again.
    //
    // resetDefaultValues(), NOT reset(). reset() tears down and re-registers
    // every field, and each re-registration re-runs the schema and notifies
    // react-hook-form's shared subject — which synchronously calls setState in
    // sibling Controllers' subscribers. When that lands during a render pass it
    // produces "Cannot update a component (BookEditor) while rendering a
    // different component (Controller)". Deferring reset() to a microtask does
    // not help: the stack trace showed React flushing that same cascade inside
    // the microtask (processRootScheduleInMicrotask), so it only moved which
    // tick the collision happened in.
    //
    // resetDefaultValues() is purpose-built for exactly this case — RHF's own
    // docs describe it as "after a successful submission, update defaults to the
    // submitted values so that dirtyFields/isDirty reflect changes made after
    // that point". It recomputes dirty state WITHOUT touching user values, so
    // nothing re-registers and the schema never re-runs. No cascade, no warning.
    form.resetDefaultValues(values);

    // No router.refresh() here. updateBook() already called revalidatePath for
    // this route, and a Server Action's response carries the refreshed RSC
    // payload with it — React applies it automatically. Calling refresh() as
    // well fired a SECOND full round trip for data already in flight, which on
    // this database (~450ms per query) cost ~3s of dead time per save.
    // See AGENTS.md, Performance Rules.
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
              pending={pending}
              onCreateClick={() => createDialogRef.current?.open()}
            />
          }
        />
        {isCreate && (
          <CreateBookDialog
            ref={createDialogRef}
            // Asked before anything runs, so the dialog's progress bar knows
            // its denominator. Each card reports only what it is actually
            // holding, using the same test its own flush() uses — so the count
            // promised and the work done cannot disagree.
            pendingSteps={() =>
              (coverRef.current?.pendingSteps() ?? 0) +
              (manuscriptRef.current?.pendingSteps() ?? 0) +
              (composerRef.current?.pendingSteps() ?? 0)
            }
            onCreated={async (newBookId, report) => {
              // Flush anything composed before the story existed, so work done
              // during creation is not thrown away on navigation. Sequential by
              // necessity (chapter numbers race otherwise), which is precisely
              // why each step reports as it finishes.
              await coverRef.current?.flush(newBookId, report);
              await manuscriptRef.current?.flush(newBookId, report);
              await composerRef.current?.flush(newBookId, report);
            }}
          />
        )}

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <BookDetailsForm
              isCreate={isCreate}
              onSave={handleSave}
              formError={formError}
            />
          </div>
          <div className="col-span-1 flex flex-col gap-6">
            <CoverThumbnailCard
              ref={coverRef}
              cover={book?.cover ?? { state: "missing" }}
              bookId={book?.id ?? ""}
            />
            <ManuscriptCard
              ref={manuscriptRef}
              bookId={book?.id ?? ""}
              existingNumbers={chapters.map((chapter) => chapter.number)}
              onImport={() => router.refresh()}
            />
          </div>
        </div>

        {/*
          The composer is create-mode only.

          In edit mode it duplicated the entire Chapter editor screen — script,
          narration and settings cards — below the book's own form, so the book
          page did two unrelated jobs and ran to ~3,500px before the Chapters
          table. Two authoring surfaces for one thing also drift: the dedicated
          New chapter screen sat stranded for several prompts, toasting "isn't
          wired to a backend yet" while this composer saved the identical form.

          It stays in create mode because there it earns its place: a new story
          and its first chapter in one pass, with no round trip through a book
          id that does not exist yet.
        */}
        {isCreate && (
          <ComposerRow
            bookId=""
            chapters={chapters}
            composerRef={composerRef}
            onCreate={() => router.refresh()}
            acceptedAudioFormats={acceptedAudioFormats}
            maxAudioSizeMb={maxAudioSizeMb}
          />
        )}

        <ChaptersCard
          bookId={book?.id ?? ""}
          chapters={chapters}
          onAddChapter={() => {
            // Create mode still has the composer on screen, so focus it.
            // Edit mode sends the operator to the dedicated screen, which
            // persists through createChapter as of this change.
            if (isCreate) {
              composerRef.current?.focusTitle();
              return;
            }
            router.push(`/books/${book?.id}/chapters/new`);
          }}
          onChanged={() => router.refresh()}
        />
      </div>
    </FormProvider>
  );
}
