# 05-book-editor

Read AGENTS.md first and follow it strictly.

Implement the Book editor screen exactly as shown in the attached design. Use the mock catalog from `data/mock-catalog.ts`, the genre and maturity options from `data/genres.ts` and `data/maturity-levels.ts`, and the existing design system utilities.

Route: `app/(dashboard)/books/[bookId]/page.tsx`, replacing the placeholder from the previous prompt.

## Header

Breadcrumb `Books / <book title>` — `Books` is a link, the title is not, single separator.

Page title is the book title at 24px / 600. Ember `Save` button right-aligned on the title row. This is the single primary button on the screen. It validates and shows a success toast via `sonner`, but performs no persistence in this prompt.

## Layout

Two-column layout at a 2:1 ratio with 24px gap. Left column holds **Book details**. Right column holds **Cover thumbnail**. Beneath both, spanning the full container width, the **Chapters** card.

## Book details card

Card heading `Book details`. Every field is a field group — label above, control, helper line beneath in 12px `muted`. Use `react-hook-form` with the shadcn form primitives and a schema validator.

| Field             | Control                             | Helper line                                     |
| ----------------- | ----------------------------------- | ----------------------------------------------- |
| Title             | text input                          | `The public title shown across reader clients.` |
| Author            | text input                          | `Author pen name.`                              |
| Short description | textarea, 2 rows                    | `Shown on cards and in search`                  |
| Synopsis          | textarea, 5 rows                    | `Shown on the story detail page`                |
| Genres            | multi-select of removable tag chips | `Select relevant genres and tropes`             |
| Maturity          | segmented control                   | `Age verification requirement`                  |
| Status            | select                              | `Publication visibility`                        |

Short description shows a live `58 / 160` counter right-aligned on the label row, and hard-limits at 160 characters. Synopsis does the same at `600`. Both counters read from current value length, never from a stored number.

Genres render as chips with an `×` remove affordance inside the input-styled container, with options sourced from `data/genres.ts`.

Maturity offers `General` and `Mature 17+`, sourced from `data/maturity-levels.ts`. Status offers `Draft` and `Published`.

## Cover thumbnail card

Card heading `Cover thumbnail`.

When a cover is ready: the image at a 2:3 ratio inside a dashed `border` frame, then a mono line reading file name `·` formatted size, then `Replace` and `Remove` links side by side — `Replace` in `muted`, `Remove` in `destructive`. Beneath, a 12px `muted` constraint line reading `JPG or WebP · 800×1200 · max 2MB`.

When a cover is missing: the same dashed 2:3 frame as an empty dropzone with a short muted instruction and a `Choose file` action, with the same constraint line beneath.

Neither link nor the dropzone uploads anything in this prompt. `Replace` and `Choose file` open a file picker and update local preview state only. Real upload lands in a later prompt.

## Chapters card

Card heading `Chapters` on the left. On the same header row, right-aligned, two buttons: a muted outline `Upload scripts in bulk` with a leading icon, then an outline `+ Add chapter`. Beneath the header row, right-aligned under those buttons, a 12px `muted` helper line reading exactly:

`Drop a folder of .txt or .docx files — chapters are matched by filename.`

Then the chapters table, composed from the shadcn `<Table />` primitive plus TanStack Table. Columns:

1. **#** — chapter number, mono, zero-padded to two digits.
2. **TITLE** — chapter title in `text`. Not truncated.
3. **TEXT** — when script is ready, mono word count followed by a `status-ok` check. When missing, a compact muted outline button `+ Upload text`.
4. **AUDIO** — when audio is ready, mono `mm:ss` duration followed by a `status-ok` check. When missing, a compact muted outline button `+ Upload audio`.
5. **ACCESS** — a labelled status pill reading `Free` or `Locked`.
6. **Actions** — an overflow (`⋯`) menu, then a trailing `>` chevron in `muted`.

Word counts come from `countWords`, durations from `formatDuration`, both in `lib/catalog.ts`. Nothing is read off the frame.

### Actionable rows

Per AGENTS.md, a missing asset is a task and not a label. A row never shows a static `Missing` string with no affordance.

The whole row is clickable and opens the Chapter editor at `/books/<bookId>/chapters/<number>`, with a pointer cursor and a hover highlight, signalled by the trailing chevron. The `+ Upload text` and `+ Upload audio` buttons and the `⋯` menu stop propagation so they do not trigger row navigation. In this prompt the upload buttons navigate to the Chapter editor rather than opening a picker inline; the bulk and direct upload paths land in later prompts.

The overflow menu holds `Open`, `Set free`/`Set locked` as a toggle reflecting current access, and a `destructive` `Delete chapter`. Only `Open` acts; the rest render disabled.

The `⋯` menu must sit **inside the card bounds, unclipped**, with the menu opening left-aligned to its trigger.

Long chapter lists are virtualised — Book B in the fixture has 40 chapters and later real serials run past 140.

Create a minimal placeholder at `app/(dashboard)/books/[bookId]/chapters/[chapterNumber]/page.tsx` rendering only the correct breadcrumb and title, so navigation does not 404. The next prompt replaces it.

`Add chapter` and `Upload scripts in bulk` are rendered and wired to navigate — `Upload scripts in bulk` to `/uploads`, `Add chapter` to the Chapter editor route for the next unused chapter number. Neither creates a record in this prompt.

## New book mode

`app/(dashboard)/books/new/page.tsx` reuses the same Book details and Cover cards with empty values, breadcrumb `Books / New book`, title `New book`. The Chapters card is hidden entirely — a book with no id has no chapters. `Save` validates and toasts only.

## States

- **Loading** — skeletons shaped like the two cards and the chapters table, not a spinner.
- **Unknown book id** — a card with a short heading, one muted line, and a `Back to books` action. Do not throw.
- **No chapters yet** — inside the Chapters card, a short heading, one muted explanatory line, and the `Add chapter` and `Upload scripts in bulk` actions.
- **Unsaved changes** — `Save` is disabled until the form is dirty and valid, and shows inline field errors on invalid submit.

## Overrides — deviate from the attached design here

- The frame shows a **three-item sidebar with no Dashboard**. Stale. The four-item shell is correct — do not touch it.
- The frame's Maturity segmented control must show `Mature 17+` as the **dark-filled selected** option and `General` as white with a `border` border. Selected is always the filled one. The same applies to the Access pills — verify the filled state tracks the actual value, not a fixed position.
- The frame **clips the chapters table's trailing overflow column**. The table must fit inside the card with the `⋯` and chevron fully visible.
- All content in the frame is placeholder — the title, author, `Seraphina Shaw`, the synopsis prose, chapter titles, `1,842 words`, `09:14`, `42.3MB`, the `58 / 160` and `348 / 600` counter values, and the cover file name. Every one of them resolves from `data/mock-catalog.ts` or is computed. Hardcode none of it.
- The frame shows eight chapter rows. Render every chapter in the fixture, not eight.

## Constraints

- Server Component for the page and the data read. Client Components for the form, the cover card and the chapters table.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen — `Save`. `Add chapter` and `Upload scripts in bulk` are outline and muted outline respectively.
- Validate the form with a schema. Do not trust field state.
- Do not create any Supabase client, Server Action or upload logic in this prompt.
- Do not add an author combobox, a language field, a series field, a tags field, publishing timestamps, a visibility toggle or a read-only ID row. None are in the design.
- Test with Book C from the fixture — draft, no cover, every chapter missing both assets — and with Book B's 40 chapters, before finishing.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

@"/c:/Users/PC/Desktop/story-app-dashboad/material/2.png"
