import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { BooksTable } from "@/components/books/books-table";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";
import { getBooks } from "@/lib/queries";

export default async function BooksPage() {
  const { client, settings } = await serverSupabaseWithSettings();
  const result = await getBooks(client, settings.publicCdnDomain);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Stories" }]}
        title="Stories"
        action={
          <Button asChild>
            <Link href="/books/new">New Story</Link>
          </Button>
        }
      />

      {result.ok ? (
        <BooksTable rows={result.data} />
      ) : (
        <QueryErrorCard
          message={result.error}
          kind={result.kind}
          retryHref="/books"
        />
      )}
    </div>
  );
}
