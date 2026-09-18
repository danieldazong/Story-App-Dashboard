import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * An unmatched URL anywhere in the app.
 *
 * Lives at the app root rather than inside (dashboard) so it also covers URLs
 * that match no route group at all. It renders its own centred container
 * because it has no breadcrumb trail to sit under — there is no parent screen
 * for a path that does not exist.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card flex w-full max-w-[480px] flex-col gap-3 p-6">
        <h1 className="text-page-title">Page not found</h1>
        <p className="card__sub-line">
          That address doesn&apos;t match anything in the dashboard.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="muted">
            <Link href="/books">Browse books</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
