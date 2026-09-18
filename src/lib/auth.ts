import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * True when the current session carries the admin role claim.
 *
 * Reads the role from the session token rather than calling Clerk's API, so
 * this stays cheap enough to run on every request. The claim is populated
 * from `publicMetadata` — see types/globals.d.ts.
 */
export async function isAdmin(): Promise<boolean> {
  const { sessionClaims } = await auth();
  return sessionClaims?.metadata?.role === "admin";
}

/**
 * Guard for routes that need a signed-in user but NOT the admin role.
 *
 * Exactly one route needs this: `/account`, which renders Clerk's own
 * `<UserProfile>`. It sits outside the `(dashboard)` group — deliberately, so
 * it renders Clerk's full-width surface rather than the sidebar shell — and so
 * it never passed through `requireAdmin()`.
 *
 * Until the createRouteMatcher migration it was protected by `auth.protect()`
 * in the proxy. That protection was real but path-based, which is precisely
 * what Clerk deprecated: "middleware-based auth checks rely on path matching,
 * which can diverge from how Next.js routes requests and leave protected
 * resources reachable". This moves the check onto the resource itself.
 *
 * Deliberately NOT requireAdmin(): a signed-in non-admin must still be able to
 * manage their own credentials. Locking them out of /account would leave them
 * with no way to change a password on an account they legitimately hold.
 */
export async function requireUser(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return userId;
}

/**
 * Guard for Server Components, Server Actions and Route Handlers. Returns the
 * Clerk user id of the calling admin, or redirects.
 *
 * This is the authorisation boundary for server code. Middleware only handles
 * the unauthenticated redirect — it is not sufficient on its own, per Clerk's
 * guidance to protect as close to the resource as possible. Note that RLS is
 * the final boundary for data access (see AGENTS.md, Supabase Rules); this
 * check protects the dashboard's own server code.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (sessionClaims?.metadata?.role !== "admin") {
    redirect("/not-authorised");
  }

  return userId;
}
