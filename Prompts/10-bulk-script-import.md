# 10-bulk-script-import

Read AGENTS.md first and follow it strictly.

Implement the Bulk Script Import screen. **There is no design frame for this screen** — build it from the specification below, using the design system tokens, type utilities, card patterns and table patterns already established on the Books, Book editor, Settings and Uploads screens. Visual consistency with those screens is the fidelity target.

Route: `app/(dashboard)/uploads/bulk-import/page.tsx`, replacing the placeholder from the previous prompt.

Use `data/mock-catalog.ts` for the target book options and `lib/catalog.ts` for word counts. All parsing in this prompt happens client-side on the selected files; nothing is uploaded and no records are created.

This screen exists because seeding a serial one chapter at a time is not viable. A real NovelNow serial runs 85 to 148 chapters. The whole design goal is one operator, one drop, one confirm.

## Header

Breadcrumb `Uploads / Bulk script import` — `Uploads` is a link, single separator. Page title `Bulk script import` at 24px / 600, with a 12px `muted` sub-line reading `Match a folder of manuscript files to chapters by filename.`

Ember `Import <n> chapters` button right-aligned on the title row — the single primary button on this screen. Its label carries the live count of rows currently set to import. It is disabled until a target book is selected and at least one row will import.

## Step 1 · Target book card

Card heading `Target book` with a 12px `muted` sub-line reading `Chapters are created under this book.`

A select listing books from the fixture, showing title and current chapter count, e.g. `The Alpha King's Ugly Bride — 12 chapters`. No default selection; the placeholder reads `Choose a book`.

Beneath it, a 12px `muted` helper line reading `New chapters continue from the highest existing chapter number.`

## Step 2 · Drop files card

Card heading `Manuscript files` with a 12px `muted` sub-line reading `Drop a folder of .txt, .docx or .md files — chapters are matched by filename.`

A dashed `border` dropzone occupying the full card width at roughly 160px tall, containing a document icon, a short instruction, a `Choose files` muted outline action, and a 12px `muted` constraint line listing accepted script formats from `data/settings-defaults.ts`.

The dropzone accepts a folder drop and a multi-file selection. Files whose extension is not in the accepted list are rejected at selection with a toast naming the count rejected, and never enter the preview.

The dropzone stays visible after files are added, so more can be appended, and shows a muted `Remove all` link on the card header row once the preview is populated.

## Step 3 · Matching preview table

Appears only once files are selected. Card heading `Matching preview` with a 12px `muted` sub-line reading `Review every row before importing. Nothing is created until you confirm.`

A table composed from the shadcn `<Table />` primitive plus TanStack Table. Columns:

1. **IMPORT** — a checkbox per row, checked by default for rows with no blocking conflict, unchecked and disabled for blocked rows. A header checkbox toggles all eligible rows.
2. **FILE** — the source file name in mono at 13px, not truncated.
3. **CHAPTER #** — an editable number input, prefilled from the parsed filename. Narrow, mono.
4. **TITLE** — an editable text input, prefilled from the parsed filename.
5. **WORDS** — the parsed word count in mono via `countWords`, with a `status-ok` check. Renders `—` in `muted` when the file could not be parsed.
6. **STATUS** — a labelled status pill, described below.

Both editable columns are per-row overrides. Editing a number or title re-evaluates that row's status immediately, including conflict detection against every other row and against the target book's existing chapters.

### Filename parsing

Derive chapter number and title from the file name, handling the patterns operators actually produce:

- `ch12_rejection.docx` → 12, `Rejection`
- `chapter-12-the-rejection.txt` → 12, `The Rejection`
- `12 - The Rejection.docx` → 12, `The Rejection`
- `012_the_rejection.md` → 12, `The Rejection`
- `The Rejection.txt` → no number, title `The Rejection`

Titles derive by replacing separators with spaces and applying title case. Keep the parser in one pure function in `lib/bulk-import.ts` with the patterns above as its stated contract.

### Row status

| Status             | Pill          | Condition                                                |
| ------------------ | ------------- | -------------------------------------------------------- |
| `New chapter`      | `status-ok`   | Number is free, both fields valid                        |
| `Replaces script`  | `status-warn` | Number already exists on the target book                 |
| `No number found`  | `status-warn` | Parser found no chapter number; operator must supply one |
| `Duplicate number` | `destructive` | Two or more rows in this batch claim the same number     |
| `Unreadable file`  | `destructive` | Parsing failed or produced empty text                    |

`Duplicate number` and `Unreadable file` are blocking — those rows cannot be checked for import until resolved. `No number found` blocks until a number is entered. `Replaces script` is permitted but must be deliberate, so those rows start **unchecked** even though they are eligible.

Order rows by parsed chapter number ascending, with unnumbered rows first so they demand attention.

Virtualise the table. A 148-file drop must scroll without stalling.

## Summary bar

Between the preview table and the page bottom, a divided card footer showing a computed summary in 12px text: `<n> new · <n> replacing · <n> blocked · <n> excluded`, with segments omitted at zero and blocked counts rendered in `destructive`.

Beside it, a muted line stating the destination: `Importing into <book title>, chapters <lowest>–<highest>.`

## Confirm behavior

`Import <n> chapters` opens a confirmation dialog listing the same summary counts, naming the target book, and stating plainly that rows marked `Replaces script` will overwrite existing chapter text. Confirm requires an explicit click; no type-to-confirm needed here since the action is additive and reversible per chapter.

On confirm in this prompt: close the dialog, show a success toast naming the count, and clear the preview. Create nothing. Real batch creation lands in a later prompt.

## States

- **No book selected** — steps 2 and 3 are visible but the dropzone is disabled with a muted line reading `Choose a target book first.`
- **No files yet** — the preview card is absent entirely, not an empty table.
- **Parsing** — while reading files, skeleton rows matching the preview structure, with a muted `Reading <n> files…` line.
- **All rows blocked** — the primary button stays disabled, and a `destructive` line above it states how many rows need attention.
- **Partial parse failure** — unreadable rows appear in the table with the `Unreadable file` pill rather than being silently dropped. An operator must see every file they dropped.

## Constraints

- Server Component for the page shell. The entire import workflow is a Client Component — file reading, parsing and preview state are browser-side.
- Keep the parser and the conflict evaluator as pure functions in `lib/bulk-import.ts`. No React, no JSX.
- Read `.txt` and `.md` with the File API. For `.docx`, extract text with a library — recommend `mammoth` and **ask before installing it**, per AGENTS.md. Until approved, mark `.docx` rows as `Unreadable file` with the message `.docx parsing not yet enabled` rather than faking a word count.
- Preview state lives in local component state. It is ephemeral and does not belong in a global store.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen.
- Do not add an audio-matching path, a cover-matching path, a CSV or JSON manifest importer, a ZIP uploader, a scheduling field or a dry-run export. None are in scope.
- Do not create any Supabase client, Server Action or storage call in this prompt.
- Test with a simulated 148-file batch for scroll performance, with a batch containing two files claiming the same number, with a file whose name carries no number, and with a batch targeting a book that already has chapters at those numbers.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
