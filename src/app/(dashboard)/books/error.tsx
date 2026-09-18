"use client";

import { RouteErrorCard } from "@/components/shell/route-error-card";

export default function BooksError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteErrorCard
      error={error}
      retry={retry}
      breadcrumbs={[{ label: "Books" }]}
      parentHref="/"
      parentLabel="Dashboard"
      context="your books"
    />
  );
}
