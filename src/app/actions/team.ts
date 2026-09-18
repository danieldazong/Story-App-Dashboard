"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";
import { actionError, actionOk, type ActionResult } from "@/app/actions/types";

/**
 * Team management, against Clerk — there is no `team_members` table by design.
 *
 * Clerk owns identity, so a local roster would be a second source of truth that
 * drifts the moment someone is removed in the Clerk Dashboard. Everything here
 * reads and writes Clerk directly (see AGENTS.md, Clerk Rules).
 *
 * `clerkClient` is ASYNC in @clerk/nextjs 7.9.4 — `() => Promise<ClerkClient>`.
 * Calling it without awaiting yields a Promise whose `.users` is undefined,
 * which typechecks under a cast and fails only at runtime.
 */

/**
 * The only role this app enforces.
 *
 * `requireAdmin()` redirects anything that is not `admin`, and every RLS policy
 * gates on `is_admin()`. The Team card used to offer Editor and Audio Master
 * as well, which would have created users who could not sign in at all — an
 * invitation promising access the app refuses. They come back when there is
 * behaviour behind them, not before.
 */
const ROLE = "admin" as const;

/**
 * This app's absolute origin, for building Clerk redirect URLs.
 *
 * Clerk requires an absolute URL in `redirectUrl`; a bare path resolves
 * against Clerk's own hosted domain instead of this app. Falls back to
 * localhost so a developer who has not set the variable gets a working dev
 * flow rather than a silent 404 — but a deployed environment must set
 * NEXT_PUBLIC_APP_URL, or every invitation will point at localhost.
 */
function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000"
  );
}

export type TeamMemberRecord = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  /** Distinguishes an accepted member from an unaccepted invitation. */
  status: "active" | "pending";
  /** True for the signed-in operator, who must not be able to remove himself. */
  isSelf: boolean;
};

/**
 * Pulls the `code` values out of a Clerk API error.
 *
 * Clerk throws `ClerkAPIResponseError` carrying an `errors` array of
 * `{ code, message, longMessage, meta }`. The codes are stable identifiers;
 * the messages are human prose that can be reworded without notice, and the
 * top-level `.message` is only the HTTP status text. Branch on codes.
 *
 * Shape-checked rather than `instanceof`: the error crosses a Server Action
 * boundary, and importing Clerk's error class here just to narrow a type would
 * couple this to an internal export for no gain.
 */
function extractClerkErrorCodes(error: unknown): string[] {
  if (typeof error !== "object" || error === null) return [];
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];

  return errors
    .map((entry) =>
      typeof entry === "object" && entry !== null
        ? (entry as { code?: unknown }).code
        : undefined,
    )
    .filter((code): code is string => typeof code === "string");
}

function displayName(
  firstName: string | null,
  lastName: string | null,
  email: string,
): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  // Falling back to the email's local part beats rendering an empty cell for
  // an operator who never filled in a profile.
  return full !== "" ? full : email.split("@")[0];
}

/**
 * Everyone with access, plus everyone invited but not yet signed up.
 *
 * Pending invitations are included deliberately: an invitation that was sent
 * and never accepted is invisible otherwise, so the same person gets invited
 * repeatedly with no sign anything happened.
 */
export async function listTeamMembers(): Promise<
  ActionResult<TeamMemberRecord[]>
> {
  const actorId = await requireAdmin();

  try {
    const client = await clerkClient();

    const [users, invitations] = await Promise.all([
      client.users.getUserList({ limit: 100 }),
      client.invitations.getInvitationList({ status: "pending", limit: 100 }),
    ]);

    const active: TeamMemberRecord[] = users.data.map((user) => {
      const email =
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
          ?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        "";

      const role = user.publicMetadata?.role;

      return {
        id: user.id,
        name: displayName(user.firstName, user.lastName, email),
        email,
        role: typeof role === "string" ? role : null,
        status: "active",
        isSelf: user.id === actorId,
      };
    });

    const pending: TeamMemberRecord[] = invitations.data.map((invitation) => {
      const role = invitation.publicMetadata?.role;
      return {
        id: invitation.id,
        name: invitation.emailAddress.split("@")[0],
        email: invitation.emailAddress,
        role: typeof role === "string" ? role : null,
        status: "pending",
        isSelf: false,
      };
    });

    // Active first, then pending, each alphabetical — so the people who can
    // actually sign in are not buried under unaccepted invitations.
    return actionOk([
      ...active.sort((a, b) => a.email.localeCompare(b.email)),
      ...pending.sort((a, b) => a.email.localeCompare(b.email)),
    ]);
  } catch (error) {
    console.error("Could not list team members:", error);
    return actionError(
      "Couldn't load the team list from Clerk. Check your connection and try again.",
    );
  }
}

const inviteSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
});

/**
 * Sends a real Clerk invitation carrying the admin role.
 *
 * `publicMetadata` set here lands in the user's own `publicMetadata` when they
 * accept — which is exactly what `isAdmin()` reads off the session token. That
 * is what makes the invited person an admin without a second manual step in
 * the Clerk Dashboard.
 */
export async function inviteTeamMember(input: {
  email: string;
}): Promise<ActionResult<{ email: string }>> {
  await requireAdmin();

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Check the highlighted fields.", {
      email: parsed.error.issues[0]?.message ?? "Enter a valid email address",
    });
  }

  const { email } = parsed.data;

  try {
    const client = await clerkClient();

    await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role: ROLE },
      // MUST be absolute, and must point at the sign-UP surface.
      //
      // Two separate bugs were fixed here on 2026-09-18. First, this passed
      // NEXT_PUBLIC_CLERK_SIGN_IN_URL, which is the bare path `/sign-in`;
      // Clerk resolved it against its own `*.accounts.dev` domain, so Accept
      // landed on a 404 there rather than on this app. Second, the target was
      // wrong even as an absolute URL: the email's Accept button carries
      // `__clerk_status=sign_up` because the invitee has no account yet, and
      // `<SignIn>` cannot complete that flow. /accept-invitation renders
      // <SignUp>, which consumes the ticket.
      redirectUrl: `${appOrigin()}/accept-invitation`,
      // Deliberately false: a duplicate invitation should report the conflict
      // rather than quietly stacking a second one for the same address.
      ignoreExisting: false,
    });

    revalidatePath("/settings");
    return actionOk({ email });
  } catch (error) {
    console.error("Could not invite team member:", error);

    // Read Clerk's structured error CODE, not its message.
    //
    // `ClerkAPIResponseError.message` is just the HTTP status text —
    // "Unprocessable Entity" — so an earlier version of this that regex-matched
    // /duplicate|already exists|taken/ against it could never match, and every
    // duplicate surfaced as "check your connection" over a request that
    // arrived and was understood perfectly. The real signal is
    // `errors[0].code`, confirmed against the live instance: inviting an
    // existing user returns 422 with `form_identifier_exists`.
    const codes = extractClerkErrorCodes(error);

    if (codes.includes("form_identifier_exists")) {
      return actionError("Check the highlighted fields.", {
        email:
          "That email already has an account. They can be given access from the list instead.",
      });
    }

    if (codes.includes("duplicate_record")) {
      return actionError("Check the highlighted fields.", {
        email: "That email already has a pending invitation.",
      });
    }

    // Clerk refuses invitations entirely when the instance does not accept
    // email addresses for sign-up: 400 `invitations_not_supported`. Confirmed
    // against the live instance by turning the toggle off and retrying.
    //
    // This is a CONFIGURATION fault, not a transport one, so it must not fall
    // through to "check your connection" — that sent an operator to debug
    // their network over a setting they had just changed themselves. Naming
    // the toggle is the whole value of this branch.
    if (codes.includes("invitations_not_supported")) {
      return actionError(
        "Invitations are turned off for this Clerk instance. Re-enable Configure → User & authentication → Sign-up with email, or add this operator directly in the Clerk Dashboard.",
      );
    }

    return actionError(
      "Couldn't send the invitation. Check your connection and try again.",
    );
  }
}

/** Cancels an invitation that has not been accepted. */
export async function revokeTeamInvitation(
  invitationId: string,
): Promise<ActionResult> {
  await requireAdmin();

  if (!invitationId.trim()) return actionError("Missing invitation id.");

  try {
    const client = await clerkClient();
    await client.invitations.revokeInvitation(invitationId);
    revalidatePath("/settings");
    return actionOk(undefined);
  } catch (error) {
    console.error("Could not revoke invitation:", error);
    return actionError("Couldn't cancel that invitation. Try again.");
  }
}

/**
 * DELETES the Clerk user. Irreversible.
 *
 * This cleared the admin role until 2026-09-18, leaving the account intact.
 * That was defensible — reversible, and it preserved an identity that might be
 * used elsewhere — but it did not match what the button appeared to do. A
 * removed operator stayed in the roster as `No access` with a live `Remove`
 * link beside them, so clicking it again reported success and changed nothing.
 * A control that reports success while doing nothing is the defect this
 * codebase keeps rediscovering; here it was the *copy* that was wrong rather
 * than the code.
 *
 * Changed at explicit request, with the trade-off stated: there is no undo, and
 * re-adding someone means a fresh invitation they must accept. The confirmation
 * dialog says so in those words — it previously promised the opposite.
 *
 * `revokeTeamInvitation` is the sibling for someone who never accepted; that
 * deletes the invitation, not an account.
 */
export async function removeTeamMember(
  userId: string,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  if (!userId.trim()) return actionError("Missing user id.");

  // Deleting your own account would lock you out of the screen you are standing
  // on, permanently, with no recovery path from inside the app. The card also
  // renders no button for your own row — this is the boundary, not the UI.
  if (userId === actorId) {
    return actionError("You can't delete your own account.");
  }

  try {
    const client = await clerkClient();

    // Delete, not clear-and-keep. See the doc comment above for the earlier
    // behaviour and why it changed. The three-attempt history of the OLD
    // clear-the-role call (updateUser -> merge bug -> replaceUserMetadata) is
    // preserved in AGENTS.md rather than here, since none of it applies to a
    // delete — there is no merge-vs-replace question when the user ceases to
    // exist.
    await client.users.deleteUser(userId);

    revalidatePath("/settings");
    return actionOk(undefined);
  } catch (error) {
    console.error("Could not delete team member:", error);
    return actionError("Couldn't delete that account. Try again.");
  }
}
