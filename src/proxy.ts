import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk's request context, and nothing else.
 *
 * Next 16 renamed the `middleware` file convention to `proxy` (see
 * node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md);
 * functionality is unchanged and `next build` still reports it as
 * `ƒ Proxy (Middleware)`. Clerk's helper keeps its own name.
 *
 * WHY THIS FILE NO LONGER GUARDS ANYTHING (2026-09-18)
 *
 * It used to call `auth.protect()` on everything except a `createRouteMatcher`
 * allowlist. `createRouteMatcher` is deprecated, and Clerk's own reason is the
 * point rather than the deprecation itself: "middleware-based auth checks rely
 * on path matching, which can diverge from how Next.js routes requests and
 * leave protected resources reachable." An allowlist is a second, parallel
 * description of the route tree — one that drifts silently the moment a route
 * is added, because nothing forces the two to agree.
 *
 * Every protected surface now guards itself, at the resource:
 *
 *   - `(dashboard)/layout.tsx` calls `requireAdmin()`. Verified on 2026-09-18
 *     to block a non-admin with this proxy guarding nothing at all — see
 *     AGENTS.md, Deferred Security Tasks item 5.
 *   - `/account` calls `requireUser()`. It renders Clerk's <UserProfile> and
 *     sits outside the dashboard group, so it never passed through
 *     requireAdmin(); the proxy was genuinely its only guard until now.
 *   - `/sign-in`, `/accept-invitation` and `/not-authorised` are public by
 *     design, and no longer need to be named anywhere. `/not-authorised` in
 *     particular MUST stay reachable by a signed-in non-admin, since
 *     requireAdmin() redirects to it.
 *
 * `clerkMiddleware()` stays mounted with an empty handler, and that is load
 * bearing: `auth()` THROWS when it cannot detect it, so removing this file
 * breaks every server-side auth call rather than merely removing a redirect.
 * That failure was mistaken for a passing security test on 2026-09-18.
 *
 * One behaviour change, deliberate: an unauthenticated visitor to a dashboard
 * route is now redirected by `requireAdmin()` rather than by the proxy. Same
 * destination (`/sign-in`), one layer later.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files unless used in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
