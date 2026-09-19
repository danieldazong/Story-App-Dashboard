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
**Development**) → **+ Create production instance**.

**Clone failed on the Hobby plan (2026-09-19).** Cloning tried to carry over
**Hide Clerk branding**, which is free on development instances and paid on
production ones, and stopped with an `Upgrade plan` prompt. Declined — that
setting only controls a "Secured by Clerk" line on the sign-in card, which is
cosmetic on an internal admin tool nobody outside the team ever sees. Took
**Create default instance** instead.

The consequence is that step 2 below is **mandatory configuration, not a
verification** — a default instance does not carry the session-token claim.

A production instance starts with **no users** regardless of which path is
taken. You will re-invite yourself (verification 6).

### 2 · Set the session-token claim — MANDATORY on a default instance

**Clerk → Sessions → Customize session token**, and set it to exactly:

```json
{"metadata": "{{user.public_metadata}}"}
```

`lib/auth.ts` reads `sessionClaims?.metadata?.role` in both `isAdmin()` and
`requireAdmin()`. Without this claim that value is `undefined` for **every**
user, so `requireAdmin()` redirects everyone — including you — to
`/not-authorised`. **This locks you out of your own dashboard**, and it is the
first thing to check if auth appears broken after the cutover.

Also confirm on a default instance, since these were not cloned either:

- **Email sign-in is enabled** (Clerk → User & Authentication → Email, phone,
  username). Invitations require it — see Deferred Security Task 2, which
  exists because turning it off breaks the invite flow with
  `400 invitations_not_supported`.
- **Application name** reads `Talebrim`, since it renders in the sign-in card
  and in invitation emails.

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

It is **not** in the left menu. It lives under
**Authentication → Sign In / Providers → Third-Party Auth** tab, or directly at
`/project/<ref>/auth/third-party`.

**Add provider → Clerk**, and enter the domain **with the scheme**:

```
https://clerk.talebrim.com
```

A bare `clerk.talebrim.com` is rejected: *"Production Clerk domains use HTTPS
and start with the clerk subdomain."* Match the format of the existing dev
entry.

Confirm the value first, rather than assuming the subdomain:

```sh
curl -s https://clerk.talebrim.com/.well-known/openid-configuration \
  | python -c "import sys,json;print(json.load(sys.stdin)['issuer'])"
```

**Add, do not replace.** Keep the development issuer registered — local `.env`
still runs against the dev instance, and deleting it breaks local development
immediately. Supabase allows several, and MAU billing counts distinct users,
not integrations. Done 2026-09-19: both entries present and ENABLED.

### 4b · Enable the Supabase integration on the CLERK side

Registering the domain in Supabase only makes Supabase *trust* Clerk. Clerk
must also **inject the top-level `role: "authenticated"` claim**, and that only
happens with its Supabase integration switched on.

**Clerk → Configure → Developers → Integrations → Supabase → enable.**

Every RLS policy on this database targets `to authenticated` (AGENTS.md, RLS).
Without the claim, tokens are refused and **every query returns empty** — the
same "signs in fine, then reads nothing" symptom as a wrong issuer, from a
different cause. The dev instance has had this enabled since prompt 12
(AGENTS.md records the decoded token carrying both `role: "authenticated"` and
`metadata.role: "admin"`); a **default** production instance does not inherit
it.

### 5 · Swap the keys in Vercel only

Vercel → project → Settings → Environment Variables. For **Production** scope:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → the `pk_live_…` value
- `CLERK_SECRET_KEY` → the `sk_live_…` value

**Local `.env` stays on the development instance.** Do not paste live keys into
it — local development against a production instance means test invitations to
real people and real records.

**Vercel locks a variable's Type at first save, and it matters here.** A
variable saved as **Secret** can never be changed to **Config** — the only way
out is to delete and re-add it. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be
**Config**: Vercel *refuses to save* a `NEXT_PUBLIC_`-prefixed variable marked
Secret, because Next.js compiles that prefix into the browser bundle and the
value is public by definition. Clerk says the same of the key itself — "can be
safely shared, does not need to be kept secret." `CLERK_SECRET_KEY` is the
opposite and stays **Secret**.

The "Add Environment Variable" dialog applies **one Type to every variable in
it**, so these two cannot be added together. Add them in separate saves.

> **The production secret key was exposed on 2026-09-19** — pasted into a
> screenshot during this cutover, the same way the development key was on
> 2026-09-16 (Deferred Security Task 1). **It must be rotated**, and the order
> matters: Clerk → API keys → **+ Add new key** → update Vercel → redeploy →
> **then** delete the old key. Reversing that leaves a window with no working
> key. Until it is done, treat the live instance as holding a compromised
> credential.

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


---

## Google sign-in on a production instance (2026-09-19)

The production instance was created as a **default** instance, so it carried no
SSO connections. Adding Google is not the one-click toggle it is in
development: Clerk's own page says **"You must provide your own credentials on
production instances."** Clerk's shared OAuth app is development-only. That is
why `localhost` shows a Google button and `talebrim.com` does not until this is
done — both are behaving correctly.

What it takes, all free and needing no Google Cloud billing account:

1. **Google Cloud Console** → create project `Talebrim`. Ignore the $300 trial
   prompt; OAuth credentials cost nothing.
2. **Google Auth Platform** (the rebranded OAuth consent screen) → App
   Information, Audience **External**, Contact Information → Create. Add no
   scopes: Clerk already supplies `openid`, `userinfo.email` and
   `userinfo.profile`.
3. **Clients → Create client** → *Web application*, and one **Authorized
   redirect URI**, copied from Clerk's Google page:
   `https://clerk.talebrim.com/v1/oauth_callback`. Leave **Authorized
   JavaScript origins empty** — Clerk redirects server-side. A mismatch here
   surfaces as `redirect_uri_mismatch` at sign-in and nothing else explains it.
4. Paste the **Client ID** and **Client Secret** into Clerk → SSO connections →
   Google OAuth → *Use custom credentials*, toggle **Enable for sign-up and
   sign-in**, then **Enable connection**.

**The client secret is shown once.** Google's dialog says so plainly: close it
without copying and the only remedy is a new client. `Download JSON` is the
safe option.

**A new OAuth app starts in Testing mode**, where only email addresses listed
under *Audience → Test users* can sign in — everyone else gets "access
blocked", which reads as a broken integration rather than a setting. **Publish
the app** (Audience → Publish app). Verification is not required at these
scopes.

Google warns that changes take **5 minutes to a few hours** to propagate. An
immediate failure right after setup is not evidence of a misconfiguration.

Google sign-in grants no authority on its own: a user arriving this way still
needs `role: admin` in `publicMetadata`, or `requireAdmin()` sends them to
`/not-authorised` (Deferred Security Task 5).

> **The Google client secret was also exposed in a screenshot on 2026-09-19**,
> the third credential today. Lower severity than the Clerk keys — it only
> permits Google sign-in for this app and is useless without a matching
> redirect URI — but it should still be rotated once sign-in is confirmed
> working: Google Cloud → Clients → the client → **Add secret**, paste the new
> one into Clerk, then delete the old. Same new-first ordering as every other
> rotation here.


---

## Rolled back on 2026-09-19, cause unresolved

The cutover completed and was verified — sign-in worked, the Dashboard rendered
real counts, the "Development mode" badge was gone. **Then the sign-in card
stopped rendering**: `talebrim.com/sign-in` returned 200 with the "Talebrim"
wordmark and nothing else. No console error, no failed request, reproducible in
a **Guest profile** (so not an extension) and in a second browser.

Rolled back by putting the `pk_test_` / `sk_test_` values back in Vercel and
redeploying — about three minutes, and the card returned immediately. The
production instance keeps everything configured: DNS, certificates, the
Supabase issuer registration, the session-token claim, the Supabase
integration, Google OAuth. Retrying is swapping those two variables back.

**The cost of the rollback** is the four symptoms returning — invitation emails
in spam, `[Development]` subjects, the dev-mode badge. Everything works; none
of it is production-grade.

### What was ruled out, with evidence

| Suspect | Disproof |
|---|---|
| Google Cloud / OAuth | The whole card failed, email field included; Google only matters after clicking its button |
| Browser extensions | Blank in a Guest profile, which loads none |
| Stale cookies | Blank in a fresh profile and a second browser |
| Clerk JS unreachable | 200, valid JS, `Content-Type: application/javascript`, CORS `*` |
| App JS chunks | All 200 |
| The sign-in page code | Unchanged, and the `<span>` above `<SignIn />` renders |
| Wrong key deployed | Correct `pk_live_` present in the bundle |
| Stale build | `X-Vercel-Cache: MISS`, `Age: 0`, correct `X-Matched-Path` |
| **Bot protection / Turnstile CAPTCHA** | **Disabled it; no change. And the DEV instance has `captcha_widget: smart` too and renders fine — so it was never a plausible cause.** |

### The mistake worth recording

Three theories were chased — stale cookies, extensions, then CAPTCHA — each
costing a round trip, before any browser-side evidence was gathered. **The
CAPTCHA disproof was available the entire time**: one query against the dev
instance's `/v1/environment` shows it runs the same Smart CAPTCHA and renders
correctly. That check was run only *after* the setting had been turned off.

This is the same failure this file's Debugging Playbooks already describe —
*"get the real stack before theorising"*, and the three wrong fixes shipped by
reasoning from the collapsed stack. Diagnosing a browser-side failure from
`curl` is the same error in a different costume: everything reachable from
outside was healthy, which proved only that the problem was somewhere `curl`
cannot see.

### Start here next time

On the blank page, in the browser console:

```js
console.log({ clerk: !!window.Clerk, status: window.Clerk?.status, loaded: window.Clerk?.loaded })
```

- `clerk: false` → the script never executed (and it is not the network — the
  file serves 200 valid JS)
- `clerk: true, loaded: false` → Clerk loaded, handshake never completed
- `clerk: true, loaded: true` → Clerk is fine and `<SignIn />` itself failed to
  mount, which is a different problem entirely

Then **Network tab, filter `clerk`**, and read the status of
`clerk.browser.js`, `/v1/environment` and `/v1/client`.

Do not re-test bot protection. It is disproven above.
