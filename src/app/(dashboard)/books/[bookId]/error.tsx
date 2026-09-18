"use client";

import { RouteErrorCard } from "@/components/shell/route-error-card";

export default function BookError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // The book's title is not available here: this boundary renders precisely
  // because the read that would have supplied it failed. Generic wording beats
  // a wrong or empty title.
  return (
    <RouteErrorCard
      error={error}
      retry={retry}
      breadcrumbs={[{ label: "Stories", href: "/books" }, { label: "Error" }]}
      parentHref="/books"
      parentLabel="books"
      context="this book"
    />
  );
}
