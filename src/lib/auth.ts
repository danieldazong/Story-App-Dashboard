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
