import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

/**
 * Where an invited operator lands from the invitation email.
 *
 * This is the ONE sign-up surface in the app, and it is not a general one.
 * AGENTS.md (Clerk Rules) says there is "no sign-up route — operators are
 * provisioned in the Clerk Dashboard", and that rule still holds in substance:
 * Clerk only completes this flow when the request carries a valid
 * `__clerk_ticket` from an invitation an admin actually sent. Without a ticket
 * there is nothing to accept, so this cannot be used to self-provision.
 *
 * It exists because an invitation is useless otherwise. The email's Accept
 * button carries `__clerk_status=sign_up`, because the invitee has no account
 * yet — pointing that at `/sign-in` gives them a form they cannot complete, and
 * pointing it at a path rather than an absolute URL sent them to Clerk's own
 * accounts.dev domain, which 404s (both seen 2026-09-18).
 *
 * Deliberately outside the `(dashboard)` group, like /sign-in and
 * /not-authorised: it renders without the sidebar shell and without tripping
 * the admin gate, which the invitee cannot pass until they have accepted and
 * received their role.
 */
export default function AcceptInvitationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-page-padding">
      <div className="flex flex-col items-center gap-6">
        <span className="text-[16px] font-semibold leading-none text-text">
          NovelNow
        </span>
        <SignUp
          appearance={clerkAppearance}
          // Straight to the dashboard once the account exists. The invitation's
          // publicMetadata carries `role: admin`, so requireAdmin() passes on
          // the first request rather than bouncing them to /not-authorised.
          forceRedirectUrl="/"
          signInUrl="/sign-in"
        />
      </div>
    </main>
  );
}
