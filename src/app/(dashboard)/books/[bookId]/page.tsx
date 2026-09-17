import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { BookEditor } from "@/components/books/book-editor";
import { MOCK_BOOKS, MOCK_CHAPTERS } from "@/data/mock-catalog";

export default async function BookEditorPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = MOCK_BOOKS.find((b) => b.id === bookId);

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

  const chapters = MOCK_CHAPTERS.filter((c) => c.bookId === book.id);

  return <BookEditor mode={{ kind: "edit", book, chapters }} />;
}
