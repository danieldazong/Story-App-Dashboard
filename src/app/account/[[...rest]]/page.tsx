import { UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { clerkAppearance } from "@/lib/clerk-appearance";

/**
 * Clerk's own account management. Credentials belong to Clerk, so password
 * changes happen here rather than in a form of ours (see Prompts/11-clerk-auth.md).
 *
 * Deliberately outside the (dashboard) route group: it renders Clerk's own
 * full-width surface rather than the sidebar shell.
 */
export default function AccountPage() {
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
