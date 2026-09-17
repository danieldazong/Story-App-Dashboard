# AGENTS.md — NovelNow Admin Dashboard

You are an expert Next.js + TypeScript engineer helping build a production-quality internal content management dashboard.

You write clean, simple, maintainable code. You prioritize clarity over unnecessary abstraction because this dashboard is built feature by feature and must stay easy to reason about.

You should think like a senior web developer, and implement like someone building an operational tool that real people use every day to get work done.

---

## Project Overview

We are building the **NovelNow Admin Dashboard**, the internal CMS used to load content into the NovelNow mobile reading app.

Its entire purpose is to ensure content exists to consume. Without it there are no books, no chapter text and no audio streams to develop or test the mobile app against.

The dashboard handles:

- book and chapter management — titles, authors, descriptions, synopsis, genres, maturity
- cover image uploads
- chapter script uploads and inline text editing
- direct-to-storage narration audio uploads with automatic duration detection
- chapter access control (free vs locked)
- a work queue showing what content is unfinished
- seeding 2–3 multi-chapter serials with real audio, cover art and formatted chapter text

This is an **internal, desktop-web, admin-only tool**. It is not a public authoring platform and it is not responsive to mobile. It is not an analytics product.

---

## Tech Stack

Use the following stack:

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Table (for sorting, filtering, pagination)
- Clerk for authentication (`@clerk/nextjs`), admin role enforced
- Supabase PostgreSQL for data (`@supabase/supabase-js`)
- Supabase Storage for media, buckets `audio/`, `covers/`, `scripts/`
- `tus-js-client` or Uppy for resumable large-file uploads
- Server Actions or Route Handlers for anything requiring privileged access

Do not introduce new major libraries unless there is a strong reason.

**Explicitly not in scope:** charting libraries, analytics SDKs, telemetry, dashboards-of-metrics. See UI Quality Bar.

---

## Development Philosophy

Build feature by feature.

For every feature:

1. Understand the user request.
2. Check this file before coding.
3. Keep the implementation simple.
4. Avoid overengineering.
5. Prefer readable code over clever code.
6. Build the smallest useful version first.
7. Refactor only when repetition or complexity appears.
8. Finish vertically — a screen is done when it reads and writes real Supabase data and handles loading, empty, error and failure states.

The bias of this tool is toward **operator throughput**. Every screen should reduce the number of clicks between "content is missing" and "content is loaded".

---

## Decision Making & Clarifications

If something is unclear or could be improved:

- Proactively suggest better approaches
- If a new library would significantly simplify the implementation:
  - Recommend the library
  - Clearly explain why it is useful
  - Ask the user for permission before adding or installing it

Example:

> "Chapter tables run past 100 rows, so adding TanStack Table's virtualizer would keep scrolling smooth. Do you want me to add it?"

Do not install or use new libraries without user approval.

Also:

- Never replace a documented pattern with a deprecated one, even if an older snippet shows it (see Supabase Rules).
- Never invent product data — counts, durations, file sizes, dates and totals come from the database, never from the design frames.
- Never add a metric, chart or statistic that was not asked for.

---

## Architecture Guidelines

Use this structure unless there is a strong reason to change it:

```txt
app/
  (dashboard)/
    page.tsx              # Dashboard work queue
    books/
    uploads/
    settings/
  api/
components/
  ui/                     # shadcn/ui primitives
  books/
  chapters/
  uploads/
constants/
data/
hooks/
lib/
types/
```

### app/

Routes and pages only.

Pages compose components and call hooks or server actions. They should not contain large reusable UI blocks or business logic.

Prefer Server Components for reading data. Use Client Components only where interactivity requires it — forms, tables with client-side sort, upload widgets, editors.

### components/

Create a component only when:

- it is reused in multiple places
- it makes a page easier to read
- it represents a clear UI concept like `BooksTable`, `ChapterRow`, `CoverDropzone`, `AudioUploadCard`, `StatusPill`, or `UploadProgressRow`

Do not create tiny one-off components too early.

When unsure, ask:

> Should this UI be extracted into a reusable component, or should I keep it inside the current page for now?

---

## UI Implementation Rules (VERY IMPORTANT)

For any UI-related task:

- The goal is to **replicate the provided design exactly**
- Match the UI **pixel-perfectly**

When the user provides a design image:

You MUST:

- match layout exactly
- match spacing and padding
- match font sizes and hierarchy
- match colors precisely
- match border radius and border widths
- match alignment and positioning
- match proportions of elements
- replicate all visible UI elements
- match component states: default, hover, focus, disabled, draft, published, locked, free, uploading, processing, complete, failed
- match which option is filled in every segmented control

Do not approximate. Do not simplify unless explicitly asked.

### What is NOT binding in a design image

The V1 frames were produced by a UI generator. **All content inside them is placeholder** and must never be hardcoded:

- book titles, author names, descriptions, synopsis and chapter titles
- counts and totals — book counts, chapter counts, audio ratios, missing-audio counts, footer tallies, stat tiles
- durations, word counts, read times, file names, file sizes, IDs
- dates, timestamps, activity-log rows
- user names, emails, team rows
- bucket names, CDN domains, provider selections

All of it renders from Supabase or from settings config. Placeholder values are useful only as a hint at realistic string lengths — build for overflow, truncation and wrapping.

Numeric disagreements between frames (the same serial showing different chapter counts on two screens) are placeholder noise, not defects. Do not reconcile them and do not preserve them as data.

### Known design-file defects — fix, do not replicate

- book titles truncated where the column has room
- doubled breadcrumb separators — one separator between segments
- segmented controls filled on the wrong option; the **selected** option is dark-filled with light text, unselected is white with a `#E7E1DC` border. Defaults: Maturity `Mature 18+`, chapter Access `Locked`
- **`Mature 17+` vs `Mature 18+` — the label is `Mature 18+` everywhere.** The Settings frame (`material/5.png`) and prompt 08's own spec text both read `Mature 17+`, as did earlier frames. This file, `data/maturity-levels.ts`, and an explicit user rename during the prompt-21 follow-ups all say `Mature 18+`. The Settings screen renders the label from `MATURITY_LEVELS` rather than the prompt's literal string, so the two maturity segmented controls (Book editor and Settings) cannot drift apart. Flagged rather than silently chosen, per the provenance note above: the image wins for layout, this file wins for tokens and copy. Note the underlying enum value is still `mature_17` — only the display label is 18+; renaming the enum is a schema change belonging to prompt 12, not a copy fix.
- duplicate upload buttons on the upload surfaces — one path only
- invented telemetry in earlier frames (catalog status, bandwidth, session IDs, CDN info, ISBN lines) — delete all of it, do not build it

## Debugging Playbooks

Procedures for classes of bug this project has already lost time to. Each one records what the symptom looks like, what the cause turned out to be, and — most importantly — which plausible-sounding explanations are **already ruled out**, so they are not re-investigated.

### Debugging `setState`-during-render (React + react-hook-form)

**Symptom:** `Cannot update a component ('X') while rendering a different component ('Controller')`, usually after a form submit succeeds.

**Step 1 — get the real stack before theorising.** The error overlay shows ~4 frames by default: the component *tree* (`FormField → SomeForm → SomeParent → SomePage`). That tells you where React was standing, **not who called `setState`**. Click **"Show N ignore-listed frame(s)"** and read the expanded trace. Three wrong fixes were shipped on this project by reasoning from the collapsed view. Do not skip this step; ask the user for the expanded stack if you cannot reproduce it yourself.

**Step 2 — read the middle of the stack, not the ends.** The frames between React's scheduler and the component tree name the mechanism. On this project the answer was:

```
Controller → useController → register → updateValidAndValue
  → _setValid → _runSchema → _updateIsValidating
  → subject.next() → sibling Controller's subscriber → dispatchSetState
```

**Step 3 — understand the RHF cascade this reveals.** A form with N `Controller`s shares **one notification subject**. Anything that re-registers a field re-runs the resolver (when `mode: "onChange"` plus a schema resolver is configured) and publishes to that subject, which synchronously calls `setState` in *every other* field's subscriber. If React is mid-render when that fires, you get this warning. React names the *owner* of the updated component, which is often not where the offending call lives — see the owner/renderer note below.

**Step 4 — find which API triggered the re-registration.** On this project it was `form.reset(values)` used to clear the dirty flag after a successful save.

**The rule that prevents it: `reset()` is for discarding a form. `resetDefaultValues()` is for accepting a save.** `reset()` tears down and re-registers every field. `resetDefaultValues(values)` moves the dirty baseline **without touching user values**, so nothing re-registers, the resolver never re-runs, and the cascade never starts. RHF's own JSDoc names this exact use case: *"After a successful submission, update defaults to the submitted values so that dirtyFields/isDirty reflect changes made after that point."*

**Already ruled out on this project — do not re-investigate:**

| Suspected cause | Why it is not the cause |
| --- | --- |
| `await` inside `startTransition` | A real latent hazard, and the rewrite off `useTransition` was kept — but the warning reproduced from interactions containing no `await` at all. |
| `ChapterComposer`'s `useEffect` → `form.setValue` | Targets the composer's *own* `useForm` instance; it can never name a different component as the updater. |
| The submit path (`handleSubmit` → `setFormError`/`setSaving`) | `handleSubmit` is `async` and awaits `_runSchema()` before invoking the handler, so those land in a microtask continuation of the submit event, never in a render phase. |
| `Controller` writing state during render | `Controller` is `(props) => props.render(useController(props))` — no side effects by design. |
| `router.refresh()` | Async and wrapped in Next's own router transition. Never a synchronous trigger. |
| `useWatch` re-renders on keystroke | Would fire while typing; this warning fired only after Save. Confirmed by user repro. |

**Deferring is not fixing.** A `queueMicrotask(() => form.reset(values))` version shipped briefly and appeared to help. The next stack contained `processRootScheduleInMicrotask` — React flushing the same cascade *inside the microtask the fix had created*. It relocated the collision to a different tick. **Treat `queueMicrotask` / `setTimeout` / "defer it" as a smell whenever the root cause is not yet identified**: symptoms move, evidence gets muddier, and a testing round is burned.

**Related React behaviour worth knowing: a component passed as a prop is rendered by the receiver but owned by the sender.** `<PageHeader action={<SaveButton />} />` creates `SaveButton` in the parent's render but renders it inside `PageHeader`. When it subscribes to external state, React attributes its updates to the *sender*. This is why these warnings routinely name two components that look unrelated to the actual call site — and why the component names in the message are a weak signal compared to the expanded stack.

### A failed read must not become a confident lie

The Dashboard once rendered `Could not count missing audio:` — a context string, a colon, and nothing at all — while the card below it announced **"No books yet"** over a catalog of two books whose activity was listed underneath. One dropped packet, two distinct defects. Both are now fixed; the reasoning is what matters when the next one appears.

**An empty message is not a message.** postgrest-js surfaces a caught transport failure as an error object whose body it never got to read, so `.message` can be `""`. Any `` `${context}: ${error.message}` `` template turns that into a visibly broken sentence. `describeDbError` in `lib/db-errors.ts` guards it. Note the ordering inside that function: **code tests run before the empty-message check**, because an error can carry `42501` *and* no message, and that is a permission problem, not a connectivity one.

**Translate errors once, for reads and writes alike.** `describeDbError` used to live in `app/actions/types.ts`, which made it reachable only by Server Actions — so every read in `lib/queries.ts` rendered raw Postgres strings straight to the operator. It lives in `lib/db-errors.ts` now and `types.ts` re-exports it. If a file in the actions folder ever gains `"use server"`, a pure synchronous function exported from it silently becomes an async RPC stub; that is why the shared layer belongs in `lib/`.

**Never collapse "unknown" into "empty".** `hasBooks = counts.ok && counts.data.books > 0` treats a *failed* count exactly like a count of zero. The fix is three states, not two (`"unknown" | "empty" | "populated"`), and — more durably — **ordering the render so data that did arrive wins**: the Dashboard now checks `attention.data.length > 0` *before* it consults the catalog size, which makes the card structurally incapable of claiming emptiness beside a populated table. Prefer that kind of fix to a guard, because a guard can be forgotten and an ordering cannot.

**Retry transport failures only, and only in the read path.** `withRetry` in `lib/queries.ts` retries once, after ~250ms, when the message is empty or network-shaped. A permission denial is deterministic — retrying it wastes a round trip and delays an error the operator needs now. It is deliberately **not** installed on the Supabase client's `fetch`: that would silently retry *writes*, and replaying a non-idempotent insert after an ambiguous timeout is how a book ends up with two copies of chapter one.

**Don't let an error card guess.** `QueryErrorCard` used to assert "your account may not have operator access to this data" on every failure, which sent an operator to audit Clerk roles in response to a Cloudflare routing blip. It now varies by `DbErrorKind` and, for an unclassifiable error, says nothing beyond the translated message. Saying nothing beats guessing wrong.

### Debugging "this looks like our bug but is actually the network"

Several failures on this project presented as application errors and were not. Before changing code in response to a `fetch`/auth/load failure, check reachability from the machine itself:

- **Clock skew.** A clock more than ~60s off makes every freshly-minted JWT look expired. This cost a debugging session once (184s skew produced an endless Clerk redirect loop that looked exactly like misconfigured keys). Compare local time against a server's `Date` header.
- **Direct reachability.** `Invoke-WebRequest` the exact failing URL a few times. If it returns `200` repeatedly from the shell while the browser fails intermittently, it is a transport problem (on this machine: flaky IPv6 routing to Cloudflare), not a code defect.
- **Known instances of this:** Clerk `/touch` timeouts, `ClerkRuntimeError: Failed to load Clerk JS`, and a `TypeError: fetch failed` that reached the UI. The first two required **no code change at all**. See `docs/AUTH-SETUP.md`.

**But check whether the app handles it gracefully, which is a separate question.** The `fetch failed` incident revealed two genuine defects worth fixing even though the trigger was environmental: `describeDbError` leaked a raw `TypeError` string to the operator, and the cover upload hung forever at `0.0 KB` because no timeout guarded a Server Action call that could never resolve. A transient network fault is not your bug; silently hanging or showing a stack trace in response to one is.

### Known implementation defects — fix, do not replicate

- **Chapters table column misalignment** — Text, Audio and Access header cells must share one column definition with their body cells so values line up under their own headers, not bunched under Title. The action column is fixed-width and right-aligned so `⋯` and `>` sit on a single vertical axis for every row.
- **Nested scroll container** — the Chapters table must not have its own inner scrollbar inside the page scroll. Long lists virtualise within the page scroll with a sticky table header. Never a second scrollbar.
- **Overflow menu escapes the card** — the Books list and Chapters table `⋯` menus must use collision-aware placement so they flip inside the viewport/card on the last rows, rather than rendering past the edge.
- **Cover fixture format mismatch** — a seed cover file name must match the accepted-formats copy shown next to it. The original defect was a `.png` fixture paired with "JPG or WebP" copy — fixed at the time by converting the fixtures to real `.jpg`, not by widening the allowlist. The allowlist itself was later deliberately widened to include PNG (constraint line now "JPG, PNG or WebP") at explicit user request — that's a real product decision, not a case of this defect recurring. The rule this entry protects is narrower than "never widen the allowlist": it's "the fixture's actual file format and the copy shown next to it must always agree."
- **Overflow menu items** — `Open` is a live action everywhere, not a disabled placeholder — including in the Chapters table, where it now navigates to `/books/<id>/chapters/<n>` (re-enabled once prompt 06 built that page; see the Chapters-table-specific note below). In the Chapters table, `Set free`/`Set locked` and `Delete chapter` (with a confirm dialog) are also live, operating on the book editor's local chapter state — see "Local-only chapter creation". `Delete book` (Books list) stays disabled — deleting a whole book with its cover/chapters/assets is a materially bigger, more destructive action than a single local-only chapter edit, and remains gated on a real delete path. The Books list overflow menu's `Add chapter` item was removed entirely — since the Chapter composer only exists on the book editor page, it could only ever navigate to the same place as `Open` (`router.push('/books/<id>')`), making it a redundant duplicate of an item already in the same menu.
- **Chapters table row click, `Open`, and `+ Upload text`/`+ Upload audio`** all navigate to `/books/<bookId>/chapters/<number>` (`ChaptersCard` takes `bookId` again). These were disabled or replaced with in-row-only file pickers during prompt 21's work because that destination page didn't exist yet — re-enabled once prompt 06 built it, restoring the Project Rules' "single upload surface" intent (see Upload Rules). Every `DropdownMenuItem`'s `onClick` still calls `event.stopPropagation()` so a menu click can't bubble up through React's portal tree and trigger the row's own navigation — that was the actual cause of a 404 the first time this was tried, not the navigation itself.
- **Locally-created chapters now open correctly — on an existing book.** A chapter created via the Chapter composer or Manuscript import used to be a dead end — it exists only in `book-editor.tsx`'s React state, never in `mock-catalog.ts`, so clicking into it 404'd on the chapter editor's Server Component page (which only reads mock data). Fixed by mirroring locally-created chapters (the delta between current state and the seeded `mode.chapters`) into `sessionStorage`, keyed by book id, via `lib/local-chapters.ts` (`readLocalChapters`/`writeLocalChapters`). When the chapter editor route's server-side mock lookup misses, it now renders `ChapterEditorResolver` (`components/chapters/chapter-editor-resolver.tsx`) — a Client Component that checks `sessionStorage` via `useSyncExternalStore` (not `useEffect` + `setState`, which the React Compiler's lint rule correctly flags as cascading-render-prone for this exact "read external state once per mount" case) before falling back to "not found." This is still not persistence: a new tab, a real reload of the underlying mock data, or simply not having visited the book editor first in that tab all see nothing — same honesty rule as everything else in this app. **Known remaining gap**: previous/next navigation computed from a *seeded* chapter (the normal, non-resolver path) does not know about locally-created chapters interleaved in the sequence, since that computation happens server-side before any client-only data exists — only the resolver path (opened directly on a local chapter) merges both sets. Flagged, not fixed, since extending it would require the Server Component to somehow know about client-only state, which it structurally cannot.
- **Chapter rows are not clickable on `/books/new` (create mode).** The fix above only works because an *existing* book has a real, stable `book.id` to key `sessionStorage` by and to route to (`/books/<id>/chapters/<n>`). On the create screen `book` is `null`, so `ChaptersCard` receives `bookId=""`, and a chapter link built from that collapses to a malformed URL (`/books//chapters/1` → normalized to `/books/chapters/1`), a genuine 404 unrelated to the sessionStorage fix. `ChaptersCard` now derives `canOpenChapter = bookId !== ""` and disables every navigation surface when it's false — row click (no `onClick`, no `cursor-pointer`), `+ Upload text`/`+ Upload audio`, and the `Open` menu item — rather than link to a page that cannot exist yet. A chapter composed on the create screen is still fully visible and editable via the composer itself; only "open it as its own page" is unavailable, which is correct, since there is no id for that page to be at until the book is actually created (and book creation itself does not persist yet either — see "Create Story dialog").

### Mockup artifacts — do not implement

The Chapter composer mockup (`material/new-story-page-update.png`) contains four errors. Match its structure and card composition; do not replicate these:

- Chapter number pre-filled as a nonzero value (e.g. `13`) on a book with zero chapters — always compute it (`highest existing number + 1`, or `1`).
- Populated chapter rows with a sub-line reading `0 chapters · 0 with text · 0 with narration` that disagrees with the rows shown — the two cannot both be true; the sub-line is always computed from the same chapters actually rendered in the table, never hardcoded independently of it.
- Narration audio card missing its dashed dropzone frame while Cover and Manuscript keep theirs — Narration audio keeps the same frame treatment.

> Superseded note: two earlier revisions of this file described the composer's script file-row as locked — first book-level-locked in create mode, then chapter-level-locked in both modes. Neither holds any more: the script file picker reads `.txt`/`.md` client-side with no storage write (see "Local-only chapter creation" above), so it was never actually subject to the governing rule and is live in both modes, same as the rest of the composer.

---

## Design System

### Colors

| Token            | Hex       | Use                                      |
| ---------------- | --------- | ---------------------------------------- |
| `page`           | `#FBF9F7` | Page background                          |
| `card`           | `#FFFFFF` | Surfaces                                 |
| `border`         | `#E7E1DC` | 1dp borders, dividers                    |
| `primary`        | `#E8663F` | Primary action (hover `#D4552F`)         |
| `text`           | `#1A1420` | Primary text                             |
| `muted`          | `#6E6478` | Secondary text, muted buttons            |
| `sidebar`        | `#1F1530` | Sidebar background                       |
| `sidebar-active` | `#2C1E42` | Active nav item                          |
| `status-ok`      | `#2F8C7F` | Published, verified, connected, complete |
| `status-warn`    | `#B07C2E` | Draft, missing audio                     |
| `destructive`    | `#C0432F` | Danger zone, errors, failed uploads      |

Rules: flat surfaces; no shadows, no gradients; maximum 1dp borders; **exactly one ember button per screen**, on the primary action; status is always a labelled pill, never color alone.

**Admin ember buttons take white labels.** This differs from the mobile app, where ember labels are `#1A1420`. The two are not interchangeable.

### Typography

Inter throughout:

- page titles — 24px / 600
- section labels — 13px / 600, uppercase
- body — 14px / 400
- table headers — 12px / 600

JetBrains Mono for durations, file names, byte sizes and IDs.

### Layout

1440 × 1024 frames. 200px sidebar, full frame height. Max content width 1040px. 32px page padding. 8px card radius. 40px inputs at 8px radius. 48px table rows. 8px spacing grid.

Breadcrumb row sits inside the main area, not in the sidebar.

Sidebar order is fixed: **Dashboard, Books, Settings**. (Uploads was removed from the sidebar — see A6/A7 below.)

---

## Screen Inventory

> Provenance note: these specs come from the design prompts and design-review notes for this project. Where a design image disagrees, **the image wins for layout and this file wins for tokens** — and flag the conflict rather than silently choosing.

**A1 · Dashboard (work queue)**

Breadcrumb and title "Dashboard". Muted sub-line "What needs finishing." Ember `New Story` top-right.

Three plain stat tiles: Books, Chapters, Missing audio (amber). Plain tiles — no sparklines, no trends, no percentages.

`Needs attention` card: a table of book title, chapter number and title, the missing item (Script / Narration audio / both), and a right-aligned muted `Open` button per row. Footer count line.

`Recent activity` card: timestamped rows.

**No charts, no graphs, no telemetry of any kind.** This screen is a queue, not analytics.

**A2 · Books list**

Breadcrumb "Books", title, ember `New Story`.

A search input and nothing else in the toolbar. No filter dropdowns, no status tabs, no stat cards.

Table columns: 40 × 60 cover thumbnail, Title (full, not truncated), Chapters as a ratio, Audio as a ratio (amber when incomplete), trailing overflow menu.

Footer book count.

**A3 · Book editor (create and edit)**

One shared component drives both a book's creation and its editing — there is no separate "New book" screen design. The two modes differ only in the table below; everything else (layout, card order, field order, helper lines, dimensions, spacing) is identical, so an operator sees the whole shape of a book, including its Chapters card, on first visit.

| field            | create               | edit           |
| ---------------- | -------------------- | -------------- |
| breadcrumb       | `Books / New Story`  | `Books / <title>` |
| page title       | `New Story`          | `<book title>` |
| primary button   | `Create Story`       | `Save`         |
| status field     | not shown (see below)| shown, live    |
| cover card       | live (local-only)    | live           |
| manuscript card  | live (local-only)    | live           |
| chapter composer | live (local-only)    | live           |
| chapters card    | live (local-only)    | live           |

Every card is live in create mode, including before the book has an id — none of them lock. This reverses the original locked-card design (kept below for history and because Project Rules' governing rule about needing a saved parent row before a real upload still holds — it's just that nothing in this app performs a real upload yet). Each card that looks like a file upload is actually client-side-only today: Cover previews a picked image via `URL.createObjectURL` with nothing sent anywhere; Manuscript and the composer's Chapter script both extract file contents entirely in the browser (`file.text()` for `.txt`/`.md`, `mammoth` for `.docx`, see Upload Rules); Narration audio reads a picked file's metadata client-side. None of this needs a saved parent row because none of it writes to storage — see "Local-only chapter creation" below for the equivalent reasoning applied to chapter creation itself.

Breadcrumb `Books / <book>` in edit mode (or `Books / New Story` in create mode), one ember button on the title row.

Two-column 2:1 layout.

Left card **Book details**: Title, Author, Short description (160-char counter), Synopsis (600-char counter), Genres multi-select, Maturity segmented control (General / Mature 18+ — **Mature 18+ dark-filled by default**), **Default chapter access** (Select, Free / Locked — see Project Rules). **Status is not a field on this card in create mode** — see "Create Story dialog" below; in edit mode it reappears as a Select (Draft / Published), unchanged from before, so an operator can still flip an existing book's publication state directly on the card.

**Create Story dialog.** The primary button no longer submits the form directly in create mode — it opens a modal (`components/books/create-book-dialog.tsx`) with two choices, `Save as draft` and `Publish`, replacing the old inline Status select for the moment of creation. Choosing either sets the form's `status` field and shows the same "isn't wired to a backend yet" toast as every other create action in this app (see "Local-only chapter creation" and Prompt Series Notes) — nothing is actually created or persisted. In edit mode the button still submits the form directly, unchanged, and the dialog does not render at all.

Right column, stacked: **Cover thumbnail** (2:3 dashed dropzone, file name and size, Replace and Remove links — picks a local image file and previews it via an object URL; nothing is uploaded), then **Manuscript** (upload one document and split it into chapters — dashed dropzone, constraint line `DOCX, TXT or MD · max 10 MB`; Confirm on the split preview actually appends the resulting chapters to the Chapters card below, same local-only behaviour as the composer). Manuscript's sub-line reads "For a whole book in one file — splits it into many chapters at once. For a single chapter, use Chapter script below instead." — a deliberate cross-reference so an operator never has to guess which card is for one chapter versus a whole book.

Below the Book details row, full width, the **Chapter composer**: one row at 2:1 with a 24px gap, same ratio and gap as the row above it. Left column **Chapter script** — a sub-line reads "Text for this one chapter — for a whole book in one file, use the Manuscript card instead." (a deliberate deviation from the original spec's "no sub-line" — the two cards' overlapping file-upload mechanism made the distinction genuinely unclear to operators without it). File upload is the primary path, accepting `.txt`, `.md` and `.docx` (all three extracted client-side via `src/lib/docx.ts`/`file.text()` and dropped straight into the prose textarea below it; a genuinely unreadable file shows an honest error, never a silent failure), with the textarea itself staying editable underneath as a fallback for pasting/tweaking, live word count. Right column stacked: **Narration audio** (dashed dropzone, live — a real local file picker reading name/size/duration client-side) then **Chapter settings** (Chapter number, Title, Access — pre-filled with the next available number and the book's Default chapter access, live). This is the only chapter-creation surface in the app (see Project Rules); it renders live in **both** create and edit mode — see "Local-only chapter creation" below for why create mode can be live without a saved book. The Chapters card's `Add chapter` button scrolls to and focuses this composer rather than navigating — see A4a.

**Local-only chapter creation, editing and deletion (no backend yet).** Pressing `Create chapter` (composer) or `Confirm` (Manuscript split preview) appends the resulting chapter(s) to the book editor's in-memory state and they appear in the Chapters card immediately, in both create and edit mode. The Chapters table's overflow menu can also flip a chapter's `Set free`/`Set locked` state and, behind a confirm dialog, delete a chapter — both operate on that same in-memory state. None of this is written to `mock-catalog.ts` or a database. A page reload loses it, and on `/books/new` everything (cover preview, chapters, the book itself) is lost if `Create book` is never pressed (there is no book id to attach any of it to yet). This holds until prompt 22 (or later) wires real `createChapter`/`createBook`/`importManuscript`/`updateChapter`/`deleteChapter` server actions; treat every card's file, preview and any chapter row it produces, edits or removes as client-local UI state, not persistence, same honesty rule as every other create/save action in this app (see Prompt Series Notes). None of Cover, Manuscript or the composer's script file picker upload to storage — they only read a file's bytes in the browser — so none of them need a saved parent row and none are subject to the governing rule below.

Below the composer, full width, **Chapters** card. The header row inside the card carries a single primary-outline `Add chapter` button — no bulk-upload button here (bulk import would live at A7, not currently linked from anywhere — see A6/A7's removed-from-sidebar note). Sub-line is computed at render: `<n> chapters · <n> with text · <n> with narration`.

Table columns: Number, Title, Text status, Audio status, Access pill, overflow menu. Row behaviour is specified below under Actionable Rows.

**Locked-card pattern (retired from A3).** Earlier revisions of this file locked Cover, Manuscript, the composer and the Chapters card in create mode, with a muted 12px reason line ("Save the book first to upload a cover.", etc.) in place of each card's primary affordance, on the reasoning that a file upload requires a saved parent row (see the governing rule under Project Rules). That reasoning still holds for a *real* upload — but nothing in A3 performs one today: every card only reads a file's bytes client-side (object URL preview for Cover, text extraction for Manuscript/Chapter script, metadata read for Narration audio) and holds the result in local state. None of that needs a saved parent row, so none of it locks any more — see the table above and "Local-only chapter creation". The pattern itself (real heading/sub-line/frame at full opacity, controls disabled, one muted reason line, identical dimensions locked or not) is still the correct one to reach for **when a real upload is wired up** and genuinely needs a saved id first — do not delete it from institutional memory just because A3 doesn't currently use it.

**A4a · Chapter creation (superseded, unlinked)**

Chapter creation now happens inline, in the Chapter composer embedded in A3 (see A3's card list). The dedicated route `/books/<id>/chapters/new` and its page are **no longer the entry point and are no longer linked from anywhere** — nothing in the app navigates to it. It is not deleted; removal is pending a decision (see Prompt Series Notes / open question 1). Until that decision, it stays in the codebase as an unlinked, directly-reachable-by-URL-only surface, rendering the same extracted chapter-card components as the composer so it does not drift from them.

**A4 · Chapter editor**

The edit surface for an existing chapter, at `/books/<id>/chapters/<n>` (`components/chapters/chapter-editor.tsx`, orchestrated by a Server Component page that resolves the book/chapter from mock data and computes prev/next chapter numbers). Unaffected by the Chapter composer (A3) — the composer only replaces chapter *creation*, not editing an already-created chapter.

Breadcrumb `Books / <book> / Chapter N` (Books and the book title are links; the chapter segment is not). Page title `Chapter <n> · <chapter title>`, with a 12px muted status line baseline-aligned beside it — `Unsaved changes` while the form is dirty (including narration changes, tracked separately from the react-hook-form instance since audio isn't a schema field), `Saved <n> min ago` after a successful save this session, or nothing before the first save. Ember `Save chapter`, disabled until dirty and valid — the only ember button on the screen; the circular narration play button and the Edit duration dialog's confirm button are deliberately not ember (`outline`), since a modal's own confirm action doesn't get an exemption from "one ember button per screen."

Two-column 2:1 layout, 24px gap.

Left card **Chapter script** (`chapter-editor-script-card.tsx`) — the file row and prose editor share one card, separated by a divider, not split into two cards. Ready state: a document icon, mono file name, right-aligned `Replace file` (muted) / `Remove` (destructive). Empty state: a muted instruction and `Choose file`, accepting `.docx` (extracted via `extractDocxText`), `.txt`/`.md` (read directly) — an unreadable file shows an inline error rather than failing silently. Beneath the divider, a formatting toolbar (`B`, `I`, `H2`, paste-as-plain-text) that applies plain text transforms (markdown-style wrapping) directly to the textarea — no rich-text editor, no `contenteditable`. The prose area is a plain textarea that grows with content; **it renders in the sans font (Inter), not a serif face** — flagged design-system gap, see Design Assets. Footer, past another divider, shows `<n> words` computed live via `countWords`, never stored.

Right column, stacked:

**Narration audio** (`chapter-editor-audio-card.tsx`) — ready state: a music icon and mono file name, a circular ember-colored play/pause button (native `<audio>`, no waveform/scrubber/volume), then `Duration <mm:ss>` with `Detected` (status-ok check) when `durationSource` is `"detected"` or `Edited` (muted, no check) when `"manual"`, an `Edit duration` link, `Size <n>`, then a divider and `Replace`/`Remove`. Missing state: a dashed dropzone with `Upload audio`. Both states share one constraint line — **`.m4a or .mp3 · max 100MB`, deliberately narrower than `SETTINGS_DEFAULTS.acceptedAudioFormats` (which also allows `.wav`)** — this screen follows the frame's exact copy; the composer's `NarrationAudioCard` still reads from `SETTINGS_DEFAULTS` and so still advertises `.wav` too. This is a real, pre-existing inconsistency between the two Narration audio cards, not introduced by this prompt — flagged, not resolved. `Edit duration` opens a dialog with an `mm:ss` input (validated, rejects malformed input inline), `Cancel`/`Save duration` — saving flips `durationSource` to `"manual"`. This control is always available regardless of state, since automatic detection can report `Infinity`/`NaN`.

**Chapter settings** (`chapter-editor-settings-card.tsx`) — field order is Chapter number, Title, Access (per the design frame, which differs from a plain alphabetical/spec-table reading — the frame wins). Access is a segmented control, Free / Locked, filled state always tracking the chapter's actual value (chapter 1 defaults to `Free` selected, chapter 10 to `Locked`, per fixture). A trailing row holds previous/next chapter chevron buttons (muted outline, disabled at the first/last chapter) — not in the original design frame, added per AGENTS.md's throughput bias so an operator can work a serial without returning to the Book editor each time.

No loading spinner: a route-specific `loading.tsx` shows skeletons shaped like these three cards during navigation (the parent `[bookId]/loading.tsx` was shaped for the Book editor and would otherwise flash briefly for this different layout).

**A5 · Settings**

Title, ember `Save changes` — the only ember button on the screen, disabled until the form is dirty and valid. Single scrolling column of six cards, capped at 720px (`max-w-[720px]`), 24px gap, left-aligned inside the 1040px content area. Every card carries a 16px/600 heading with a 12px `muted` sub-line directly beneath it; every field is a field group (label, control, 12px `muted` helper line).

One `react-hook-form` instance with a single zod schema spans the whole screen, so `Save changes` reflects dirty state across every card (`components/settings/settings-form.tsx`). The page (`app/(dashboard)/settings/page.tsx`) is a Server Component that renders one Client Component shell (`settings-screen.tsx`) holding the `FormProvider`, so the header's save button and the cards share one form context. All state is local — nothing persists until the Supabase prompts land.

1. **Account** — read-only rows (label above value, no input boxes): name, email in mono, role as a labelled pill, then an underlined `muted` `Change password` link. Values come from `SETTINGS_ACCOUNT` in `data/settings-defaults.ts`; Clerk (prompt 11) replaces them with the real session user, and `Change password` belongs to Clerk too, so it renders inert today.
2. **Storage** — Provider select, Bucket name (mono), Public CDN domain (mono, helper "Prefix for cover and audio URLs served to the app"), muted `Test connection` button with a teal check and Connected status. **Keep this button** — it is the fastest diagnosis for broken audio playback. All four connection states are built (`storage-connection-test.tsx`): idle, `Testing…`, `Connected` (status-ok check), and a `destructive` failure message. The success path is wired by default; the failure branch renders but nothing triggers it yet, since there is no storage client to fail against.
3. **Upload defaults** — Max audio size (number input with a `MB` suffix inside the control), accepted audio formats as removable mono chips, accepted script formats likewise, `Detect audio duration automatically` toggle default ON with helper note. Chips reuse the Genres control's pattern (`settings/format-chips.tsx` mirrors `books/genre-multi-select.tsx`) with a `+ Add format` select inside the container so a removed format can be added back — the add-back list (`SELECTABLE_AUDIO_FORMATS` / `SELECTABLE_SCRIPT_FORMATS`) is a superset of the defaults. The script list is deliberately **not** widened to include PDF — see Upload Rules.
4. **Publishing defaults** — Default chapter access segmented control (Locked dark-filled), free-chapters-at-start number, Default maturity segmented control (Mature 18+ dark-filled).
5. **Team** — rows of name, email (mono), role pill, `Remove` link; muted `Invite member` button beneath. A plain `<Table>`, not TanStack — three static rows with no sorting, filtering or pagination. `Remove` mutates local state only; `Invite member` opens a dialog with an email input and a role select that closes without effect (no invite path exists until Clerk lands). Empty state is a single muted line inside the card, with the `Invite member` action still available. Rows come from `SETTINGS_TEAM`.
6. **Danger zone** — card with a 1dp `#C0432F` border, heading in `#C0432F`, row label, helper text, right-aligned outlined destructive button sized to its label on one line. The button opens a confirm dialog requiring the operator to type `delete seed data` before the destructive confirm enables; confirming closes and toasts, deleting nothing.

Loading is a route-specific `loading.tsx` with skeletons shaped like the six cards, never a spinner.

**A6 · Upload Queue** _(removed from sidebar — see below)_

Breadcrumb, title, ember `Add files`.

Active uploads card: rows showing file, target book and chapter, progress bar, and state — uploading with percent and bytes, processing ("Detecting duration…"), complete with a teal check, failed with a `#C0432F` error message and a retry action.

Seed import card: heading, description, dropzone, target book select, match-audio checkbox, primary import action.

Recent activity log.

**A7 · Bulk Script Import** _(removed from sidebar — see below)_

Dropzone accepting a folder of `.txt` / `.docx`. A filename-to-chapter matching preview table with per-row override. Target book select. Confirm button.

Without this, seeding an 85–200 chapter serial is not viable — this was previously called the highest-value remaining screen, and that assessment stands; removing it from the sidebar is about the current empty placeholder page, not a judgment that the feature isn't needed.

> **Uploads removed from the sidebar.** Both `/uploads` and `/uploads/bulk-import` were empty placeholder pages (a title and breadcrumb, no actual content) — A6/A7 above were "approved, not yet designed/built" specs that never got implemented behind them. The sidebar link, the `Uploads` nav item, both route files, and the two "Use bulk import" links that pointed at the bulk-import placeholder (Manuscript card's too-few-sections message, and the unlinked `/books/<id>/chapters/new` page) were all removed, since a nav item and links pointing at nothing is worse than not having them. The Books list already shows per-book chapter/audio completion ratios, which covers the "what's been uploaded" need this screen would have shown at a glance. If A6/A7 are built later, re-add the sidebar item and route files together — do not leave a nav item pointing at an empty page again.

### Actionable Rows

In the Book editor's Chapters table, a missing asset is a task, not a label:

- **Present** → mono duration (`09:14`) or word count with a teal check
- **Absent** → compact muted outlined button, `Upload text` or `Upload audio`. Never a static "Missing" string with no affordance. Currently these buttons open a local file picker directly (see the Upload Rules deviation note above) rather than opening A4, since A4 doesn't exist yet.
- Every row keeps its trailing chevron as a visual affordance for A4, but rows do **not** currently navigate anywhere on click — A4 is an unbuilt placeholder (see A4), and navigating to it produced a 404. Re-enable row-click-to-open once A4 is real.
- The overflow menu must sit inside the card bounds, unclipped. Every `DropdownMenuItem`'s `onClick` must also call `event.stopPropagation()` — Radix portals a menu's content outside the row's DOM subtree, but React's synthetic events still bubble through the *logical* component tree, so a click on a menu item reaches the row's own `onClick` unless stopped explicitly at the item, not just at the trigger button.

An operator should never see that something is missing without being able to fix it from where they are standing.

---

## Image Generation Rules

Do **not** generate, synthesize or substitute cover art, avatars or illustrations. Cover art is uploaded by operators through A3.

Do not describe or imply AI-generated imagery in shipped UI copy.

If the user explicitly enables image generation for a local asset such as an empty-state illustration:

- match the provided reference exactly — do not change style, colors or composition
- keep consistency with the design system above
- place output in `public/images/` with clear naming:

```txt
public/images/
  empty-books.svg
  empty-uploads.svg
  cover-placeholder.png
```

---

## Design Assets

A3 create mode, A4a (Chapter creation), and the Manuscript card have no design frames. Build them by composing existing design-system tokens and card patterns already in the app — never a new colour, type size, radius, spacing value, shadow, component library or icon set. Where a value cannot be derived from an existing card elsewhere in the app or the token table above, report the gap rather than choosing a value.

**Serif font gap (A4).** The Chapter editor's design frame calls for chapter prose in a serif face. The Typography section defines exactly two families — Inter (sans) and JetBrains Mono — with no serif token. Rather than invent an unreviewed third family, the prose area renders in Inter at a larger size (17px) and generous line-height (leading-8) for reading comfort, matching the sans-only rule everywhere else prose appears in this app (the Manuscript/composer script textareas). If a serif face is wanted for real, it needs to be chosen and wired up via `next/font` the same way Inter and JetBrains Mono are — a deliberate type-system addition, not a one-off inline font-family.

---

## Styling Rules

Use Tailwind classes for styling strictly. Do not use inline `style` objects or CSS modules unless the thing cannot be expressed with Tailwind classnames.

Prioritize clean, dense, readable admin UI.

When building from an attached design image:

- match spacing closely
- match typography hierarchy
- match border radius and border widths
- match layout structure
- use consistent reusable styles

Design tokens live in `tailwind.config.ts` as named colors, so classes read `bg-page`, `bg-card`, `border-border`, `text-muted`. **Raw hex appears in exactly one place: the config.**

Prefer reusable class patterns through utilities in `globals.css`. If no utility exists and you see a repeated pattern, create one there following the BEM method.

Avoid large inline styles unless required.

---

## shadcn/ui Rule

Use the shadcn/ui components already installed in this project.

Before implementing a component:

- Check whether the primitive already exists in `components/ui/`
- If it does not, add it with the shadcn CLI rather than hand-rolling it
- Follow the patterns and API of the installed version
- Do not upgrade shadcn/ui or Radix versions unless the user explicitly approves it

shadcn/ui has no prebuilt data-table component. Tables are composed from the `<Table />` primitive plus TanStack Table for sorting, filtering and pagination. Build them that way rather than reaching for an external grid library.

Restyle shadcn primitives through Tailwind classes and the token config. Do not fork a primitive to change its appearance.

---

## Style Exception Rules

Use inline styles or CSS for these components/scenarios instead of Tailwind classes:

| Component / Scenario                                    | Why                                   | Use Instead                             |
| ------------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| **Upload progress bar width**                           | Percentage computed at runtime        | Inline `style={{ width: \`${pct}%\` }}` |
| **Waveform / audio scrub position**                     | Runtime pixel values                  | Inline styles                           |
| **Radix portal positioning**                            | Managed by Radix, not by classes      | Component props                         |
| **CSS custom properties for theme tokens**              | Defined once, consumed by Tailwind    | `globals.css`                           |
| **Dynamic table column widths**                         | Sized from TanStack Table state       | Inline styles from `column.getSize()`   |
| **Third-party widget styling (Uppy dashboard)**         | Library owns its DOM                  | Library theme options or scoped CSS     |
| **Print or export stylesheets**                         | Media queries outside component scope | `globals.css`                           |
| **`dangerouslySetInnerHTML` sanitized chapter preview** | Content-owned markup                  | Scoped CSS in `globals.css`             |

### When to Use Inline Styles

- The value is dynamic or calculated at runtime
- The DOM is owned by a third-party library
- The property is a CSS custom property definition

### Progress Bar Example

```tsx
// ✅ CORRECT — dynamic width inline, everything else in classes
<div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
  <div
    className="h-full rounded-full bg-primary transition-all"
    style={{ width: `${percent}%` }}
  />
</div>

// ❌ INCORRECT — arbitrary value cannot be dynamic at build time
<div className={`h-full bg-primary w-[${percent}%]`} />
```

Otherwise, always stick to Tailwind utilities.

---

## UI Quality Bar

The dashboard should feel:

- dense
- calm
- utilitarian
- fast
- visually close to the provided design references

Avoid consumer polish. This is not a marketing surface.

Use:

- flat white cards on a warm off-white page
- 1dp borders instead of shadows
- labelled status pills
- clear empty states that explain the next action
- inline validation on forms
- generous click targets (≥ 32px)

**Do not add** charts, graphs, sparklines, trend arrows, percentage deltas, bandwidth readouts, session IDs, CDN diagnostics beyond the Settings connection test, or any metric nobody asked for. Earlier design iterations were full of invented telemetry. All of it was deleted deliberately.

Every screen implements loading, empty, error and failure states. A spinner on a blank page is not a loading state — use skeleton rows matching the table structure.

Meet WCAG 2.2 AA contrast: 4.5:1 body, 3:1 large text.

Before calling a screen done, test every table with the longest plausible title and with an empty result set.

---

## Image Rule

Use centralized image imports.

Before using any image asset:

1. Check if `constants/images.ts` exists.
2. If it does not exist, create it.
3. Import and export all app images from `constants/images.ts`.
4. Use images through the centralized object.

Example:

```ts
import coverPlaceholder from "@/public/images/cover-placeholder.png";
import emptyBooks from "@/public/images/empty-books.svg";

export const images = {
  coverPlaceholder,
  emptyBooks,
};
```

Use images like this:

```tsx
<Image src={images.coverPlaceholder} alt="" width={40} height={60} />
```

Do not import image assets directly inside pages or components unless there is a strong reason.

Cover thumbnails come from Supabase Storage / CDN URLs stored in the database. Render them with `next/image`, always with explicit width and height and a 2:3 aspect ratio. Configure the Supabase CDN hostname in `next.config.ts` rather than disabling optimization.

---

## data/

Use this for static config and seed manifests.

```txt
data/
  genres.ts
  maturity-levels.ts
  seed-manifest.ts
```

Content must be typed. Never inline catalog data or prose into components.

---

## lib/

Use this for external service helpers and pure functions.

```txt
lib/
  supabase.ts
  supabase-admin.ts
  clerk.ts
  upload.ts
  audio-duration.ts
  format.ts
  cn.ts
```

No React, no hooks, no JSX in `lib/`.

`supabase-admin.ts` uses the service-role key and must be imported **only** from Server Components, Server Actions or Route Handlers. Never from a Client Component.

Never expose secret keys to the browser.

---

## State Management Rules

Server data is fetched in Server Components where possible, and mutated through Server Actions.

For client-side interactivity:

- form state via `react-hook-form` with the shadcn form primitives
- table state (sorting, filtering, pagination) via TanStack Table's own state
- upload queue state via local component state or a small context — uploads are ephemeral and do not belong in a global store

Do not introduce a global client store for data the server already owns. Revalidate instead.

After any mutation, call `revalidatePath` so lists and counts reflect reality. Stale counts are the fastest way to lose an operator's trust in this tool.

---

## TypeScript Rules

Use TypeScript strictly.

Avoid `any`. No non-null `!` on genuinely nullable values. No `@ts-ignore` without a one-line justification.

Derive row types from the generated `types/database.ts` rather than redeclaring shapes. **Never hand-edit that file.**

Prefer discriminated unions over optional-field soup for asset and upload states (`missing | uploading | processing | ready | failed`).

Validate all form input and all Server Action arguments with a schema. Never trust a client payload.

Keep types simple and readable.

---

## Feature Implementation Rules

When the user asks to build a feature:

1. Read this file first.
2. Identify files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Ensure the feature works end-to-end against real Supabase data and real Storage.
7. Fix errors before finishing.

---

## Supabase Rules

### Client creation

Create the client with an `accessToken` callback that returns the Clerk session token:

```ts
// lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createSupabaseClient(
  getToken: () => Promise<string | null>,
): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await getToken()) ?? null },
  );
}
```

Get `getToken` from `auth()` in Server Components and Server Actions, or from `useAuth()` in Client Components.

### Deprecated pattern — do not use

```ts
// ❌ DEPRECATED — do not reintroduce
createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${clerkToken}` } },
});
```

Supabase documents the former Clerk Integration (project JWT secret + Clerk JWT templates) as **deprecated as of 1 April 2025**, because sharing the project JWT secret with a third party is a poor security practice, rotating that secret causes significant downtime, and minting a separate JWT adds latency versus using Clerk session tokens directly. Projects on the deprecated integration are excluded from Third-Party MAU charges only until at least 1 January 2026.

The architecture handover document for this project contains the deprecated snippet. It is superseded by this section.

### Setup

Configure the Clerk instance for Supabase compatibility, then register Clerk under **Supabase Dashboard → Authentication → Third-Party Auth**. Clerk session tokens must carry a `role` claim valued `authenticated` for signed-in users. For local development or self-hosting, add the Clerk third-party config to `supabase/config.toml`.

### RLS

Identify the caller with `auth.jwt() ->> 'sub'` (the Clerk user ID, stored as `text`, never `uuid`). Roles come from Clerk `publicMetadata` via session-token claims.

**RLS is the enforcement boundary.** Next.js middleware and client-side role checks are UX, not security. Every admin-writable table needs a policy. Do not rely on the dashboard being behind a login — assume an attacker has a valid reader token and is calling the API directly.

Storage buckets get policies too: `covers/` public read, `audio/` read gated by entitlement, `scripts/` admin-only.

---

## Clerk Rules

Use Clerk for authentication. Do not build custom auth.

- Publishable key only in the browser. Secret keys stay server-side.
- Admin role lives in Clerk `publicMetadata` and is enforced in RLS **and** in route protection.
- Protect the entire `(dashboard)` route group. An authenticated reader must not reach any admin page.
- Token retrieval always goes through Clerk's `getToken`. Never cache a token in a module-level variable.

> **Setting auth up, onboarding an operator, or debugging it? Read `docs/AUTH-SETUP.md` first.** It holds the four required setup steps (including the session-token claim, without which every user is locked out), and a troubleshooting playbook covering the failures actually hit building this: clock skew misreported by Clerk as a key mismatch, the Cloudflare block from using a LAN IP instead of `localhost`, redirects escaping to `accounts.dev`, and the initials-instead-of-photo avatar. This section stays the source of truth for the *design*; that file covers *operating* it.

### As implemented (prompt 11)

**Two independent layers, deliberately.** `src/proxy.ts` runs `clerkMiddleware()` with `createRouteMatcher(["/sign-in(.*)"])` and calls `auth.protect()` on everything else — that handles the *unauthenticated* redirect only. Authorisation is a separate server-side check: `(dashboard)/layout.tsx` awaits `requireAdmin()` from `lib/auth.ts`. Removing the proxy file must still leave a non-admin blocked by the layout; that is the test prompt 11 specifies, and it is the reason the check is not folded into the proxy. Next's own proxy docs agree: proxy "should not be used as a full session management or authorization solution."

**`proxy.ts`, not `middleware.ts`.** Next 16 renamed the file convention (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`); functionality is unchanged and `next build` reports it as `ƒ Proxy (Middleware)`. Clerk's `clerkMiddleware()` helper keeps its own name — only the file moved.

**Roles read from the session token, not the Clerk API.** `lib/auth.ts` exposes `isAdmin()` and `requireAdmin()`, both reading `sessionClaims.metadata.role`, typed via the `CustomJwtSessionClaims` declaration in `types/globals.d.ts`. This requires a session-token claim configured in the Clerk Dashboard (Sessions → Customize session token → `{"metadata": "{{user.public_metadata}}"}`). Without that claim the role is always undefined and **every** admin is locked out — that is the first thing to check if auth appears broken. Never mirror roles into Postgres; RLS reads them from the JWT.

**`requireAdmin()` is the guard every future Server Action calls first.** It returns the Clerk user id, redirects to `/sign-in` when there is no session, and to `/not-authorised` when the session lacks the admin role.

**Surfaces added:** `/sign-in/[[...sign-in]]` (prebuilt `<SignIn />`, **no sign-up route** — operators are provisioned in the Clerk Dashboard), `/not-authorised` (heading, one muted line, `Sign out`), and `/account/[[...rest]]` (Clerk's `<UserProfile />`, where `Change password` on the Settings Account card now links). The last three sit outside the `(dashboard)` group so they render without the sidebar shell and without tripping the admin gate. The sidebar gained a footer (`components/shell/sidebar-user.tsx`, `<UserButton />` plus the operator's name, `mt-auto` so it sits flush at the bottom); the three nav items above it are unchanged.

**Every dashboard route is now dynamic** (`ƒ` in the build output) rather than statically prerendered, because the layout calls `auth()`. That is expected and correct for an authenticated admin tool.

**Clerk styling** goes through the appearance API in `lib/clerk-appearance.ts`, applied at `<ClerkProvider>` and per-component. It restates the design tokens as raw CSS values — the one sanctioned exception to "raw hex lives only in tailwind.config.ts", since Clerk's appearance API sits outside Tailwind and takes CSS values directly.

---

## Project Rules

**A file upload requires a saved parent row.** Every storage path embeds the owning row id — `covers/<bookId>/<uuid>.jpg`, `scripts/<bookId>/<chapterId>/<uuid>.docx`, `audio/<bookId>/<chapterId>/<uuid>.m4a` — and Supabase mints a signed upload URL for that exact path, file name included. An unsaved book and an unsaved chapter therefore cannot receive files. Forbidden workarounds: temp or placeholder paths, a staging bucket, client-side file buffers held across a navigation, deferred upload queues, optimistic row ids. Instead surface the constraint in the UI using the locked-card pattern (see A3).

**Single upload surface per asset.** Do not build in-row uploading in a table as a second path alongside the editor upload — for example the Chapters table's "+ Upload text" / "+ Upload audio" affordances should navigate to the chapter editor rather than opening a picker inline. Two upload surfaces per asset means two progress implementations, two failure surfaces, and two places for TUS conflict handling to drift.

> **Current deviation, explicit and temporary.** There is no chapter editor page to navigate to yet (`/books/<id>/chapters/<n>` is an unbuilt placeholder — see A4). The Chapters table's row previously navigated there on any click, including clicks inside its own `⋯` menu (a React-portal event-bubbling bug — a `DropdownMenuItem` click was reaching the row's `onClick` because Radix portals preserve React's synthetic-event tree, not the DOM tree, so `stopPropagation` has to be called inside the portalled content too, not just on the trigger), which produced a real 404. Rather than leave "+ Upload text" / "+ Upload audio" disabled indefinitely, they now open a local file picker directly in the row (`UploadTextButton`/`UploadAudioButton` in `chapters-table.tsx`) and read the file client-side — same extraction path as the Manuscript card and composer (`file.text()`/`extractDocxText` for scripts, `Audio.onloadedmetadata` for narration). This is a second upload surface, in violation of the rule above, kept deliberately narrow (client-side read only, no real upload) until a real chapter editor exists to become the single surface. Remove `UploadTextButton`/`UploadAudioButton` from the table once that page is built, rather than keeping both.

**Single chapter-creation surface.** The Chapter composer embedded in A3 is the only place a chapter is created. Do not add a second one — the former dedicated route (A4a) is superseded and unlinked, not a parallel path.

---

## Upload Rules

### Audio — resumable, not standard

Chapter narration runs 20–100MB per file, far above the ~6MB threshold at which Supabase recommends standard uploads. Therefore:

- Upload with the **TUS resumable protocol** via `tus-js-client` or Uppy, directly from the browser to Supabase Storage. Never proxy a 100MB file through a Next.js route handler.
- Authorize with `createSignedUploadUrl` and pass the returned token in the `x-signature` header of the resumable upload.
- A resumable upload URL is valid for up to **24 hours**. Expect clients to request a new one after expiry; TUS clients typically do this automatically.
- Only one client may write to a given upload URL at a time. Competing clients receive `409 Conflict`. Two clients uploading to the same path via different URLs also produce `409` for the loser. Surface this as a clear, specific error with a retry action — not a generic failure.
- **Do not use `x-upsert` to replace audio.** Supabase advises against overwriting because CDN propagation lag serves stale content. Replacing a narration writes a **new immutable path** and updates the row to point at it.
- Show real per-file progress with percent and bytes, plus distinct processing, complete and failed-with-retry states.

### Cover images

Standard uploads are fine — covers are small. Still upload direct-to-storage rather than through a route handler.

### Scripts

`.txt`, `.docx` and `.md`. **PDF is not an accepted script format anywhere in this app** — not the Chapter editor, not the Manuscript card, not bulk import. PDF encodes fixed page layout rather than document structure, so extraction bleeds headers, footers, page numbers and column breaks into the prose and corrupts hyphenated line breaks. The mobile reader reflows text at three type sizes and stores a character offset for parity; corrupted extraction silently corrupts every bookmark in the chapter. Do not widen the accepted-formats list to include it.

Parse server-side, store the extracted text on the chapter row, and keep the original file in `scripts/` for reference. As of this codebase's current state, this is done client-side instead, via `src/lib/docx.ts` (`.txt`/`.md` via a plain text read, `.docx` via the `mammoth` browser build's `extractRawText`, dynamically imported so the parser only loads when a `.docx` is actually picked) — see Prompt Series Notes. This is a stopgap until a real upload path and server-side parsing exist: today the extracted text lives only in client state, is not persisted, and there is no original file kept anywhere in storage.

### Audio duration

Detect duration client-side after upload and persist it with the chapter.

`<audio>` `loadedmetadata` can report `Infinity` or `NaN` for some encodings. The UI must **still show a success state** and must **always** expose the `Edit duration` manual override. Never block publishing on automatic detection, and never show a failed upload because duration detection failed.

### Cost

Supabase bills roughly $0.09/GB uncached egress against $0.03/GB cached, with 250GB cached included on Pro. Audio streaming economics depend on Smart CDN hit rate. Keep audio paths immutable and long-cached, and never append cache-busting query strings to media URLs.

---

## Performance Rules

### Measure before diagnosing

Timings in the dev log are the starting point, not the answer. `POST /books/… 200 in 4.5s` with `updateBook … in 1300ms` means **3.2s of that response was not your action** — find where it went before changing the action.

Measure the database floor directly before blaming code. A trivial `select id limit 1` against this project takes **~450ms** from the developer's machine (`us-east-1`, `t3.nano`). That number is the floor under every query, so a 1300ms action doing three serial round trips is *already near optimal* and restructuring it wins nothing.

Two measurements that redirected the whole performance pass, and why:

- **Parallel vs serial barely differed** (1355ms vs 1620ms for 3 queries). If latency were pure network distance, 3 parallel queries would cost about the same as 1. They didn't, which means queries **queue on the instance**, not on the wire. Parallelising helps far less than intuition suggests on a small instance.
- **A `HEAD` request (near-zero server work) took 1244ms — longer than a real `select *` at 472ms.** Connection setup, not query work, dominates. That is the signature of an undersized instance, not a distant one.

The conclusion to carry: on `t3.nano`, **instance size outranks every code-level fix**. Say so plainly rather than shipping refactors that cannot deliver what the numbers allow.

### Never pay for the same data twice

**A Server Action's response already carries the refreshed RSC payload for any route it revalidated.** Calling `router.refresh()` after an action that called `revalidatePath` fires a **second full round trip** for data already in flight. On this database that cost ~3s per save.

Rule: if the action calls `revalidatePath` for the route the component is on, the component must **not** call `router.refresh()`. Removed from the Book editor save, the Chapter editor save, and the cover upload for exactly this reason.

The exception is a callback fired from a *child* component about data owned by the *parent* route — verify the revalidation actually reaches the parent before removing it. Staleness there is silent and has no error to trace it back to, which is far worse than one extra request. `onImport` / `onCreate` / `onChanged` in `book-editor.tsx` were left alone on that basis; they fire on rare operations, not on every save.

### Revalidate only what is on screen

`revalidatePath("/")` invalidates the **dashboard**, which runs five queries (3 counts + the attention view + activity). Book and chapter mutations were calling it on every write, rebuilding the dashboard before the response could return — while the operator was looking at a book.

Rule: revalidate the routes the mutation actually affects and that the operator can see. The dashboard revalidates on its own navigation.

### One client per request

`serverSupabase()` is wrapped in React's `cache()`. Without it, every call built a fresh client — a single render made several, each opening a connection and registering stream listeners, which produced the recurring `MaxListenersExceededWarning: 11 drain listeners added to [Gzip]`. Deduping is per-request, so a client is never shared between users and the auth boundary is unchanged.

### Don't ship columns the page never renders

`getBooks` deliberately omits `script_text` and documents why. The same discipline applies per-route: `/books/[bookId]` renders only `script.state` and `script.wordCount`, never `script.text`, yet `getChapters` selected `*` — shipping every chapter's full prose to a page that displays word counts.

Fixed by the `chapters_list` view (migration `20260917000003`), which omits `script_text` and counts words in Postgres. Measured on two real 10-chapter books:

| | bytes | time |
|---|---|---|
| `chapters` `select *` | 1,044,123 | 1510ms / 1222ms |
| `chapters_list` | 10,223 | 538ms / 533ms |

**99% less transferred.** The win is in transfer, not database work — Postgres still reads `script_text` to count words. That is the right trade when the wire is the bottleneck, and it is why the fix is a view rather than a stored column.

**Not a stored aggregate.** The schema forbids a `word_count` column, because a persisted rollup drifts from its source. A view recomputes per read and cannot drift. The prohibition is on *storing* the aggregate, not deriving it in SQL. The view's expression mirrors `countWords()` exactly and was verified against live data (20 chapters, 0 mismatches) plus round-tripped edge cases (empty string, whitespace-only, tabs/newlines, repeated spaces) — if one changes, change both.

**`ChapterListItem` is a separate type, not `Chapter` with an optional field.** An optional `text` would let a list row flow into the chapter editor and silently render an empty textarea. These shapes are not interchangeable and the compiler should enforce that.

**Verify the column is unused before dropping it.** "It's slow to fetch" and "it isn't needed" are different claims and were conflated once during this pass; `toChapter` builds `script.text` from that column, so removing it naively blanks every word count.

---

## Data Model Notes

`books` carries a `default_chapter_access` column (`chapter_access` enum, `not null default 'locked'`), planned but not yet migrated in this codebase — see Prompt Series Notes. Every chapter created inside a book — manually, by manuscript split, or by bulk import — inherits this value unless `app_settings.free_chapters_at_start` places the chapter inside the free run at the start of the book.

**Book-level audiobook upload is not built, and must not be.** A single whole-book audio file cannot be reliably split into per-chapter tracks; the mobile player queues one track per chapter, and read/listen parity stores an audio position scoped to a chapter id. A whole-book file breaks that parity, which this document ranks above every other feature. Narration is per-chapter only. Do not re-propose a book-level audio drop.

---

## Glossary

- **free / locked** — the only two `chapter_access` enum values, and the only two words used for this concept in both admin and app copy. Never "Premium" — the mobile paywall and the rewarded-ad flow ("Unlock this chapter") both say locked, and a "Premium" label in admin would make the two surfaces describe one state with two words.
- **script** — chapter prose. Never called a "document".
- **manuscript** — a whole-book document that is split into scripts.
- **narration** — chapter audio. Never called an "audiobook" — see Data Model Notes on why book-level audio is not built.

---

## Content Rules

Seed target: 2–3 multi-chapter serials with real chapter text, real cover art and real narration audio.

Load seed content **through this dashboard**, not by SQL insert. The point of seeding is to exercise the upload path end to end and surface its bugs before the mobile app depends on it.

Seeding a 100+ chapter serial one chapter at a time is not viable. A7 is a prerequisite for seeding at scale.

The maturity flag is set per book in A3. The mobile app respects it per title, so setting it correctly here is a compliance obligation, not a nicety.

---

## Code Simplicity Rules

Avoid overengineering.

Duplicate twice; extract on the third use. No barrel-file re-export webs. No wrapper around a wrapper — if a component only forwards props, delete it. Delete dead code rather than commenting it out.

Refactor only when needed.

---

## Component Creation Rule

Only create reusable components when necessary. Ask if unsure.

Check `components/ui/` first — `Button`, `Input`, `Textarea`, `Select`, `Table`, `Badge`, `Dialog`, `DropdownMenu` and `Switch` already exist or should be added via the shadcn CLI.

Components take data via props and do not fetch. Fetching lives in Server Components or `hooks/`.

Every interactive component implements its full state set and has an accessible label.

Name by role, not appearance: `PrimaryButton`, not `OrangeButton`. `StatusPill`, not `GreenBadge`.

`SegmentedControl` must default to the correct option — `Mature 18+` for maturity, `Locked` for chapter access. This is a known defect source in the design frames.

---

## Linting and Validation

Run:

```bash
npm run lint
npm run typecheck
```

Fix errors. A change that does not typecheck is not done.

Do not disable a rule to silence an error; fix the cause. An inline disable needs a justification comment. Do not reformat files you did not otherwise change.

---

## Communication Style

Be concise.

Lead with what changed and where — file paths, then the reason. Explain how to test.

Flag deviations from this file explicitly, with the source that justifies them. State assumptions and mark them as assumptions. If a design image and this file disagree, say so rather than silently choosing.

No progress narration. No restating the request. No summarising work visible in the diff.

---

## Important Constraints

**Supabase is the database.** All catalog and chapter data lives in Postgres. No local JSON as a system of record.

Use:

- Supabase Postgres for books, chapters, chapter text, access flags
- Supabase Storage for covers, narration audio and script files
- Supabase Smart CDN for delivery
- Server Components and Server Actions for reads and mutations
- Route Handlers only where a webhook or a streaming response requires one

**No secrets in the browser.** Service-role keys, signing secrets and Clerk secret keys stay server-side. Anything needing elevated access runs in a Server Action, Route Handler or Edge Function.

**Never hand-edit generated files** — `types/database.ts` and already-applied migrations.

**Desktop only.** 1440 × 1024 is the target. Do not spend effort on mobile breakpoints for this surface.

**This tool is internal.** No public sign-up, no author self-service, no creator-facing analytics in V1.

---

## Deferred Security Tasks — DO BEFORE PRODUCTION

These are known, accepted-for-now gaps, deliberately deferred while the dashboard is still being built against a Clerk **development** instance. None is safe to carry into production. Work through this list before the first real deployment, and delete each line only once it is actually done.

1. **Rotate the Clerk secret key.** The current `CLERK_SECRET_KEY` in `.env` was exposed in an assistant conversation on 2026-09-16 (read out of the file into a chat transcript). `.env` is gitignored and was confirmed untracked, and the key showed "Never used" in the Clerk Dashboard at the time, so there is no evidence of misuse — but it has left its intended home and must be replaced. Clerk has no in-place "regenerate": API keys → **+ Add new key** → put the new value in `.env` → **then** delete the old `default` key (in that order, or there is a window with no working key).
2. **Turn off "Sign-up with email"** in Clerk → Configure → User & authentication. This app has **no sign-up route** by design (see Clerk Rules) and operators are provisioned in the Dashboard, but Clerk's hosted sign-up URL is reachable while this toggle is on. Anyone signing up that way is correctly blocked by the admin role gate and lands on `/not-authorised` — so this is junk-user-record hygiene, not an open door. Left on during development only so Dashboard-side user creation is not disrupted.
3. **Provision a production Clerk instance.** Development instance keys (`pk_test_`/`sk_test_`) and the dev issuer domain must not ship. A production instance has a different issuer, which means Supabase Third-Party Auth has to be registered a second time against it (see Supabase Rules) — plan that alongside prompt 12 rather than after it.
4. **Migrate off `createRouteMatcher`.** Clerk now emits a deprecation warning at dev-server boot: it "is deprecated and will be removed in the next major release", and the recommendation is resource-based auth checks moved into each page/layout/route, because "middleware-based auth checks rely on path matching, which can diverge from how Next.js routes requests and leave protected resources reachable." Migration guide: `clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher`. Not urgent — this codebase **already** does the resource-based half (`requireAdmin()` in the `(dashboard)` layout is the real authorisation boundary), so `src/proxy.ts` is only handling the unauthenticated redirect. Prompt 11 specified `createRouteMatcher` explicitly, so it stays until a deliberate migration pass.
5. **Re-run prompt 11's verification against live sessions.** Confirm a signed-in user *without* `role: admin` cannot reach `/`, `/books` or `/settings`, and that temporarily removing `src/proxy.ts` still blocks them via the `(dashboard)` layout's `requireAdmin()`. That second test is the one that proves authorisation is not proxy-dependent. It needs two real Clerk users, so it could not be run at implementation time.

## Prompt Series Notes

The book/chapter workflow correction prompt (20) supersedes: the disabled `Add chapter` / `Delete book` overflow-menu placeholders from the Books-list prompt (04); the separate new-book-mode layout and the old two-button Chapters-card header from the Book-editor prompt (05); and the book-editor entry point referenced by the bulk-script-import and bulk-import-wiring prompts (10, 18). It adds one column (`default_chapter_access`) to the Supabase schema prompt (12).

As of this codebase's current state, prompts 11 through 18 (Clerk auth, Supabase schema/RLS, reads, writes, cover upload, audio TUS upload, script upload/parse, bulk import wiring) have not been implemented — there is no backend, no auth and no real file upload anywhere in this app yet. Prompt 20's UI/UX corrections (the unified book editor, the locked-card pattern, the Manuscript card, the chapter-creation page, and the reproducible defect fixes) were implemented ahead of that backend, against mock data, with every server action stubbed as a typed no-op that validates and reports what it would do rather than persisting anything. `default_chapter_access` therefore exists on the mock `Book` type and fixture only, not as a real migrated column, until prompt 12 (and its correction) actually runs. Do not treat any create/save action in this app as persisting data until prompts 11–18 land.

The chapter-composer prompt (21) supersedes A4a (Chapter creation) as a dedicated route: chapter creation moves into an inline composer on A3, and `/books/<id>/chapters/new` is superseded and unlinked, not deleted (open question 1 below). Its three cards (Chapter script, Narration audio, Chapter settings) were extracted out of the former chapter-creation page into shared components under `components/chapters/` so the composer and the unlinked route render identical UI rather than forked copies. Like prompt 20, this is a UI-shell-only pass — no server action, no Supabase call, and no migration were added; "Create chapter" in the composer validates and toasts without persisting, same as the rest of this app until prompts 11–18 land.

Following prompt 21, the composer's Chapter script textarea and Narration audio picker were unlocked, `Create chapter` was wired to actually append the new chapter to the Chapters card, and — at a further, explicit follow-up request — this liveness was extended to **create mode too** (`/books/new`), not just edit mode. A third follow-up request replaced the script card's paste-only textarea with a real `.txt`/`.md` file picker (client-side `file.text()` read, same approach as the Manuscript card) as the primary path, keeping the textarea as a fallback for pasting/tweaking — because the operator's actual workflow is uploading finished chapter files, not typing prose into the dashboard by hand. This goes beyond prompt 21's "no real chapter creation" UI-shell scope and beyond its own §7.1 (book-level lock in create mode). A fourth follow-up request installed `mammoth` (see Scripts, under Upload Rules) and wired real client-side `.docx` extraction into both the composer's script card and the Manuscript card, replacing their earlier "not wired up yet" messages — this is real text extraction, verified against mammoth's own test fixtures, not a stub. A fifth follow-up request unlocked Cover thumbnail and Manuscript in create mode too (both were client-side-only already — object URL preview, text extraction — so the same reasoning applied), and wired Manuscript's `Confirm` to actually append the split chapters rather than just toasting. A sixth follow-up request made the Chapters table's `Set free`/`Set locked` and `Delete chapter` overflow-menu items live (the latter behind a confirm `Dialog`), operating on the same local chapter state. The result is still not a backend: chapters live only in the book editor's React state (`useState` in `book-editor.tsx`, seeded from the server-passed chapters in edit mode, empty in create mode), never reach `mock-catalog.ts`, and any create/edit/delete is lost on reload — and in create mode, lost immediately if `Create book` is never pressed, since there is no book id for the chapters to belong to. `ChaptersCard`'s own `locked` prop and `CoverThumbnailCard`'s `locked` prop were both removed as dead code once this landed, along with `NarrationAudioCard`'s unused `reason` prop (its `LockedCardNotice` branch is now unreachable everywhere, but the component itself was kept per the "Locked-card pattern (retired from A3)" note above). The "Adding many chapters? Use bulk import." line was removed from the composer at the same request.

Making `Set free`/`Set locked`/`Delete chapter` live surfaced a real bug, not a scope question: the Chapters table's row-level `onClick` navigated to `/books/<id>/chapters/<n>` (A4, unbuilt) on **any** click anywhere in the row, including clicks on `DropdownMenuItem`s inside the portalled `⋯` menu — a React-portal event-bubbling gotcha (see Actionable Rows above) that produced a 404 the moment `Set free`/`Delete chapter` were wired up. Fixed by adding `stopPropagation()` to every dropdown item and removing the row's click-to-navigate entirely, and disabled `Open` alongside it since A4 doesn't exist. A follow-up request then pointed out `+ Upload text` / `+ Upload audio` had the identical dead-route bug and asked for them to work rather than stay disabled — per an explicit, flagged deviation from the single-upload-surface rule (see Upload Rules), both now open a local file picker in-row and read the file client-side (`UploadTextButton`/`UploadAudioButton` in `chapters-table.tsx`, reusing `extractDocxText` and the same `Audio.onloadedmetadata` duration-read approach as `NarrationAudioCard`), writing straight into the same local chapter state via new `onUploadScript`/`onUploadAudio` callbacks on `BookEditor`. `bookId` and `useRouter` were removed from `ChaptersCard` as dead code once nothing in it navigated any more.

A final follow-up asked what actually distinguishes Manuscript from Chapter script, since both accept the same file formats — a fair question given their overlapping mechanism (whole-book-split versus one-chapter-text). Rather than leave that to be re-explained per operator, both cards' sub-lines were rewritten to cross-reference each other (see A3 above), including adding a sub-line to Chapter script at all, which the original prompt 21 spec (§3.1) said should have none.

A further request moved book-creation's Status field out of the Book details card and into a **Create Story dialog** (`components/books/create-book-dialog.tsx`): the primary button, renamed `Create book` → `Create Story` (and `New book` → `New Story` in this screen's title/breadcrumb), now opens a modal with `Save as draft` / `Publish` instead of submitting the form directly. Status stays a visible, editable field on the Book details card in **edit mode only**, so an operator can still change an existing book's publication state without a dedicated action for it. `BookEditorSaveButton` now branches on `isCreate` to either open the dialog (`type="button"`, no longer `type="submit"`) or submit the form as before. Same honesty rule as everywhere else: choosing Draft or Publish in the dialog only sets local form state and toasts — no book is actually created either way, since there is no backend yet.

A follow-up request extended the `New book` → `New Story` rename to every remaining instance in the app: the Books list header button, both Dashboard `New book` buttons (header and the "Needs attention" empty state), and the Books table's own empty-state button — all four now read `New Story`. This supersedes the narrower scoping recorded above (this-screen-only); there is no longer any "New book" text anywhere in the app.

A further request removed the Books list overflow menu's `Add chapter` item — it duplicated `Open` (both navigated to `/books/<id>`), since the Chapter composer only exists on the book editor page itself and this menu item could never scroll-and-focus it from a different page.

A final request removed the **Uploads** sidebar item and both its route files (`/uploads`, `/uploads/bulk-import`) — see the "Uploads removed from the sidebar" note under A6/A7 above for the full reasoning and what to do if those screens get built later.

**Prompt 06 (Chapter editor)** replaced the `/books/<id>/chapters/<n>` placeholder (a bare title/breadcrumb from prompt 04's work) with the real editor described under A4 above. Built as fully mock-data, no-backend UI, same as everything before it: `Save chapter` validates, updates local component state and the status line, and toasts — nothing reaches `mock-catalog.ts` or a database. Two gaps were flagged rather than silently resolved: no serif font exists in the type system (see Design Assets), and this screen's narration format copy (`.m4a` or `.mp3` only) intentionally diverges from `SETTINGS_DEFAULTS.acceptedAudioFormats` (which also lists `.wav`) because the design frame's copy is exact and literal — the composer's own Narration audio card still shows `.wav` too, so the two cards currently disagree with each other until that's reconciled one way or the other.

A follow-up fix then re-pointed the Chapters table's row click, `Open` menu item, and `+ Upload text`/`+ Upload audio` fallback buttons at this new page — all four had been disabled or turned into in-row-only file pickers during prompt 21's work specifically because this destination didn't exist yet (see the "Chapters table row click..." bullet under Known Implementation Defects for the mechanics).

A second follow-up closed the resulting gap where a chapter created via the composer or Manuscript import still 404'd when opened, since it only existed in `book-editor.tsx`'s memory and the chapter editor page reads from `mock-catalog.ts`. See the "Locally-created chapters now open correctly" bullet under Known Implementation Defects for the `sessionStorage`-mirroring fix (`lib/local-chapters.ts`, `ChapterEditorResolver`) and its one remaining known gap (prev/next navigation doesn't yet merge seeded and locally-created chapter numbers when starting from a seeded chapter).

A third follow-up reported that the *same* symptom (a broken chapter link) still occurred on `/books/new` specifically — a different bug from the two above, not a regression of them. The create screen has no `book.id` at all, so `ChaptersCard`'s chapter links were built from an empty string and collapsed to a malformed URL. See the "Chapter rows are not clickable on `/books/new`" bullet under Known Implementation Defects — every chapter navigation surface is now disabled on the create screen instead of linking to a page that cannot exist until the book itself is saved.

**Prompt 08 (Settings)** replaced the `/settings` placeholder (a bare title/breadcrumb from the app-shell prompt) with the real six-card screen described under A5 above. Same no-backend rule as everything before it: `Save changes` validates the whole-screen schema, toasts, and resets the form's dirty baseline — no settings row is written, because there is no settings table until the Supabase prompts land. `Test connection` simulates its round trip, `Invite member` closes without effect, `Remove` drops a row from local state only, and the Danger zone's type-to-confirm dialog deletes nothing.

Three things worth recording about that prompt:

- **`data/settings-defaults.ts` was extended, not bypassed.** Prompt 08 sources the Account rows and Team roster from that file, but it held neither — only storage/upload/publishing defaults. Rather than inline operator names and emails into components (which the Content Rules forbid), the file gained typed `SETTINGS_ACCOUNT`, `SETTINGS_TEAM`, `TEAM_ROLE_OPTIONS` and a `TeamRole` union, following the same `as const satisfies` shape as `STORAGE_PROVIDER_OPTIONS` and `MATURITY_LEVELS`. All of it is placeholder that Clerk/Supabase replace later.
- **Storage provider defaults to Supabase Storage, not the frame's Cloudflare R2**, per prompt 08's own override list — the frame's provider, bucket name and CDN domain are placeholder, and Supabase is this project's actual storage layer.
- **The frame's Team table shows a toggle inside the `ROLE` column on one row** while the other two show pills. Treated as the generator artifact prompt 08 says it is: every row renders a labelled role pill.

**Prompt 11 (Clerk auth)** is the first prompt in this series that does something real. Every screen before it was mock-data UI with stubbed actions; auth actually authenticates, and a wrong role check is a genuine access-control bug rather than a no-op. See "As implemented" under Clerk Rules for the two-layer design, the `proxy.ts` rename, and the session-token claim that the whole role gate depends on.

Three things it changed outside its own files:

- **`SETTINGS_ACCOUNT` was deleted from `data/settings-defaults.ts`** and the Settings Account card now reads the live session user (`useUser()` for name and primary email, `useAuth().sessionClaims` for the role pill). Every other default on that screen is untouched, per prompt 11's explicit instruction. The card's design is unchanged and the three values remain read-only — Clerk owns them.
- **`Change password` now links to `/account`** instead of toasting "not wired up yet". That toast was correct while no auth existed; it is obsolete now.
- **`@clerk/nextjs` was installed** (the first new dependency since `mammoth`), on the user's explicit instruction to implement this prompt. `@clerk/types` was deliberately *not* added — `lib/clerk-appearance.ts` lets its object type be inferred rather than pulling in a fourth Clerk package for one type annotation.

Still outstanding after this prompt: `getToken` is not yet consumed anywhere, because nothing calls Supabase yet. Prompt 12 wires it through the `accessToken` callback — and note AGENTS.md's Supabase Rules on the *deprecated* Clerk integration; the JWT-template pattern must not be reintroduced.

**Prompt 12 (Supabase schema & RLS)** created the catalog schema as four migrations under `supabase/migrations/`, plus three storage buckets. **No UI changed and no mock data was replaced** — that is prompt 13's job. The app looks and behaves exactly as it did before; the database simply exists alongside it now, unconnected.

What landed: `books`, `chapters`, `activity_log`, `app_settings` (single-row, check-constrained), four enums, an `updated_at` trigger attached to books/chapters/app_settings, a `chapters_needing_attention` view (`security_invoker = on`, so the underlying RLS still applies), RLS on every table, and the `covers`/`audio`/`scripts` buckets with size and MIME limits. Supabase env placeholders were added to `.env.example` with the service-role key commented server-only. `supabase` was installed as a devDependency (the CLI) and `supabase init` scaffolded `config.toml`.

Decisions worth keeping:

- **No stored aggregates**, per the prompt and this file's existing rule — no `chapter_count`, `audio_count`, `word_count` or `read_time` columns. Asset presence is derived from nullability (`script_text is null`, `audio_path is null`), and the view's missing-asset `case` mirrors `chapterMissingAsset()` in `lib/catalog.ts`. **If one changes, change both** — that duplication is deliberate (the view exists so the Dashboard reads one relation instead of every chapter row) but it is a real coupling.
- **`activity_log` is append-only**: select and insert policies for admins, and deliberately *no* update or delete policy for anyone. With RLS on and no policy, both are denied even to admins. An audit trail that can be rewritten isn't one.
- **Genres are not constrained in the database.** `genres text[]` is validated against `data/genres.ts` at the application layer, because that list is product copy that shouldn't need a migration to change.
- **Clerk ids are `text` everywhere** (`activity_log.actor_id`, `app_settings.updated_by`) and are never cast to `uuid`.

Two hazards recorded in the SQL itself rather than left implicit:

1. **`is_admin()`'s claim path is unverified.** It reads `auth.jwt() -> 'metadata' ->> 'role'`, matching the Clerk session-token claim configured in prompt 11. The prompt explicitly says to decode a real token and confirm the path before writing the function — that was impossible at authoring time (no linked project, no Docker). **If the path is wrong, every policy denies everything.** That fails closed rather than open, but it will present as a total outage, not a permissions bug. The function carries a comment saying so and how to check (`select auth.jwt();` as a known admin).
2. **Locked chapters are not protected at the row level.** `chapters_select` lets any authenticated non-admin read `script_text` for a published book, including chapters where `access = 'locked'`, because the mobile reader needs the prose. The same is true of the `audio` bucket. `locked` is a paywall state the *mobile app* enforces through entitlements — it is not a row-level secret. Both migrations say this in comments so nobody later assumes otherwise.

**Applied to a live project.** The migrations are no longer unexecuted SQL. Project `story-app-dashboad` (`fwjrdzzdtshbqrfkgivd`, `us-east-1`) was created and linked, and `supabase db push` applied all four cleanly. Introspection confirms: four tables all with `rls=true`, the four enums, the `chapters_needing_attention` view, the three buckets, and every policy including the storage ones. `types/database.ts` was generated from the live schema and typechecks.

Regenerating types: `npx supabase gen types typescript --linked`. **Do not pipe it through PowerShell's `Out-File -Encoding utf8`** — that writes a UTF-8 BOM (`EF BB BF`) into the file, which had to be stripped by hand. Redirect with a BOM-free writer, or strip the first three bytes after generating.

**Still not delivered, and genuinely blocked:**

- ~~`types/catalog.ts` has not been reconciled~~ **Done.** It now derives every primitive from the generated row types: the four enums come from `Database["public"]["Enums"]`, and each field from the matching `books`/`chapters` Row property (`NonNullable<...>` where the app type is narrower than the column). The discriminated unions (`CoverAsset`, `ScriptAsset`, `AudioAsset`) stay, because they model as an exhaustive `missing | ready` split what the database expresses as nullable columns — their *field* types still derive from the rows.

  Three things deliberately stay hand-declared, each for a stated reason:
  - **`MissingAsset`** is NOT derived from the `chapters_needing_attention` view. The view's `missing` column generates as `string | null` — Postgres types a bare `case` as `text`, and every view column is nullable because non-nullability can't be proven across a join. Deriving it would *widen* the type and lose exhaustiveness checking at every call site. It must be kept in step with the view's `case` and with `chapterMissingAsset()` in `lib/catalog.ts`.
  - **`Book.defaultChapterAccess`** has no column yet — planned for the schema but not migrated (see Data Model Notes). It types as `ChapterAccess`, which *is* derived.
  - **`ActivityEntry`** does not match `activity_log`'s row shape (the table has `actor_id`, `book_id`, `chapter_id`; the UI type has `timestamp`). Left alone until prompt 13 decides what that screen actually reads.
- ~~`is_admin()`'s claim path is still unverified~~ **Confirmed correct.** Clerk is now registered under Supabase → Authentication → Third-Party Auth (domain `https://cheerful-walleye-3066.clerk.accounts.dev`) with the Clerk-side Supabase integration enabled. A live admin session token was decoded server-side and carries both claims the design depends on: `role: "authenticated"` at the top level (injected by the integration — every policy targets `to authenticated`, so nothing works without it) and `metadata: { role: "admin" }`. `is_admin()`'s path `auth.jwt() -> 'metadata' ->> 'role'` is therefore right as written and needs no corrective migration.

  Note the **two different `role` claims** in a Clerk token, which is a live trap: the top-level one is Postgres's role and is always `authenticated`; the operator role is the nested `metadata.role`. Conflating them makes `is_admin()` false for everyone and every policy denies everything.

- ~~The Verification section has not been run~~ **Run, and the policies hold.** Tested by impersonating JWT claims in SQL (`set local role authenticated` plus `set local request.jwt.claims`), which is exactly how Postgres evaluates `auth.jwt()`:

  | Check | Non-admin | Admin |
  | --- | --- | --- |
  | `is_admin()` | false | true |
  | books visible | 1 (published only) | 2 (incl. draft) |
  | draft books | 0 | 1 |
  | chapters visible | 1 (published parent only) | 2 |
  | `activity_log` | 0 | 1 |
  | `app_settings` | 0 | 1 |
  | `chapters_needing_attention` | 1 | 2 |

  Every non-admin write was refused: `books`/`chapters`/`activity_log` inserts raised `violates row-level security policy`; `update`/`delete` on `books`, `app_settings` and `activity_log` ran but matched zero rows because the `using` clause filters them out first. That second outcome was then confirmed as genuine filtering rather than absent rows — reading back as admin showed the published book still titled correctly (not `HACKED`), the draft book intact, no `HACK` rows created, the activity row surviving its delete, and `app_settings.bucket_name` unmodified.

  The view also confirmed `security_invoker` works: a non-admin sees only the published book's chapter through it, and its derived `missing` value matched `chapterMissingAsset()`.

  Verification fixtures (two `VERIFY ...` books, their chapters, one `activity_log` row, the `app_settings` row) were inserted for this test and then deleted, so the database is empty again for prompt 13.

**Storage policies verified too**, against the live storage API with real HTTP requests (SQL impersonation cannot reach them — storage policies are enforced at the API layer). A probe object was uploaded into each bucket with the service-role key, fetched under three auth contexts, then deleted:

| Request | `covers` (public read) | `audio` (authed read) | `scripts` (admin only) |
| --- | --- | --- | --- |
| Public URL, no auth | **200** (correct) | denied | denied |
| anon key, no Clerk token | 200 | **`NoSuchKey`** | **`NoSuchKey`** |
| Valid admin Clerk token | 200 | 200 | **200** |
| Service role (control) | 200 | 200 | 200 |

So `scripts` refuses an unauthenticated reader and serves an admin — the behaviour the prompt asks for — and the three buckets genuinely differ rather than all denying by accident.

Two traps worth recording, because both produced convincing false results first:

1. **A Clerk session token minted via the backend API lives 60 seconds.** Using one even a minute later makes the storage API return `{"code":"NoSuchBucket","message":"Bucket not found"}` — *not* an auth error. An expired token resolves to no authenticated context, so no bucket is visible. This looked exactly like a broken policy until the token was re-minted and used immediately, whereupon every bucket returned 200. Mint and use in the same breath.
2. **Supabase Storage returns HTTP 400 with a 404-shaped JSON body** for these failures, and denial surfaces as `NoSuchKey` ("Object not found") rather than 403 — deliberately, so a denied read cannot be used to probe whether an object exists. Do not read a bare status code as an authorization result; read the body. An early pass at this verification mislabelled several 400s as "DENIED" when they were in fact malformed requests, which is a false pass on a security check.

Bucket MIME allowlists are also live: uploading `text/plain` into `covers` or `audio` is rejected, and the correct types (`image/jpeg`, `audio/mpeg`) succeed.

All probe objects were deleted afterwards; the three buckets are empty for prompt 13.

**Prompt 13 (Supabase reads)** replaced every mock-data read with a real query. `data/mock-catalog.ts` and `data/mock-activity.ts` are **deleted**; nothing imports them. No screen's layout, copy or component structure changed.

New modules:

- **`lib/supabase.ts`** — `createSupabaseClient(getToken)` using the `accessToken` callback. The deprecated JWT-template-in-a-global-header pattern is documented in the file as forbidden.
- **`lib/supabase-admin.ts`** — service-role client, unused by design. Its comment states the constraint: reaching for it to make a *read* work means the read is wrong.
- **`lib/server-supabase.ts`** — `serverSupabase()` and `serverSupabaseWithSettings()`. Almost every screen needs `app_settings.public_cdn_domain` before it can turn a storage path into a URL, so fetching both together avoids a second round trip per page.
- **`lib/catalog-mappers.ts`** — nullable columns → discriminated unions (`toScriptAsset`, `toAudioAsset`, `toCoverAsset`, `toBook`, `toChapter`) plus `storageUrl`. `audio_duration_source` is carried through so the Chapter editor keeps distinguishing `Detected` from `Edited`.
- **`lib/queries.ts`** — the ten screen reads.
- **`components/shell/query-error-card.tsx`** — the error state.

**`QueryResult<T>` is the core discipline here.** Every query returns `{ok:true,data}` or `{ok:false,error}` rather than throwing or returning `[]` on failure. A failed request and an empty table must look different to the operator: one means "something is broken", the other means "create something". Swallowing an error into an empty array shows a reassuring empty catalog over a real outage — including an RLS rejection, which is the case most likely to *look* like emptiness.

**`getBooks` deliberately does not select `script_text`.** It selects `book_id, script_text, audio_path` only to compute presence counts. Pulling every chapter's prose to render a list would move megabytes for a 148-chapter serial — the one performance mistake that actually bites at this schema's scale.

**A schema change was needed and made:** `books.default_chapter_access` (migration `20260917000001`). AGENTS.md's Data Model Notes already specified this column; prompt 12's table definition omitted it. Prompt 13 forbids schema changes, so this is an explicit, approved deviation — but it is *completing* prompt 12's intent, not inventing something. It is deliberately not the same as `app_settings.default_chapter_access`: that one is "what a new book defaults to", this one is "what this serial defaults to". Collapsing them would lose per-serial paywall shape (1–3 free then locked, versus a fully free backlist title). No UI changed — the Book editor's existing Select simply has a real column behind it now.

**`app_settings` has no row on a fresh database**, and prompt 12 forbids seeding one in a migration. `getAppSettings` therefore falls back to the `SETTINGS_DEFAULTS` constants when the table is empty. That is a real state the app must render in, not a placeholder — the row gets created by the Settings screen's own Save once writes land.

Two gaps flagged rather than silently closed:

1. **`NarrationAudioCard` still reads `SETTINGS_DEFAULTS`** for its accepted-formats line and max size, not `app_settings`. Threading real settings in would mean adding a prop to it and to every composer that renders it, which prompt 13 forbids. An operator who edits accepted formats in Settings will not see that card's constraint line change until the prop is added. Noted in the component too.
2. **Writes still bypass the database entirely.** The composer, Manuscript import and Chapter editor Save all mutate local state and `sessionStorage` only — `createChapter`/`updateChapter`/`importManuscript` land in prompt 14. For this one prompt the dashboard *reads* from Postgres but *creates* into memory, so a chapter composed on screen will not appear in the Books list ratios, which now come from the database. That looks like a regression and is not one; it resolves in prompt 14.

**Prompt 14 (Supabase writes)** made every form persist. `app/actions/` holds the mutation layer: `books.ts`, `chapters.ts`, `settings.ts`, plus `activity.ts` (the log helper) and `types.ts` (`ActionResult`). Nothing in the UI fabricates a row any more.

Every action follows the same shape, in this order: `requireAdmin()` as the **first statement**, zod validation of the input, the mutation through the user-token client so RLS applies, an `activity_log` row, `revalidatePath` for each affected route, then a typed result. `lib/supabase-admin.ts` is still unused — no action needed it, which is the intended signal that the policies are right.

**`ActionResult` carries form-level and field-level errors separately**, because a form needs to render "this field is wrong" inline and "the operation failed" above the primary action. Raw Supabase errors never reach the UI: `describeDbError` maps `42501`/`row-level security` to an authorisation message and `23505` to a conflict, and a chapter-number collision is resolved into a field error naming the conflicting chapter's title.

**A silent zero-row write is treated as failure, not success.** An `update` or `delete` that returns no error but affects no rows means RLS filtered it out. Every such action checks the returned row (or `count`) and surfaces an authorisation message rather than toasting success over a change that did not happen.

**Optimistic UI is used in exactly one place**, per the prompt: the chapter access toggle, where the change is one boolean and instant feedback matters while working down a list. It reverts on failure. Forms all wait for the server — a book save that showed success while silently failing is worse than one that took 300ms.

Two places prompt 14 described a screen this app does not have. Both were raised and the resolution approved:

1. **`Add chapter` does not create a blank row and navigate.** The prompt assumed it navigates to a chapter route; it actually scrolls to and focuses the Chapter composer, which is the single chapter-creation surface established in prompt 21. Following the prompt literally would have produced blank untitled chapters and made the composer redundant — a structural change. Instead the **composer's own `Create chapter` button** calls `createChapter`, which achieves the prompt's actual goal (a real row exists before the Chapter editor can open it) without discarding the composer.
2. **The Books list has no `Add chapter` item to enable.** It was removed earlier at explicit request because it duplicated `Open`. It stays removed. `Delete book` on that menu is wired as specified, behind a type-the-title confirm.

**The sessionStorage layer was deleted.** `lib/local-chapters.ts` and `components/chapters/chapter-editor-resolver.tsx` existed only because chapters lived in React state with no database behind them. Chapters persist now, so `writeLocalChapters` had no callers and the resolver was reading a store nothing wrote — its fallback path could never fire. Leaving it would have implied a mechanism that no longer exists. The chapter editor route now renders a plain "Chapter not found" when a chapter genuinely is not in the database.

**A real defect was introduced and caught during prompt 14's verification: the Manuscript card toasted success over a write that never happened.** Changing `onImport`'s contract in `book-editor.tsx` (from "append these chapters to local state" to `() => router.refresh()`) orphaned its caller: `ManuscriptCard` still built client-side `Chapter` objects, handed them to a callback that now discarded them, then unconditionally toasted `Created 9 chapters`. Nothing was created. On `/books/new` it could not have been, since there is no book id to attach chapters to.

That is precisely the failure this prompt exists to eliminate, so "bulk import stays as-is until prompt 18" could not mean "keeps lying". Fixed **within** prompt 14's scope by reusing the existing `createChapter` action in a sequential loop — each split section is just a chapter create, so no bulk path was added and prompt 18 still owns real bulk import. Sequential rather than parallel, because chapter numbers race for the `(book_id, number)` unique constraint otherwise. A partial failure now reports `Created N of M chapters, then stopped: <reason>` rather than claiming the whole import succeeded, and the card is disabled entirely when `bookId === ""`.

**`setState` during render on save.** The Book editor logged `Cannot update a component ('BookEditor') while rendering a different component ('Controller')` on every successful save. It took four attempts. The full root cause, the three wrong diagnoses, and the reusable procedure are consolidated under **"Debugging `setState`-during-render (React + react-hook-form)"** in the Debugging Playbooks section near the top of this file — read that, not this paragraph, when the class of error recurs.

Short version for this specific incident: the cause was `form.reset(values)` in the save tail, fixed with `form.resetDefaultValues(values)`. `settings-screen.tsx` had the identical pattern and got the identical fix. `create-book-dialog.tsx` never calls `reset` and is unaffected.

**Correction (2026-09-17).** This paragraph previously claimed `chapter-editor.tsx`'s `form.reset` was "a genuine discard-and-reload path … so it was left alone". That was wrong. There is exactly one `form.reset` in that file and it sits in the save-acceptance tail, immediately after `toast.success("Chapter saved")` — structurally identical to the Book editor's. It was a latent third instance of the same defect, fixed with `resetDefaultValues` during the performance pass. The lesson is the doc's own: a claim about a call site must be re-verified against the file, not inherited from an earlier note.

**Create mode now defers chapter work instead of blocking it.** The `bookId === ""` guard was correct — a chapter needs a saved parent — but the experience it produced was not: an operator could fill in a book, upload a manuscript, watch it split into nine chapters, compose a chapter, and then confirm none of it. The only path through was save → navigate to Books → reopen the book → re-upload everything. Work was being thrown away to satisfy a constraint that could be satisfied a moment later instead.

Now `Confirm` and `Create chapter` stay enabled in create mode and hold their work on screen, saying plainly that it is created when Create Story runs. `CreateBookDialog` takes an `onCreated(bookId)` callback that fires **after the row exists but before navigation**; `BookEditor` uses it to call `flush(newBookId)` on `ManuscriptCardHandle` and `ChapterComposerHandle`, both exposed via `useImperativeHandle`. The chapters still get a saved parent before insertion — the governing rule is intact — the operator simply no longer has to re-enter everything. `ManuscriptCard`'s `createSections` is shared between `Confirm` and `flush` so the two paths cannot drift.

**A copy addition was made under a prompt that forbids copy changes, deliberately and at explicit request.** On `/books/new` both the Chapter composer's `Create chapter` and the Manuscript card's `Confirm` are disabled, because `bookId === ""` until the story is saved — a chapter needs a parent row to belong to (Project Rules). That guard is correct and stays. But both buttons sat inert with **no stated reason**, which read as a broken screen rather than a precondition, and cost real confusion during verification. Each card now renders one muted line when `bookId === ""`: *"Press Create Story first — a chapter needs a saved story to belong to."* Nothing else changed: no layout, no guard removed, no control enabled. Flagged here because prompt 14 line 7 forbids copy changes without asking, and this one was asked for.

**Lesson worth keeping: changing a callback's contract is a change to every caller.** The type system did not catch this one because `(chapters: Chapter[]) => void` accepts a `() => void` handler at the call site. Grep for callers when a prop's meaning changes, not just when its type does.

**Known gap, flagged not fixed: `deleteBook` orphans storage objects.** Chapters cascade via the foreign key, but cover, audio and script files remain in their buckets — the action knows the book id, not the object paths, and no upload path exists yet to have recorded them. `deleteSeedData` does clean storage properly (it walks all three buckets and removes everything), so the leak is confined to single-book deletes. This should be closed when prompts 15–17 add real upload paths and the rows begin carrying storage paths worth deleting.

**Prompt 15 (Cover upload)** replaced the Cover thumbnail card's local-preview-only behaviour with real direct-to-storage uploads. `app/actions/covers.ts` holds three actions: `createCoverUploadUrl` (mints a signed upload URL), `setBookCover` (persists the five `cover_*` columns), `removeBookCover` (nulls them and deletes the object). The card keeps its exact layout — dashed 2:3 frame, mono file name and size, `Replace`/`Remove`, constraint line, empty dropzone.

**The file body never reaches the app server.** The browser gets a signed URL and uploads straight to Supabase Storage. `createCoverUploadUrl` validates type and size server-side (the browser check is a courtesy, this is the boundary) and confirms the book is visible to the caller before authorising a write under its id.

**Upload uses a hand-rolled `XMLHttpRequest`, not `supabase.storage.uploadToSignedUrl`.** The SDK method works but exposes no progress events, and prompt 15 requires a determinate progress bar with a `<uploaded> / <total>` readout. XHR is the only browser API that reports upload progress. The endpoint shape (`/storage/v1/object/upload/sign/covers/<path>?token=<token>`) was **verified end to end against the live project** before shipping — minted a URL, PUT a real JPEG, got `HTTP 200` and `{"Key":"covers/..."}`, then deleted the probe. That verification mattered: a wrong URL shape would fail only at runtime, and typecheck/lint/build would all pass regardless.

**PNG was kept, and the bucket widened to match.** Prompt 15 line 29 says "JPEG or WebP only", but the card's constraint line has read "JPG, PNG or WebP" since an explicit earlier product decision, and prompt 12 created the bucket with `image/jpeg` + `image/webp`. Three sources, two of them disagreeing with the UI. Resolved at the user's direction in favour of the product decision: migration `20260917000002` adds `image/png` to `allowed_mime_types`, so the copy, the client validation and the bucket now all agree. That agreement is the rule AGENTS.md actually protects (see the cover-fixture entry under Known implementation defects) — not "never widen the allowlist".

**Covers defer during story creation**, the same pattern as the Manuscript card and Chapter composer. A cover path embeds the book id (`covers/<bookId>/<uuid>.<ext>`), which does not exist on `/books/new`, so the picked file is held with an object-URL preview and uploaded by `CoverThumbnailCardHandle.flush(newBookId)` from `CreateBookDialog`'s `onCreated` callback. The governing rule still holds — the object is written only after the parent row exists.

**Replace ordering is upload → repoint row → delete old**, never delete-first. `setBookCover` takes the previous path and removes it only after the row points at the new object, so a failed delete orphans a file rather than leaving a book with no cover. A failed delete is logged and tolerated. Paths are immutable and `x-upsert` is never used: overwriting serves stale content through the CDN until propagation catches up.

**Dimension mismatch warns, it does not reject.** Type and size rejections discard the file with a specific toast; a non-800×1200 image uploads with a muted line stating the detected dimensions. Operators source art from many places, and a visibly-wrong cover is fixable where an unuploadable one is not.

**A raw network error was leaking straight to the operator.** A failed Book details Save once rendered the literal string `TypeError: fetch failed` under the "Book details" heading. Cause: `describeDbError` (`app/actions/types.ts`) only special-cased RLS and unique-constraint violations and returned every other error's `.message` verbatim. supabase-js/postgrest-js catches a failed `fetch()` internally and resolves with `{ error }` rather than throwing, so a transient connectivity blip's raw `TypeError` string flowed unmodified into `formError`. Not correlated with cover upload specifically — the call was inside `updateBook`'s own database update, so it could happen on any Save. Fixed with an `isNetworkError` shape-match (network failures never carry a Postgres error code, so they're matched on message pattern instead) returning "Couldn't reach the database. Check your connection and try again." Every action routes through this one function, so the fix covers `books.ts`, `chapters.ts`, `settings.ts` and `covers.ts` at once.

**Related hardening gap, closed at the same time:** `handleSave` in `book-editor.tsx` had no `try/catch` around the action call. A thrown exception (rather than a returned `ActionResult`) would have left `pending` stuck `true` forever with nothing shown to the operator — a permanently-disabled Save button with no explanation. Now wrapped, with the same network-failure message on a genuine throw.

**The `setState`-in-render warning was finally root-caused during this prompt's verification** — `form.reset()` in the save tail, fixed with `form.resetDefaultValues(values)` in both `book-editor.tsx` and `settings-screen.tsx`. Full mechanism, the expanded stack trace that revealed it, the three wrong diagnoses, and the ruled-out table live in **"Debugging `setState`-during-render (React + react-hook-form)"** under Debugging Playbooks. Not restated here — one canonical copy, so the two cannot drift apart.

**A transient `ClerkRuntimeError: Failed to load Clerk JS` was investigated and found to be a real network condition, not a code defect.** Checked directly: clock skew 1.0s (fine), Clerk's JS CDN returned `HTTP 200` three times in a row from the dev machine. The same class of intermittent failure as the earlier `/touch` timeout (see `docs/AUTH-SETUP.md`), most likely the same IPv6-routing flakiness. **No code change was made for this** — there is nothing in this app's Clerk integration to fix, and reload is the correct remedy.

**One real, narrow consequence of that was fixed: cover upload could hang forever with no visible failure.** When Clerk's session is unavailable (script load failure, or any other upstream stall), `createCoverUploadUrl`'s promise never resolves, so the upload progress bar sat at its initial `0.0 KB` state indefinitely — waiting on a promise that was never going to settle, rather than reaching the card's own `failed` state (which already existed and already renders correctly for other failure modes). Fixed in `cover-thumbnail-card.tsx`: `uploadFor` now wraps its whole body in `try/catch` and races both Server Action calls (`createCoverUploadUrl`, `setBookCover`) against a 20-second `withTimeout` helper, so a stalled upstream dependency reaches `{ status: "failed" }` with a specific message and the existing `Retry` action, instead of hanging. This is a general resilience fix — it protects against any stall (auth, network, server), not specifically against Clerk's load failure.

**Open questions from prompt 21, flagged and not resolved in code:**

1. Delete `/books/<id>/chapters/new`, or keep it as a deep-link surface that renders the same composer cards? Currently kept, unlinked.
2. Two ember buttons now exist on the book editor screen (`Create Story` in the page header, `Create chapter` at the foot of the Chapter settings card) — the design system's "exactly one ember button per screen" rule is violated. Which keeps ember? Not resolved here; both currently render ember.
3. The formatting toolbar (Bold/Italic/H2/paste-as-plain) exists on the Chapter editor (A4) script card but is deliberately absent from the composer's script card. Intended permanently, or should the composer gain it too?

---

## Final Reminder

Before every feature implementation:

- Read this file
- Follow it strictly
- Build clean, simple code
- Replicate UI exactly when designs are provided
- Treat placeholder content as data, never as constants
- Never add a metric nobody asked for
- Make every missing asset fixable from where the operator is standing

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
