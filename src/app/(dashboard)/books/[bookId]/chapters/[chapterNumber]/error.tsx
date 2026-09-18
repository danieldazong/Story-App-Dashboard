"use client";

import { useParams } from "next/navigation";
import { RouteErrorCard } from "@/components/shell/route-error-card";

export default function ChapterError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // The book id comes from the route, not from a read, so it survives the
  // failure and the way back can still point at the right book.
  const params = useParams<{ bookId: string }>();
  const backHref = params?.bookId ? `/books/${params.bookId}` : "/books";

  return (
    <RouteErrorCard
      error={error}
      retry={retry}
      breadcrumbs={[{ label: "Books", href: "/books" }, { label: "Error" }]}
      parentHref={backHref}
      parentLabel={params?.bookId ? "this book" : "books"}
      context="this chapter"
    />
  );
}
