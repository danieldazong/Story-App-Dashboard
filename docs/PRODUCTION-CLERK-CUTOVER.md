# Production Clerk cutover — runbook

Closes **Deferred Security Task 3** in `AGENTS.md`. Started 2026-09-19.

The app currently runs on a Clerk **development** instance (`pk_test_` / `sk_test_`)
even in production at `talebrim.com`. This moves it to a production instance.

**No application code changes.** `lib/supabase.ts` already passes the Clerk session
token to Supabase via `accessToken`, and `app/actions/team.ts` already builds
invitation URLs from `NEXT_PUBLIC_APP_URL`. Everything below is dashboard
configuration.

---

## What this fixes

Four symptoms, one cause. All four disappear when this is done:

| Symptom | Why |
|---|---|
| Invitation emails land in spam | Sent from `invitations@accounts.dev`, shared by every Clerk dev instance, no SPF/DKIM alignment to this app |
| `[Development]` prefix in email subjects | Added automatically on dev instances, not editable in the template |
| "Development mode" badge under `<UserButton />` | Rendered whenever the key is `pk_test_`, no appearance option removes it |
| `pk_test_` / `sk_test_` in the environment | The instance itself |

---

## Order matters

Sign-in breaks if these are done out of order. **Step 5 is the one that gets
missed** and its failure is the most confusing in the whole list.

### 1 · Create the production instance

Clerk Dashboard → environment switcher (top-left, currently reads
**Development**) → **Production** → it offers to clone the development
instance's settings. Clone.

Cloning carries over: the application name (Talebrim), sign-in methods, the
session-token claim, and appearance. It does **not** carry over users — a
production instance starts empty. You will re-invite yourself.

### 2 · Confirm the session-token claim survived the clone

**Clerk → Sessions → Customize session token**, and confirm it reads:

```json
{"metadata": "{{user.public_metadata}}"}
```

Without this claim, `sessionClaims.metadata.role` is always undefined and
**every admin is locked out** — `requireAdmin()` redirects everyone to
`/not-authorised`. This is the first thing to check if auth appears broken
after the cutover.

### 3 · Add Clerk's DNS records in Cloudflare

Clerk → **Domains** → add `talebrim.com` → it lists 4–5 CNAME records
(`clerk`, `accounts`, `clkmail`, and two `clk._domainkey` records).

In Cloudflare → DNS → add each one **with the orange proxy cloud OFF**
(grey cloud / "DNS only"). Proxied records break Clerk's certificate issuance
exactly as they broke Vercel's earlier.

`clkmail` is the one that moves invitation emails out of spam. Do not skip it
because the app appears to work without it.

Wait for Clerk to verify (minutes to ~an hour).

### 4 · Re-register the issuer in Supabase — THE STEP THAT GETS MISSED

**Supabase → Authentication → Third-Party Auth.**

The production Clerk instance has a **different issuer domain** than the dev
one. RLS validates every token against the registered issuer. Miss this and:

> the app signs in fine and then reads nothing — every query returns empty,
> which looks like total data loss rather than one auth setting.

Update (or add) the Clerk integration so the issuer is the production domain
(`https://clerk.talebrim.com`, per the value Clerk shows under
**API keys → Show API URLs → Frontend API URL**).

Keep the development issuer registered too if you still develop locally —
Supabase allows more than one.

### 5 · Swap the keys in Vercel only

Vercel → project → Settings → Environment Variables. For **Production** scope:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → the `pk_live_…` value
- `CLERK_SECRET_KEY` → the `sk_live_…` value

**Local `.env` stays on the development instance.** Do not paste live keys into
it — local development against a production instance means test invitations to
real people and real records.

### 6 · Set `NEXT_PUBLIC_APP_URL`

Same Vercel screen, Production scope:

```
NEXT_PUBLIC_APP_URL=https://talebrim.com
```

`app/actions/team.ts` falls back to `http://localhost:3000` when this is unset,
so **every invitation email would link to localhost**. Trailing slashes are
stripped by the code, so either form works.

### 7 · Redeploy

Vercel does not apply environment-variable changes to the running deployment.
Deployments → latest → **⋯ → Redeploy**.

---

## Verification

Work down this list. Each one catches a different failed step.

1. **Sign in at `talebrim.com`.** Fails → keys (step 5) or DNS (step 3).
2. **The "Development mode" badge under the avatar is gone.** Still there → the
   deployment is still serving `pk_test_`; the redeploy (step 7) did not pick up
   the new value.
3. **The Dashboard shows real counts, not zeros or an error.** Signs in but
   reads nothing → **step 4**, the Supabase issuer. This is the failure that
   looks like data loss.
4. **Invite yourself at a second address.** The email should arrive **not** in
   spam, with **no `[Development]` prefix**, and its link should point at
   `talebrim.com` — not `localhost:3000` (step 6) and not `accounts.dev`.
5. **Accept the invitation, then confirm the new account is blocked** until
   given `role: admin` — it should land on `/not-authorised`. This re-proves
   Task 5's guarantee on the production instance.
6. **Re-grant yourself admin.** Production starts with no users, so your own
   `publicMetadata` must be set again: Clerk → Users → you → Metadata →
   Public → `{"role": "admin"}`.

---

## Rollback

Every step is reversible except deleting the development instance — **don't**.
Keep it; local development uses it.

To roll back: put the `pk_test_` / `sk_test_` values back in Vercel's Production
scope and redeploy. The DNS records and the Supabase issuer registration are
additive and harmless if left in place.
