# 11-clerk-auth

Read AGENTS.md first and follow it strictly.

Study the existing dashboard shell, the Settings Account card and all five screens, then add real Clerk authentication with admin-only access by following the Clerk documentation pasted below.

Keep the existing UI, layout and navigation intact. Do not change any screen design. If any screen needs a structural change to accommodate auth, ask me before implementing.

## What to implement

**Sign-in route.** A single `app/sign-in/[[...sign-in]]/page.tsx` using Clerk's prebuilt `<SignIn />` component, centered on a `page` background. There is **no sign-up route** — this is an internal tool and operators are provisioned in the Clerk Dashboard. Do not add a sign-up link, a create-account flow, or a self-serve invite.

**Provider.** Wrap the root layout in `<ClerkProvider>`. Style the Clerk component through its appearance API to match the design system — `primary` for the submit button with a white label, `card` surfaces, `border` borders, `text` and `muted` type colors, Inter, 8px radii, no shadows.

**Middleware.** Add `clerkMiddleware()` with `createRouteMatcher` treating everything except `/sign-in` and static assets as protected. Unauthenticated requests to any dashboard route redirect to `/sign-in`.

**Role gate.** Per the Clerk docs below, roles live in `publicMetadata` and must be surfaced on the session token. Configure the session token claim, add the `types/globals.d.ts` role declaration, and gate access to the `(dashboard)` route group so only a user whose role is `admin` can reach any dashboard page. A signed-in non-admin sees a `Not authorised` page with a sign-out action, not a redirect loop and not a dashboard shell.

Clerk's own middleware reference states that middleware is not the best place to protect routes and that access should be protected as close to the resource as possible. So implement **both** layers: middleware for the unauthenticated redirect, and a server-side role check inside the `(dashboard)` layout for authorisation. Do not rely on middleware alone.

**Sidebar footer.** Add a signed-in operator block at the bottom of the existing sidebar — avatar, name, and a `Sign out` action — using Clerk's `<UserButton />` or `useUser` plus `signOut`. It must sit flush at the bottom of the full-height sidebar without disturbing the four nav items above it. Nothing else in the sidebar changes.

**Settings Account card.** Replace the values currently read from `data/settings-defaults.ts` with the real session user: name, primary email address, and the role from session claims rendered in the existing role pill. `Change password` links to Clerk's account management. Remove only the account fields from `data/settings-defaults.ts` — every other default on that screen stays as-is.

**Server helper.** Add `lib/auth.ts` exporting a `requireAdmin()` function for use in Server Components, Server Actions and Route Handlers. It reads the session, throws or redirects when the caller is not an admin, and returns the Clerk user id. Every Server Action added in later prompts will call it first.

## Constraints

- Publishable key in the browser, secret key server-side only. Never expose `CLERK_SECRET_KEY`.
- Do not cache a token in a module-level variable. Token retrieval always goes through Clerk's `getToken`.
- Do not build custom auth, a custom session cookie, or a password form of your own.
- Do not add the Clerk role-management admin tool from the docs below — operators are managed in the Clerk Dashboard and the Settings Team card is display-only until a later prompt.
- Do not create any Supabase client in this prompt. The Supabase `accessToken` wiring is the next prompt's job.
- Do not touch the Books, Book editor, Chapter editor, Dashboard, Uploads or Bulk import screens beyond what the sidebar footer and the Account card require.
- Add the required environment variables to `.env.example` with placeholder values and no real keys.

## States

- **Unauthenticated** — redirected to `/sign-in` from any dashboard route.
- **Authenticating** — Clerk's own loading state; do not build a custom one.
- **Signed in as admin** — full dashboard access, sidebar footer shows the operator.
- **Signed in as non-admin** — `Not authorised` page with a short heading, one muted line, and a `Sign out` action.
- **Signed out** — returns to `/sign-in`.

## Verification

Confirm that a signed-in user without `admin` in `publicMetadata` cannot reach `/`, `/books`, `/uploads` or `/settings`, and that removing the middleware while leaving the layout check in place still blocks them. That second test proves the authorisation boundary is not middleware-dependent.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

---

(Here paste the latest Clerk documentation:

- https://clerk.com/docs/reference/nextjs/clerk-middleware
- https://clerk.com/docs/guides/secure/basic-rbac
- https://clerk.com/docs/reference/nextjs/app-router/route-handlers)
