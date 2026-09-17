import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterCreateEditor } from "@/components/chapters/chapter-create-editor";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";
import { getBook, getChapters } from "@/lib/queries";

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
          items={[{ label: "Books", href: "/books" }, { label: "Error" }]}
        />
        <QueryErrorCard
          message={bookResult.error}
          retryHref={`/books/${bookId}/chapters/new`}
        />
      </div>
    );
  }

  const book = bookResult.data;

  if (!book) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Books", href: "/books" }, { label: "Not found" }]}
        />
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

  const chaptersResult = await getChapters(
    client,
    book.id,
    settings.publicCdnDomain,
  );

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
    />
  );
}
