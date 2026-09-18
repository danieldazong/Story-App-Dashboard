import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 renamed the `middleware` file convention to `proxy`; the
// functionality is unchanged (see node_modules/next/dist/docs/01-app/
// 01-getting-started/16-proxy.md). Clerk's helper keeps its own name.
// `/accept-invitation` is public because an invited operator has no account
// yet — they arrive from the invitation email carrying a Clerk ticket. Left
// out, auth.protect() redirects them to /sign-in before Clerk can read that
// ticket, which is the same dead end as sending them to Clerk's own domain:
// a working invitation that cannot be accepted.
//
// It is not an open sign-up: the route renders <SignUp>, which Clerk only
// completes when the request carries a valid `__clerk_ticket`.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/accept-invitation(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    // Redirects unauthenticated requests to /sign-in. This is the UX layer
    // only — Next's own proxy docs warn it "should not be used as a full
    // session management or authorization solution", so the admin role check
    // lives in the (dashboard) layout, close to the resource.
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless used in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
