import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterCreateEditor } from "@/components/chapters/chapter-create-editor";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";
import { getBook, getChaptersList } from "@/lib/queries";

export default async function NewChapterPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const { client, settings } = await serverSupabaseWithSettings();

  const bookResult = await getBook(client, bookId, settings.publicCdnDomain);

  if (!bookResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Stories", href: "/books" }, { label: "Error" }]}
        />
        <QueryErrorCard
          message={bookResult.error}
          kind={bookResult.kind}
          retryHref={`/books/${bookId}/chapters/new`}
        />
      </div>
    );
  }

  const book = bookResult.data;

  // Absent row only — the failed-read branch above keeps its QueryErrorCard.
  if (!book) notFound();

  // Only chapter numbers are needed here, so the list view is plenty — no
  // reason to transfer every chapter's prose to compute a next number.
  const chaptersResult = await getChaptersList(client, book.id);

  if (!chaptersResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: "Stories", href: "/books" },
            { label: book.title, href: `/books/${book.id}` },
            { label: "Error" },
          ]}
        />
        <QueryErrorCard
          message={chaptersResult.error}
          kind={chaptersResult.kind}
          retryHref={`/books/${bookId}/chapters/new`}
        />
      </div>
    );
  }

  const bookChapters = chaptersResult.data;
  const nextNumber = Math.max(0, ...bookChapters.map((c) => c.number)) + 1;

  return (
    <ChapterCreateEditor
      bookId={book.id}
      bookTitle={book.title}
      nextNumber={nextNumber}
      defaultAccess={book.defaultChapterAccess}
      existingNumbers={bookChapters.map((c) => c.number)}
      acceptedAudioFormats={settings.acceptedAudioFormats}
      maxAudioSizeMb={settings.maxAudioSizeMb}
      acceptedScriptFormats={settings.acceptedScriptFormats}
    />
  );
}
