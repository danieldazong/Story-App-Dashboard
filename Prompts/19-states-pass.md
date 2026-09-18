# 19-states-pass

Read AGENTS.md first and follow it strictly.

**Rewritten 2026-09-17, against the real codebase.** The original assumed a clean slate for
loading states, two routes that no longer exist, and a copy-mapping module that would have
duplicated one already shipped. What survives unchanged is the part that was always the point:
**every screen behaves correctly when data is absent, slow, or broken.**

This is the final pass. No new features. Every screen already works on the happy path.

Study every route under `app/(dashboard)/`, the six existing `loading.tsx` files, the single
existing `error.tsx`, and the query functions in `lib/queries.ts`. You are consolidating, not
adding surface area. Ask before changing any happy-path layout.

## Version branch: already decided

`package.json` pins **next 16.3.5**, which is ≥ 16.3.0, so **use the stable `retry()` prop** in
every `error.tsx`. Do not use `reset()`, and do not pair anything with `router.refresh()`.

`retry()` re-fetches and re-renders the boundary's children, which is what a failed Supabase
read needs. `reset()` only clears error state and re-renders — a failed read would render
straight back into the same failure.

**This includes migrating the boundary that already exists.** `app/(dashboard)/error.tsx` was
written against `reset()` and its comment claims `reset()` "re-renders the segment". On this
version that is the wrong branch. Convert it to `retry()`, keep everything else about it
(the `console.error` with the digest, the withheld `error.message`, the `Reference:` line),
and correct the comment rather than leaving it asserting the old behaviour.

## 1 · Route-level loading — narrower than it looks

**Six `loading.tsx` files already exist** and are correct: `(dashboard)`, `books`, `books/new`,
`books/[bookId]`, `books/[bookId]/chapters/[chapterNumber]`, `settings`. `Skeleton` and
`animate-pulse` appear nowhere else in `src/` except the primitive itself, so **there are no
in-page skeleton branches left to delete.** The original instruction to "replace the in-page
skeletons" and "delete the page-level skeleton branches these replace" is already satisfied.

Remaining work:

- **Add `app/(dashboard)/books/[bookId]/import/loading.tsx`** — this route was built in prompt
  10, after the original prompt 19 was written, and is the only data-fetching route with no
  loading state. Mirror its real shell: breadcrumb, `Import chapters` title, action slot, the
  Manuscript files card with its dashed dropzone at full height. The Matching preview card is
  absent until files are dropped, so the skeleton must not render one.
- **Add `<Suspense>` streaming** where one slow read blocks a whole page: the Dashboard
  activity card, and the Book editor chapters table. The tiles, the needs-attention queue and
  the book details form must not wait on them.

Do not create `app/(dashboard)/uploads/loading.tsx`. That route does not exist — see
*Removed routes* below.

The sidebar never shows a loading state. It is static and lives above every boundary.

## 2 · Route-level errors — the bulk of this prompt

Exactly one `error.tsx` exists, at the `(dashboard)` group root. Add one at each remaining
segment that fetches data:

- `app/(dashboard)/books/error.tsx`
- `app/(dashboard)/books/[bookId]/error.tsx`
- `app/(dashboard)/books/[bookId]/chapters/[chapterNumber]/error.tsx`
- `app/(dashboard)/books/[bookId]/import/error.tsx`
- `app/(dashboard)/settings/error.tsx`

Each is a Client Component rendering inside the normal page container — breadcrumb visible,
card surface, destructive-bordered heading, a muted line with the recovery action, a primary
`Try again` wired to `retry()`, and a muted outline link back to the parent route.

**Never render `error.message`.** In production Next replaces it with a generic string plus an
identifier, and in development it reads as a stack trace to an operator who cannot act on it —
the same reasoning behind `describeDbError`. Render `error.digest` in a mono 12px muted line
labelled `Reference`, and `console.error(error)` on mount so it reaches server logs.

Add `app/global-error.tsx` for root layout failures. It must declare its own `<html>` and
`<body>`, import global styles and fonts itself, and render a minimal centred message —
`global-error` replaces the root layout, so it inherits nothing, including the theme.

**A thrown error and a failed `QueryResult` are different paths.** Most reads in this app
return `{ok:false}` and never throw, which is why `QueryErrorCard` exists and why the incident
that produced `"Could not count missing audio: "` was fixed in `lib/db-errors.ts` rather than
in a boundary. These boundaries are for what genuinely throws: `requireAdmin()`'s Clerk call,
`await params` unwrapping, a mapper meeting malformed data. Do not reroute `QueryResult`
failures through them.

## 3 · Not found

Add `not-found.tsx` at `app/(dashboard)/books/[bookId]/`, at
`app/(dashboard)/books/[bookId]/chapters/[chapterNumber]/`, and at `app/not-found.tsx` for
unmatched URLs.

Replace the inline "Book not found" / "Chapter not found" cards written during prompts 05 and
06 — and repeated verbatim in `books/[bookId]/import/page.tsx` and `chapters/new/page.tsx`.
Those pages should call `notFound()` when the row is missing and let the convention file render
the UI. Book not found links to `/books`; chapter not found links to the parent book.

`notFound()` is for a genuinely absent row only — **never** for an empty list, and **never**
for an RLS rejection, which is an error, not a 404. The existing pages already distinguish
`!result.ok` from `data === null`; preserve that distinction exactly.

## 4 · Empty states audit — mostly verification

Most of this is already built. Walk each one, confirm, and fix only what is listed as a gap.

**Already correct — verify, do not rewrite:**

- Books list, no books — "No books yet" plus the primary action
- Books list, search returns nothing — names the query, offers `Clear search`
- Dashboard, nothing needs attention — "Everything is complete"
- Dashboard, no books at all — a **separate** branch reading "No books yet", deliberately
  structured so it cannot claim completeness over an empty catalog
- Settings, empty team — muted line plus `Invite member`
- Chapter editor, no script — the existing dropzone; no script means empty, not broken

**The one real gap:**

- **Book editor, no chapters** — currently offers `Add chapter` only. Add the bulk action
  alongside it, linking to `/books/<id>/import`. The card's own sub-line has read "Add a
  chapter or import a folder of scripts to get started" since prompt 05, and the import half
  of that promise only became real in prompt 10.

**Copy correction:** the original prompt said the Books-list empty action reads `New book`. It
reads **`New Story`** — renamed across all six call sites. Do not reintroduce the old string.

A zero-book catalog and a fully-complete catalog must never produce the same Dashboard copy.
They already don't; keep it that way.

## 5 · Mutation and action state consistency

Normalise what exists across prompts 14–17 and 10 so the same failure never appears three
different ways.

- every submit button shows a pending label and is disabled while its action is in flight;
  no double-submits
- field errors render beneath their input in destructive 12px; form-level errors render in a
  destructive-bordered strip at the top of the card
- success uses a `sonner` toast with a specific past-tense message naming what changed —
  never a bare "Saved"
- unique-constraint conflicts stay attached to their field, as built in prompt 14
- destructive confirmations keep the type-to-confirm pattern only where it already exists
  (delete book, delete seed data); chapter delete keeps its simple confirmation

**Do NOT create `lib/action-messages.ts`.** The original prompt asked for it; this mapping
already exists in **`lib/db-errors.ts`**, which is shared by reads and writes and which
`classifyDbError` / `describeDbError` / `QueryErrorCard` all route through. It gained a `skew`
kind on 2026-09-17 for clock-drift token rejections. Creating a second copy-mapping module is
the same duplication rejected in prompt 18 over `lib/script-text.ts` — extend the existing one
if a case is missing.

**Use the shipped strings, not the ones the original prompt invented.** It specified "You don't
have permission to change this." and "Couldn't reach the server. Try again."; the app ships
"Your account doesn't have permission to make this change." and "Couldn't reach the database.
Check your connection and try again." Changing them would be a copy change for no reason, which
AGENTS.md forbids. If a form is not routing through `describeDbError`, route it through —
do not restate its copy locally.

An RLS rejection is not retryable. A network failure and a clock-skew rejection both are, and
`withRetry` already retries them for reads.

## 6 · Offline banner — scope confirmed, buttons deliberately excluded

Add a single app-level banner, rendered below the breadcrumb row, that appears when
`navigator.onLine` is false: muted warn treatment, "You're offline. Changes won't save until
the connection returns." It disappears on reconnect.

**Do not disable save and upload buttons.** The original prompt required disabling every
primary save and upload while offline, which would touch every form in the app — the largest
happy-path surface area in a prompt whose own constraints forbid happy-path changes. It is
also unreliable: `navigator.onLine` reports the OS network interface, not reachability, so it
returns `true` on a connected-but-dead network and would leave buttons enabled anyway, while
returning `false` on some VPN configurations and disabling saves that would have worked.

The banner informs; the existing error handling already catches a save that fails. That is the
whole scope. If disabling is wanted later it should be its own prompt, with a reachability
check rather than `navigator.onLine`.

No retry queues, no optimistic offline writes, no local draft persistence.

## 7 · Optional event tracking — ask first

AGENTS.md lists operator event tracking as optional. Do not implement it. State in your summary
whether you recommend it and what the smallest version would be — most likely a single
`lib/track.ts` with a no-op default and named events for book created, chapter created, audio
uploaded, and bulk import completed. Wait for a decision.

## Removed routes — do not build boundaries for these

`/uploads` and `/uploads/bulk-import` appear throughout the original prompt. **Both were
deliberately removed**, along with the Uploads sidebar item, because they were empty
placeholders and a nav item pointing at nothing is worse than no nav item (see AGENTS.md,
A6/A7). Prompt 09 is superseded and should not be implemented: it is written against
`data/mock-activity.ts`, which was deleted in prompt 13, and specifies simulated progress with
"no network, no storage, no real files."

The work those screens would have done now lives elsewhere: per-file progress is inside the
cover, narration, script and bulk-import cards; batch progress is on `/books/<id>/import`; and
the Books list already shows per-book completion ratios.

## Constraints

- No new features, screens, routes, columns, or libraries. Install nothing.
- Do not change any happy-path layout, spacing, or copy. Skeletons must mirror the real layout;
  if a skeleton cannot match, the layout is wrong — flag it, do not redesign it.
- `error.tsx` and `global-error.tsx` must be Client Components; they cannot export `metadata`
  or `generateMetadata`. Use React's `<title>` if a title is needed.
- Flat surfaces only, max 1px borders, no shadows or gradients. Use the existing `Skeleton`
  primitive; no shimmer libraries.
- No spinners on full pages — skeletons only. Spinners are permitted inside buttons and on the
  storage connection test.
- Do not add error boundaries inside the bulk import batch loop; per-row failures are already
  handled as data, not as thrown errors, and a boundary there would abort a batch that is
  designed to continue.
- Strict TypeScript, no `any`, no `@ts-ignore` without a justifying comment.
- Desktop only at 1440×1024. No mobile breakpoints.

## Verification

1. `npm run typecheck`, `npm run lint` (expect exactly the 4 known pre-existing RHF/TanStack
   warnings), `npm run build`.
2. Throttle to Slow 3G and load each route. A skeleton appears immediately, the sidebar never
   flickers, nothing shifts when data lands.
3. Point `NEXT_PUBLIC_SUPABASE_URL` at an invalid host and load each route. The segment
   `error.tsx` renders inside the shell, `Try again` **re-fetches** once the URL is fixed
   (this is the `retry()` behaviour — confirm it actually re-queries rather than re-rendering
   the same failure), and no raw error text or stack reaches the browser.
4. Visit `/books/00000000-0000-0000-0000-000000000000` and `/books/<real-id>/chapters/9999`.
   Both render not-found UI with working back links and return **404, not 200**.
5. Sign in as a non-admin. Confirm the Not authorised page from prompt 11 — not an error
   boundary, not an empty table.
6. With an empty database, load every route and confirm each empty state names its own cause
   and offers its action, and that the Dashboard does not claim everything is complete.
7. Go offline in devtools. The banner appears and disappears on reconnect. Saves are **not**
   disabled — confirm that deliberately, per §6.
8. Throw deliberately from the root layout; `global-error.tsx` renders with its own fonts and
   styles intact.
9. Submit each form twice in rapid succession; only one mutation lands.

## Reference

- error.js convention, `retry` vs `reset`, and production `error.message` behaviour:
  https://nextjs.org/docs/app/api-reference/file-conventions/error
- loading.js convention: https://nextjs.org/docs/app/api-reference/file-conventions/loading
- not-found.js convention: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
- Error handling guide: https://nextjs.org/docs/app/getting-started/error-handling
