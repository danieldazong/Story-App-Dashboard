"use client";

import { RouteErrorCard } from "@/components/shell/route-error-card";

export default function SettingsError({
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
      breadcrumbs={[{ label: "Settings" }]}
      parentHref="/"
      parentLabel="Dashboard"
      context="settings"
    />
  );
}
