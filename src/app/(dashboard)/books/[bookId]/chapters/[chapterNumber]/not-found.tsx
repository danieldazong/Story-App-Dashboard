"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";

/**
 * A chapter number that matches no row in an existing book.
 *
 * A Client Component so it can read the book id from the route: not-found.tsx
 * receives no params, and the way back should point at the book the operator
 * was actually in rather than dumping them at the books list. The id comes from
 * the URL, so it survives the failed lookup.
 */
export default function ChapterNotFound() {
  const params = useParams<{ bookId: string }>();
  const backHref = params?.bookId ? `/books/${params.bookId}` : "/books";

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Stories", href: "/books" }, { label: "Not found" }]}
      />
      <div className="card flex flex-col gap-3 p-6">
        <h1 className="text-page-title">Chapter not found</h1>
        <p className="card__sub-line">
          This chapter doesn&apos;t exist or may have been removed.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href={backHref}>
              {params?.bookId ? "Back to story" : "Back to stories"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
