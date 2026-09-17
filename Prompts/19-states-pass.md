# 19-states-pass

Read AGENTS.md first and follow it strictly.

This is the final pass. No new features. Every screen already works on the happy path;
this prompt makes every screen behave correctly when data is absent, slow, or broken.

Study every route under `app/(dashboard)/`, the ad-hoc skeletons written into individual
pages during prompts 04–10, and the query functions in `lib/queries.ts`. You are
consolidating, not adding surface area. Ask before changing any happy-path layout.

## Before you start: confirm the Next.js version

Read the `next` version in `package.json`.

- On **16.3.0 or newer**, `error.tsx` boundaries must use the stable `retry()` prop. `retry()`
  re-fetches and re-renders the boundary's children, which is what a failed Supabase read
  needs.
- On **older versions**, only `reset()` exists. `reset()` clears the error state and
  re-renders without re-fetching, so on those versions the recovery button must also force a
  refresh — pair `reset()` with `router.refresh()`.

State which branch you took in your summary. Do not use `reset()` alone on a version where
`retry()` is available, and do not use `retry()` on a version that does not have it.

## 1 · Route-level loading

Replace the in-page skeletons with `loading.tsx` files at each route segment. Each one renders
the real shell of its page — breadcrumb, page title, action slot, and card outlines at their
final dimensions — with `Skeleton` primitives where the data goes. The layout must not shift
when real content arrives.

Create:

- `app/(dashboard)/loading.tsx` — Dashboard: three stat tiles, needs-attention table with
  six skeleton rows at 48px, activity card with five rows
- `app/(dashboard)/books/loading.tsx` — search input, table with eight skeleton rows
  including the 40×60 cover block
- `app/(dashboard)/books/[bookId]/loading.tsx` — two-column details and cover cards, chapters
  table with eight rows
- `app/(dashboard)/books/[bookId]/chapters/[chapterNumber]/loading.tsx` — script card with a
  block of text lines, narration card, settings card
- `app/(dashboard)/settings/loading.tsx` — six card outlines at 720px max width
- `app/(dashboard)/uploads/loading.tsx` — active uploads card, seed import card, activity card

Delete the page-level skeleton branches these replace. Do not leave both.

Where one slow read would otherwise block a whole page, wrap that section in `<Suspense>` with
its own skeleton fallback so the rest of the page streams immediately. Apply this to the
Dashboard activity card and the Book editor chapters table specifically — the tiles, the
needs-attention queue, and the book details form must not wait on them.

The sidebar never shows a loading state. It is static and lives above every boundary.

## 2 · Route-level errors

Add `error.tsx` at each segment that fetches data: the `(dashboard)` group root,
`books`, `books/[bookId]`, `books/[bookId]/chapters/[chapterNumber]`, `settings`, `uploads`,
and `uploads/bulk-import`.

Each is a Client Component rendering inside the normal page container — breadcrumb visible,
card surface, destructive-bordered heading "Couldn't load this page", a muted line with the
recovery action, a primary `Try again` button wired per the version branch above, and a muted
outline link back to the parent route.

Never render `error.message` from a Server Component error; the docs are explicit that those
are replaced with a generic message plus an identifier in production. Render `error.digest` in
a mono 12px muted line labelled "Reference" so an operator can quote it, and call
`console.error(error)` on mount so it reaches server logs.

Add `app/global-error.tsx` for root layout failures. It must declare its own `<html>` and
`<body>`, import global styles and fonts itself, and render a minimal centred message —
global-error replaces the root layout, so it inherits nothing, including the theme.

## 3 · Not found

Add `not-found.tsx` at `app/(dashboard)/books/[bookId]/` and at
`app/(dashboard)/books/[bookId]/chapters/[chapterNumber]/`, plus one at `app/not-found.tsx`
for unmatched URLs.

Replace the "unknown book id" and "unknown chapter" cards written inline during prompts 05 and
06: the page queries should now call `notFound()` when the row is missing, and the convention
file renders the UI. Book not found offers a link to `/books`; chapter not found offers a link
to the parent book.

`notFound()` must be called for a genuinely absent row only — never for an empty list, and
never for an RLS rejection, which is an error, not a 404.

## 4 · Empty states audit

Walk every list and table and confirm each empty state is specific about _why_ it is empty and
offers the one action that resolves it. Fix anything that renders a bare "No data".

- Books list, no books — "No books yet." plus the primary `New book` action
- Books list, search returns nothing — names the query, offers `Clear search`
- Book editor, no chapters — "No chapters yet." plus `+ Add chapter` and
  `Upload scripts in bulk`
- Chapter editor, no script — existing dropzone; no script means empty, not broken
- Dashboard, nothing needs attention — status-ok treatment, "Everything is complete."
- Dashboard, no books at all — tiles read zero and the needs-attention card offers `New book`
  rather than claiming completeness
- Dashboard and Uploads activity, no entries — single muted line
- Uploads, empty queue — "No transfers in progress." plus `Add files`
- Bulk import, no book selected and no files — existing prompts, unchanged
- Settings, empty team — muted line plus `Invite member`

A zero-book catalog and a fully-complete catalog must never produce the same Dashboard copy.

## 5 · Mutation and action state consistency

Normalise what already exists across prompts 14–18 so the same failure never appears three
different ways.

- every submit button shows a pending label and is disabled while its action is in flight;
  no double-submits
- field errors render beneath their input in destructive 12px; form-level errors render in a
  destructive-bordered strip at the top of the card
- success uses a `sonner` toast with a specific past-tense message naming what changed —
  never a bare "Saved"
- an RLS rejection anywhere renders "You don't have permission to change this." and is not
  retryable
- a network failure renders "Couldn't reach the server. Try again." and is retryable
- unique-constraint conflicts stay attached to their field, as built in prompt 14
- destructive confirmations keep the type-to-confirm pattern only where it already exists
  (delete book, delete seed data); chapter delete keeps its simple confirmation

Centralise the mapping from a typed action result to user-facing copy in one module —
`lib/action-messages.ts` — and have every form call it. Do not scatter these strings.

## 6 · Offline and stale

Add a single app-level banner, rendered below the breadcrumb row, that appears when
`navigator.onLine` is false: muted warn treatment, "You're offline. Changes won't save until
the connection returns." It disappears on reconnect. Disable every primary save and upload
button while offline.

Do not build retry queues, optimistic offline writes, or local draft persistence. The banner
and the disabled buttons are the whole scope.

## 7 · Optional event tracking — ask first

AGENTS.md lists operator event tracking as optional. Do not implement it. Instead, state in
your summary whether you recommend it and what the smallest version would be — most likely a
single `lib/track.ts` with a no-op default and named events for book created, chapter created,
audio uploaded, and bulk import completed. Wait for a decision.

## Constraints

- No new features, screens, routes, columns, or libraries. Install nothing.
- Do not change any happy-path layout, spacing, or copy. Loading skeletons must mirror the real
  layout; if a skeleton cannot match, the layout is wrong and you should flag it, not redesign
  it.
- `error.tsx` and `global-error.tsx` must be Client Components; they cannot export `metadata`
  or `generateMetadata`. Use React's `<title>` if a title is needed.
- Flat surfaces only, max 1px borders, no shadows or gradients. Skeletons use the existing
  primitive; no shimmer libraries.
- No spinners on full pages — skeletons only. Spinners are permitted inside buttons and on the
  storage connection test.
- Do not add error boundaries inside the Bulk import batch loop; per-row failures are already
  handled as data, not as thrown errors.
- Strict TypeScript, no `any`, no `@ts-ignore` without a justifying comment.
- Desktop only at 1440×1024. No mobile breakpoints.

## Verification

1. Throttle the network to Slow 3G and load each of the seven routes. Confirm a skeleton
   appears immediately, the sidebar never flickers, and nothing shifts position when data
   lands.
2. Point the Supabase URL at an invalid host and load each route. Confirm the segment
   `error.tsx` renders inside the shell, `Try again` recovers once the URL is fixed, and no raw
   error text or stack reaches the browser.
3. Visit `/books/00000000-0000-0000-0000-000000000000` and
   `/books/<real-id>/chapters/9999`. Confirm both render not-found UI with working back links
   and return a 404 status, not 200.
4. Sign in as a non-admin. Confirm you get the Not authorised page from prompt 11, not an
   error boundary and not an empty table.
5. Empty the database entirely. Load every route and confirm each empty state names its own
   cause and offers its action. Confirm the Dashboard does not claim everything is complete.
6. Go offline in devtools. Confirm the banner appears, saves and uploads are disabled, and both
   recover on reconnect.
7. Throw deliberately from the root layout and confirm `global-error.tsx` renders with its own
   fonts and styles intact.
8. Submit each form twice in rapid succession and confirm only one mutation lands.
9. Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

## Reference

- error.js convention, including the `retry` vs `reset` distinction and the production
  `error.message` behaviour: https://nextjs.org/docs/app/api-reference/file-conventions/error
- loading.js convention: https://nextjs.org/docs/app/api-reference/file-conventions/loading
- not-found.js convention: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
- Error handling guide: https://nextjs.org/docs/app/getting-started/error-handling
