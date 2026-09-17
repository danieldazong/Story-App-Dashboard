import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 renamed the `middleware` file convention to `proxy`; the
// functionality is unchanged (see node_modules/next/dist/docs/01-app/
// 01-getting-started/16-proxy.md). Clerk's helper keeps its own name.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);

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
