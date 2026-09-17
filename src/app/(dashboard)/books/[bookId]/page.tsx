import Link from "next/link";
import { Button } from "@/components/ui/button";
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
          items={[{ label: "Books", href: "/books" }, { label: "Error" }]}
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

  if (!book) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={[{ label: "Books", href: "/books" }, { label: "Not found" }]} />
        <div className="card flex flex-col gap-3 p-6">
          <h1 className="text-page-title">Book not found</h1>
          <p className="card__sub-line">
            This book doesn&apos;t exist or may have been removed.
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

  // The list view, not getChapters(): this screen renders word counts and
  // presence, never chapter prose. See AGENTS.md, Performance Rules.
  const chaptersResult = await getChaptersList(
    client,
    book.id,
    settings.publicCdnDomain,
  );

  if (!chaptersResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Books", href: "/books" }, { label: book.title }]}
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
    <BookEditor mode={{ kind: "edit", book, chapters: chaptersResult.data }} />
  );
}
