import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DbErrorKind } from "@/lib/db-errors";

/**
 * A failed read is not an empty result.
 *
 * An empty table means "create something"; a failed request means "something is
 * broken". Rendering an empty state over a failure tells the operator the
 * catalog is empty when it may be full — see AGENTS.md and prompt 13's error
 * handling rules.
 */
export function QueryErrorCard({
  title = "Couldn't load this screen",
  message,
  retryHref,
  kind = "unknown",
}: {
  title?: string;
  message: string;
  retryHref: string;
  kind?: DbErrorKind;
}) {
  return (
    <div className="card flex flex-col gap-3 border-destructive p-6">
      <h2 className="card__header-title text-destructive">{title}</h2>
      <p className="card__sub-line">{message}</p>
      {/*
        Guidance varies by what actually failed. This paragraph used to assert
        "your account may not have operator access to this data" on EVERY
        failure, which sent an operator to audit their Clerk role in response to
        a Cloudflare routing blip that cleared itself in seconds. For a conflict
        or an unclassifiable error it now says nothing at all: the translated
        message above already states what happened, and saying nothing beats
        guessing wrong.
      */}
      {kind === "permission" && (
        <p className="card__sub-line">
          If this keeps happening, your account may not have operator access to
          this data.
        </p>
      )}
      {kind === "network" && (
        <p className="card__sub-line">
          This is usually a temporary connection problem. Retrying often works.
        </p>
      )}
      {/*
        A skewed clock is the one failure here with a remedy the operator
        performs OUTSIDE this app, so the guidance names it. Retrying alone
        would be a lie for a clock that is permanently wrong rather than
        momentarily so.
      */}
      {kind === "skew" && (
        <p className="card__sub-line">
          On Windows, open Settings → Time &amp; language → Date &amp; time and
          press <span className="font-medium">Sync now</span>. Your sign-in
          token is stamped with this computer&apos;s clock, so it&apos;s
          rejected when the two drift apart.
        </p>
      )}
      <div>
        <Button asChild variant="outline">
          <Link href={retryHref}>Try again</Link>
        </Button>
      </div>
    </div>
  );
}
