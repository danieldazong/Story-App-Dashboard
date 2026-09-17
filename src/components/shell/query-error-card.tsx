import Link from "next/link";
import { Button } from "@/components/ui/button";

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
}: {
  title?: string;
  message: string;
  retryHref: string;
}) {
  return (
    <div className="card flex flex-col gap-3 border-destructive p-6">
      <h2 className="card__header-title text-destructive">{title}</h2>
      <p className="card__sub-line">{message}</p>
      <p className="card__sub-line">
        If this keeps happening, your account may not have operator access to
        this data.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href={retryHref}>Try again</Link>
        </Button>
      </div>
    </div>
  );
}
