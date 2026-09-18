import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { BulkImportScreen } from "@/components/books/bulk-import-screen";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";
import { getBook, getChaptersList } from "@/lib/queries";

export default async function BulkImportPage({
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
          items={[{ label: "Books", href: "/books" }, { label: "Error" }]}
        />
        <QueryErrorCard
          message={bookResult.error}
          kind={bookResult.kind}
          retryHref={`/books/${bookId}/import`}
        />
      </div>
    );
  }

  const book = bookResult.data;

  // Absent row only — the failed-read branch above keeps its QueryErrorCard.
  if (!book) notFound();

  // The list view: this screen needs existing chapter numbers to resolve
  // conflicts, never chapter prose. See AGENTS.md, Performance Rules.
  const chaptersResult = await getChaptersList(client, book.id);

  if (!chaptersResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: "Books", href: "/books" },
            { label: book.title, href: `/books/${book.id}` },
            { label: "Error" },
          ]}
        />
        <QueryErrorCard
          message={chaptersResult.error}
          kind={chaptersResult.kind}
          retryHref={`/books/${bookId}/import`}
        />
      </div>
    );
  }

  return (
    <BulkImportScreen
      bookId={book.id}
      bookTitle={book.title}
      existingNumbers={chaptersResult.data.map((chapter) => chapter.number)}
      acceptedScriptFormats={settings.acceptedScriptFormats}
    />
  );
}
