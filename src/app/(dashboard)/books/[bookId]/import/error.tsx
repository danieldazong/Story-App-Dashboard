"use client";

import { useParams } from "next/navigation";
import { RouteErrorCard } from "@/components/shell/route-error-card";

export default function ImportError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const params = useParams<{ bookId: string }>();
  const backHref = params?.bookId ? `/books/${params.bookId}` : "/books";

  // This boundary catches a failure loading the SCREEN, never a failed import:
  // per-row import failures are handled as data inside the batch loop so a
  // batch can continue past them, and must not reach a boundary that would
  // unmount the result block an operator needs to act on.
  return (
    <RouteErrorCard
      error={error}
      retry={retry}
      breadcrumbs={[{ label: "Books", href: "/books" }, { label: "Error" }]}
      parentHref={backHref}
      parentLabel={params?.bookId ? "this book" : "books"}
      context="the import screen"
    />
  );
}
