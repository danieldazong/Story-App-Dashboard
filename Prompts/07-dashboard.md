# 07-dashboard

Read AGENTS.md first and follow it strictly.

Implement the Dashboard work queue screen exactly as shown in the attached design. Use the mock catalog from `data/mock-catalog.ts`, the activity fixture from `data/mock-activity.ts`, and the helpers in `lib/catalog.ts`.

Route: `app/(dashboard)/page.tsx`, replacing the placeholder from the app shell prompt.

This screen is a work queue, not an analytics product. Its only job is to answer "what needs finishing" and put the operator one click from fixing it.

## Header

Breadcrumb `Dashboard`. Page title `Dashboard` at 24px / 600, with a 12px `muted` sub-line directly beneath reading exactly `What needs finishing.`

Ember `New book` button right-aligned on the title row, navigating to `/books/new`. The single primary button on this screen.

## Stat tiles

Three tiles in a row with a 24px gap, each a plain card: an uppercase section label at the top, then a large numeral beneath at roughly 32px / 600.

| Label           | Value                                          | Color         |
| --------------- | ---------------------------------------------- | ------------- |
| `BOOKS`         | total book count                               | `text`        |
| `CHAPTERS`      | total chapter count across all books           | `text`        |
| `MISSING AUDIO` | count of chapters whose audio state is missing | `status-warn` |

All three are computed at render time from the fixture. Plain tiles only — no sparklines, no trend arrows, no percentage deltas, no comparison-to-last-period, no icons.

## Needs attention card

Card heading `Needs attention`. Inside it, a table composed from the shadcn `<Table />` primitive. Columns:

1. **BOOK** — book title in `text`.
2. **CHAPTER** — `Chapter <nn> · <chapter title>`, chapter number zero-padded to two digits.
3. **WHAT'S MISSING** — `muted` text reading `Script`, `Narration audio`, or `Script and audio`.
4. **ACTION** — a right-aligned muted outline `Open` button.

Rows are produced by `chaptersNeedingAttention` from `lib/catalog.ts`. The missing-asset label maps directly off the returned `MissingAsset` union — `"script"` to `Script`, `"audio"` to `Narration audio`, `"both"` to `Script and audio`.

Order rows by book, then by ascending chapter number, so an operator works a serial top to bottom.

`Open` navigates to `/books/<bookId>/chapters/<number>`. The whole row is also clickable to the same destination, with a pointer cursor and hover highlight; the `Open` button stops propagation.

Card footer, separated by a 1px divider, shows a 12px `muted` line reading the total count — `<n> chapters need attention` — computed, and grammatically singular at one.

Cap the visible rows at ten and, when more exist, render a muted `View all in Books` link in the footer beside the count rather than paginating. The queue is a prompt to act, not a browsable archive.

## Recent activity card

Card heading `Recent activity`. Rows from `data/mock-activity.ts`, each a 1px-divided line with a mono timestamp in a fixed-width left column and the message in `text` beside it.

Timestamps render as `HH:mm` for entries from today. No relative times, no date grouping, no icons, no author attribution — none of it is in the design.

## States

- **Loading** — skeletons shaped like the three tiles, the attention table and the activity rows. Not a spinner.
- **Nothing needs attention** — inside the Needs attention card, a `status-ok` check, a short heading such as `Everything is complete`, one muted line, and no table. The stat tiles still render.
- **No books at all** — the tiles render zeros, the Needs attention card shows a short heading with one muted explanatory line and the `New book` action, and the activity card shows a muted empty line.
- **No activity** — a single muted line inside the activity card.

## Overrides — deviate from the attached design here

- The frame is **cropped at the right edge**, clipping the `New book` button and the `ACTION` column. That is frame cropping, not layout. The container must fit its content with both fully visible inside the 1040px content width.
- All numbers and content in the frame are placeholder — `3`, `148`, `12`, the six attention rows, `12 chapters need attention`, and every activity line. Each is computed from the fixture or read from `data/mock-activity.ts`. Hardcode none of them.
- The frame's attention rows happen to show books whose names match the Books list frame. Ignore the coincidence; rows come from the fixture and will differ.

## Constraints

- Server Component for the page and all data reads. No Client Component is needed on this screen except where a row click handler requires one — keep that scope as small as possible.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen — `New book`. The stat tile numerals are text, not accents; only `MISSING AUDIO` takes `status-warn`.
- **Do not add** charts, graphs, sparklines, trend arrows, percentage deltas, completion rings, bandwidth or storage readouts, upload throughput, session IDs, CDN diagnostics, a date-range picker, or any metric not listed above. Earlier design iterations of this project were full of invented telemetry and all of it was deleted deliberately.
- Do not create any Supabase client or Server Action in this prompt.
- Test with Book C from the fixture, whose six chapters are all missing both assets, and confirm the `MISSING AUDIO` tile and the footer count agree with the table length before finishing.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

@"/c:/Users/PC/Desktop/story-app-dashboad/material/4.png"
