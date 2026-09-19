import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";

/**
 * A book id that matches no row.
 *
 * Replaces the inline "Book not found" cards that were repeated verbatim across
 * the book editor, the new-chapter page and the import screen. Those pages call
 * notFound() now, and this renders the result once.
 *
 * Reached ONLY for a genuinely absent row. A failed read renders error.tsx or a
 * QueryErrorCard instead — an RLS rejection is an error, not a 404, and showing
 * "not found" for one would tell an operator their book was deleted when it is
 * merely invisible to them.
 */
export default function BookNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Stories", href: "/books" }, { label: "Not found" }]}
      />
      <div className="card flex flex-col gap-3 p-6">
        <h1 className="text-page-title">Story not found</h1>
        <p className="card__sub-line">
          This story doesn&apos;t exist or may have been removed.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href="/books">Back to stories</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
