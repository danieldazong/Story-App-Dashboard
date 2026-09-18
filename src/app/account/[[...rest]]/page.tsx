import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { requireUser } from "@/lib/auth";

/**
 * Clerk's own account management. Credentials belong to Clerk, so password
 * changes happen here rather than in a form of ours (see Prompts/11-clerk-auth.md).
 *
 * Deliberately outside the (dashboard) route group: it renders Clerk's own
 * full-width surface rather than the sidebar shell. That also means it never
 * passes through `requireAdmin()`, so it guards itself — until 2026-09-18 the
 * proxy's `auth.protect()` was the only thing keeping a signed-out visitor out
 * of it, and that guard moved here when createRouteMatcher was removed.
 *
 * `requireUser()`, not `requireAdmin()`: a signed-in non-admin must still be
 * able to manage the credentials of an account they legitimately hold.
 */
export default async function AccountPage() {
  await requireUser();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-page px-page-padding py-page-padding">
      <div className="w-full max-w-content">
        <Link href="/settings" className="text-helper text-muted hover:text-text">
          ← Back to Settings
        </Link>
      </div>
      <UserProfile appearance={clerkAppearance} routing="hash" />
    </main>
  );
}
