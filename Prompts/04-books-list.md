# 04-books-list

Read AGENTS.md first and follow it strictly.

Implement the Books list screen exactly as shown in the attached design. Use the mock catalog from `data/mock-catalog.ts` and the existing Tailwind tokens, type utilities and global CSS utilities from the design system.

Route: `app/(dashboard)/books/page.tsx`, replacing the placeholder from the app shell prompt.

## Layout

Breadcrumb `Books`. Page title `Books` at 24px / 600. Ember `New book` button right-aligned on the title row — this is the single primary button on this screen.

Beneath the title, a full-width search input with a leading magnifier icon and the placeholder `Search books by title...`. A search input and nothing else. No filter dropdowns, no status tabs, no stat cards, no sort controls.

Below the search, a single card containing the books table. Beneath the card, a muted footer line reading the book count.

## Table

Compose from the shadcn `<Table />` primitive plus TanStack Table, per AGENTS.md. Columns:

1. **Cover** — 40 × 60 thumbnail at a 2:3 ratio, 4px radius. Renders via `next/image` with explicit width and height, through the centralized import in `constants/images.ts`.
2. **Title** — the full title in `text` at 14px. Never truncated. The column takes the remaining width.
3. **Chapters** — a ratio of chapters with script ready over total chapters, rendered in mono. The numerator and the `/` and the denominator are styled as in the frame, with the denominator in `muted`.
4. **Audio** — a ratio of chapters with audio ready over total chapters, in mono. Rendered in `status-ok` when the two numbers are equal, and in `status-warn` when audio is incomplete.
5. **Actions** — a trailing overflow (`⋯`) menu, right-aligned, using the shadcn `dropdown-menu` primitive. Menu items: `Open`, `Add chapter`, and a `destructive` `Delete book`. None of them perform a mutation in this prompt — `Open` navigates, the other two are rendered and disabled.

Table header row uses the table-header type utility. Rows are 48px tall with a 1px `border` divider between them and a subtle hover background.

**Every ratio on this screen is computed at render time** by `bookChapterProgress` and `bookAudioProgress` from `lib/catalog.ts`. Do not read an aggregate off a book object and do not hardcode any number from the frame.

Enable TanStack Table's client-side global filter, wired to the search input, matching on title only, case-insensitive. No pagination and no sort indicators — the catalog is small and neither appears in the design.

## Navigation

Clicking anywhere on a row opens `/books/<id>`, as does the `Open` menu item. Rows show a pointer cursor and a hover highlight.

`New book` navigates to `/books/new`.

Neither route exists yet. Create minimal placeholder pages at `app/(dashboard)/books/[bookId]/page.tsx` and `app/(dashboard)/books/new/page.tsx` that render only the correct breadcrumb and page title, so navigation does not 404. The next prompt replaces the first of these with the real Book editor.

## States

- **Loading** — skeleton rows matching the table structure, using the `skeleton` primitive. Not a centered spinner.
- **Empty catalog** — inside the card, a short heading, one muted explanatory line, and the `New book` action. Explain the next step rather than saying "no data".
- **No search results** — a distinct message naming the query, with a `Clear search` action. Do not reuse the empty-catalog copy.

## Overrides — deviate from the attached design here

- The frame shows a **three-item sidebar with no Dashboard**. It is stale. The four-item sidebar built in the app shell prompt is correct — do not touch the shell.
- The frame's table **overflows its card and clips the trailing overflow column**. The table must fit inside the card bounds with the `⋯` menu fully visible and clickable. Use the table wrapper utility that clips to the card.
- The frame **truncates book titles** where the column has room. Titles render in full.
- Book titles, author names, ratios and the footer count in the frame are placeholder. All of it comes from `data/mock-catalog.ts` and `lib/catalog.ts`.

## Covers

Mock books in the fixture carry cover URLs. For any book whose `cover.state` is `"missing"`, render a neutral local placeholder through `constants/images.ts` — a flat `border`-colored 2:3 block with a small muted book glyph. Do not generate or source cover artwork. If a remote mock cover host needs allowing, add the hostname to `next.config.ts` rather than disabling image optimization.

## Constraints

- Server Component for the page and the data read. The table is a Client Component only because filtering and the dropdown need interactivity.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen.
- Do not add sorting UI, pagination, bulk selection checkboxes, a status column, an author column or a last-updated column. None are in the design.
- Do not create any Supabase client or Server Action in this prompt.
- Test the table with the longest title in the fixture and with an empty result set before finishing.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

@"/c:/Users/PC/Desktop/story-app-dashboad/material/1.png"
