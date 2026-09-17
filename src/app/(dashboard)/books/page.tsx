import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { BooksTable } from "@/components/books/books-table";
import { MOCK_BOOKS, MOCK_CHAPTERS } from "@/data/mock-catalog";

export default function BooksPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Books" }]}
        title="Books"
        action={
          <Button asChild>
            <Link href="/books/new">New Story</Link>
          </Button>
        }
      />

      <BooksTable books={MOCK_BOOKS} chapters={MOCK_CHAPTERS} />
    </div>
  );
}
