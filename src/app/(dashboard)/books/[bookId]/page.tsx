import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { BookEditor } from "@/components/books/book-editor";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";
import { getBook, getChaptersList } from "@/lib/queries";

export default async function BookEditorPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const { client, settings } = await serverSupabaseWithSettings();

  const bookResult = await getBook(client, bookId, settings.publicCdnDomain);

  // A failed read and a missing book are different outcomes and must look
  // different to the operator.
  if (!bookResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Stories", href: "/books" }, { label: "Error" }]}
        />
        <QueryErrorCard
          message={bookResult.error}
          kind={bookResult.kind}
          retryHref={`/books/${bookId}`}
        />
      </div>
    );
  }

  const book = bookResult.data;

  // notFound() for a genuinely absent row only. The !bookResult.ok branch above
  // stays a QueryErrorCard deliberately: an RLS rejection is an error, not a
  // 404, and rendering "not found" for one would tell an operator their book
  // was deleted when it is merely invisible to them.
  if (!book) notFound();

  // The list view, not getChapters(): this screen renders word counts and
  // presence, never chapter prose. See AGENTS.md, Performance Rules.
  const chaptersResult = await getChaptersList(client, book.id);

  if (!chaptersResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Stories", href: "/books" }, { label: book.title }]}
        />
        <QueryErrorCard
          message={chaptersResult.error}
          kind={chaptersResult.kind}
          retryHref={`/books/${bookId}`}
        />
      </div>
    );
  }

  return (
    <BookEditor
      mode={{ kind: "edit", book, chapters: chaptersResult.data }}
      acceptedAudioFormats={settings.acceptedAudioFormats}
      maxAudioSizeMb={settings.maxAudioSizeMb}
      acceptedScriptFormats={settings.acceptedScriptFormats}
    />
  );
}
