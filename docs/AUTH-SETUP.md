# Auth setup & troubleshooting — NovelNow Admin

Clerk authentication, as actually configured for this project. Written after setting it up on 2026-09-16, including every failure hit along the way and what each one really was.

**Scope:** this file covers *operating* the auth setup — configuring it, onboarding an operator, and debugging it when it breaks. The *design* (why two layers, why `publicMetadata`, why no sign-up route) lives in `AGENTS.md` under **Clerk Rules**. The outstanding pre-production work lives in `AGENTS.md` under **Deferred Security Tasks**. Don't duplicate those here — they'll drift.

---

## 1. What is where

| Thing | Location |
|---|---|
| Unauthenticated redirect | `src/proxy.ts` |
| Authorisation (admin check) | `src/app/(dashboard)/layout.tsx` → `requireAdmin()` |
| `requireAdmin()` / `isAdmin()` | `src/lib/auth.ts` |
| Session-claim type declaration | `src/types/globals.d.ts` |
| Sign-in page | `src/app/sign-in/[[...sign-in]]/page.tsx` |
| Blocked-user page | `src/app/not-authorised/page.tsx` |
| Clerk account management | `src/app/account/[[...rest]]/page.tsx` |
| Sidebar operator footer | `src/components/shell/sidebar-user.tsx` |
| Clerk styling | `src/lib/clerk-appearance.ts` |
| Keys & URLs | `.env` (gitignored) / `.env.example` (placeholders) |

**`proxy.ts`, not `middleware.ts`.** Next 16 renamed the convention. Clerk's docs say: use `middleware.ts` only on Next <15. The build reports it as `ƒ Proxy (Middleware)`.

---

## 2. First-time setup

Four steps. Miss any one and auth fails in a way that looks like a different problem.

### 2.1 Create the Clerk application

Consumer (not B2B). Organizations **off** — roles live in `publicMetadata`, and Organizations is a competing role system that would disagree with the code.

Sign-in options: Email on. Google optional. Phone/Username off.

### 2.2 Put the keys in `.env`

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
```

The bottom two are **not optional**. Without them Clerk redirects to its hosted `accounts.dev` page instead of this app's own sign-in route — see §4.4.

`.env` is gitignored (`.env*`). Never commit real keys. `.env` is read only at boot: **changing it requires a dev-server restart.**

### 2.3 Configure the session token claim

Clerk Dashboard → **Configure → Sessions → Customize session token**:

```json
{
  "metadata": "{{user.public_metadata}}"
}
```

**This is the single highest-value thing in this document.** `requireAdmin()` reads `sessionClaims.metadata.role`. Without this claim that path is always `undefined` and **every user, including you, is locked out** — with no error message explaining why. The key must be spelled `metadata` to match `src/types/globals.d.ts`.

### 2.4 Create an operator

Clerk Dashboard → **Users → Create user**. There is no sign-up route by design; operators are provisioned here.

Then on that user → **Public metadata** (not Private, not Unsafe — only Public is interpolated into the token):

```json
{ "role": "admin" }
```

Lowercase `admin`. `src/lib/auth.ts` compares the string literally.

---

## 3. Expected behaviour

| Who | What happens |
|---|---|
| Not signed in | Redirected to `/sign-in` |
| Signed in, `role: admin` | Full dashboard, name in sidebar footer |
| Signed in, no admin role | `/not-authorised`, with a Sign out action |
| Signed out | Back to `/sign-in` |

Every dashboard route is **dynamic** (`ƒ` in build output), not prerendered, because the layout calls `auth()`. That is correct and expected.

---

## 4. Troubleshooting

Symptoms are misleading here. Work through these in order.

### 4.1 Everyone gets "Not authorised", including a known admin

The session token claim (§2.3) is missing or misspelled. Check it first, every time.

Then: sign out and back in. **Claims are baked into the token at sign-in.** An existing session will not pick up a role you just granted.

### 4.2 Infinite redirect loop, or "your Clerk instance keys do not match"

**Check the system clock before touching the keys.** That Clerk error message is frequently wrong about its own cause.

Clerk JWTs live ~60 seconds. If the machine clock is even a couple of minutes fast, every token is *born expired*, the refresh is also born expired, and Clerk reports it as a key mismatch. This happened here — the clock was **184 seconds ahead**, and the log showed:

```
JWT is expired. Expiry: 19:43:36, Current: 19:45:39 (reason=token-expired)
Refreshing the session token resulted in an infinite redirect loop.
```

Diagnose by comparing against a known-good source:

```powershell
(Get-Date).ToUniversalTime()
(Invoke-WebRequest -Uri "https://api.clerk.com" -Method Head).Headers['Date']
```

Under ~30 seconds of skew is fine. To fix (needs **Administrator** — the Windows Time service was found `Disabled` on this machine):

```powershell
Set-Service -Name w32time -StartupType Manual
Start-Service w32time
w32tm /resync /force
```

Or: Settings → Time & language → Date & time → toggle *Set time automatically* off/on → **Sync now**.

**After fixing the clock, clear browser cookies.** Tokens minted during the skew are genuinely expired and will keep failing. Incognito (`Ctrl+Shift+N`) is the fastest clean test.

### 4.3 "Sorry, you have been blocked" — `clerkprod-cloudflare.net`

You reached Clerk via a raw LAN IP (`100.91.238.31:3000`) instead of `localhost:3000`. Clerk's dev instance isn't configured for raw IPs and Cloudflare's WAF blocks it.

**Always use `http://localhost:3000`.** The "Network" URL Next prints is for other devices on your LAN and will not work with Clerk dev. Delete any bookmark or autocomplete entry holding the IP.

### 4.4 Redirected to `accounts.dev` instead of this app's sign-in page

`NEXT_PUBLIC_CLERK_SIGN_IN_URL` is missing from `.env` (§2.2). Clerk doesn't know the local route exists. Add it and **restart the server**.

Symptom check: `/sign-in` returns 200 locally, but `/` returns a 307 pointing off-site.

### 4.5 Blank page / console errors after signing in

The dev server isn't running. Clerk authenticates, redirects to `localhost:3000`, nothing is listening.

```powershell
(Get-NetTCPConnection -LocalPort 3000 -State Listen | Measure-Object).Count
```

`0` means it's down. Only one `next dev` may run per directory — if it refuses to start, something already holds the port: `taskkill /PID <pid> /F`.

### 4.6 Avatar shows initials instead of a Google photo

Not a bug, and not fixable in config. **The avatar comes from whichever provider created the account.** An account created email-first in the Dashboard has no photo; linking Google afterwards does **not** backfill one.

Confirm via the API:

```powershell
$h = @{ Authorization = "Bearer $env:CLERK_SECRET_KEY" }
Invoke-RestMethod -Uri "https://api.clerk.com/v1/users?limit=5" -Headers $h |
  Select-Object id, has_image, image_url
```

`has_image = False` with an `image_url` decoding to `{"type":"default","initials":"XY"}` means Clerk is drawing a generated fallback.

Fix: upload a photo at `/account`, or set one in the Dashboard. Clerk renders a plain `<img>` from `img.clerk.com`, **not** `next/image` — so `next.config.ts` `images` config is irrelevant here.

### 4.7 A floating "N" badge over the UI

That's Next.js's own dev indicator, not this app and not a browser extension. Disabled via `devIndicators: false` in `next.config.ts`. It never appears in a production build.

---

## 5. Known warnings that are not errors

**`createRouteMatcher` is deprecated** — Clerk warns it's removed in the next major, recommending resource-based checks. This codebase already does the resource-based half (`requireAdmin()` in the layout is the real boundary); the proxy only handles the unauthenticated redirect. Tracked in `AGENTS.md` → Deferred Security Tasks.

**React Compiler "incompatible library" warnings** (4 of them, TanStack Table / react-hook-form) — pre-date auth entirely, informational, not errors.

---

## 6. Verification still owed

`AGENTS.md` → **Deferred Security Tasks** is the authoritative list. The auth-specific one:

Confirm a signed-in user **without** `role: admin` cannot reach `/`, `/books` or `/settings` — **and** that temporarily renaming `src/proxy.ts` still blocks them via the layout's `requireAdmin()`. That second half is the point: it proves authorisation isn't proxy-dependent.

Needs a second Clerk user with no admin role, so it couldn't be run at implementation time.

Tip: create that second account by signing up **with Google from the start** — it'll carry a real avatar (§4.6) and serve as the non-admin test subject.
