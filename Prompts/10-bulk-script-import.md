# 10-bulk-script-import

Read AGENTS.md first and follow it strictly.

**Rewritten 2026-09-17, against the real codebase.** The original was written for a
mock-data, pre-Supabase app: it specified `data/mock-catalog.ts` (deleted in prompt 13), a
`/uploads/bulk-import` route under an upload-queue screen that was never built, forbade
creating any Supabase client or Server Action, and told the implementer to mark `.docx` rows
unreadable pending approval of `mammoth` — which was approved and shipped in prompt 17.
Roughly three-quarters of its constraints no longer described this app. What survives is the
part that was always the point: **one operator, one drop, one confirm**, for an 85–148
chapter serial.

Because prompts 13–17 landed the whole single-file script pipeline, this prompt now builds
the screen **and** makes it do real work. Prompt 18 (`18-bulk-import-wiring`) is therefore
absorbed here and should be marked superseded — it was a wiring prompt for a screen that did
not exist, and splitting the work across two prompts would mean shipping a preview table that
lies about being able to import.

## Route and entry point

`app/(dashboard)/books/[bookId]/import/page.tsx`.

**Not `/uploads/bulk-import`.** There is no `/uploads` screen and prompt 09 never landed.
More importantly, mounting under the book makes the target book a route parameter rather than
a form field, which deletes the original's entire "Step 1 · Target book card", its
`Choose a target book first` disabled state, and the class of error where an operator imports
148 chapters into the wrong serial.

Entry point: an `Import chapters` outline button beside `Add chapter` in the Chapters card
header (`components/books/chapters-table.tsx`), and in that card's empty state, whose copy
already reads *"Add a chapter or import a folder of scripts to get started"* — a promise the
app has not been able to keep.

Server Component shell; the workflow is a Client Component. Read the book with `getBook` and
existing chapters with `getChaptersList` (never `getChapters` — this screen needs numbers and
presence, never prose). Both already handle their own failure states via `QueryErrorCard`;
follow the pattern in `books/[bookId]/page.tsx` exactly, including the distinct
`book === null` "not found" branch.

## Reuse, do not duplicate

The extraction and normalisation pipeline already exists and is already the boundary:

- `lib/script-normalise.ts` — `normaliseScriptText(raw, {chapterNumber, chapterTitle})` and
  `hasReadableText(text)`. Probed against 22 cases. **Do not write a second normaliser.**
- `lib/docx.ts` — `extractDocxTextFromBuffer(arrayBuffer)` for server-side `.docx`.
- `app/actions/scripts.ts` — `createScriptUploadUrl` already validates format against
  `app_settings.acceptedScriptFormats`, enforces the `scripts` bucket's 5 MB ceiling, maps
  extension → MIME, and mints an immutable `<bookId>/<chapterId>/<uuid><ext>` path.

> Superseded instruction: prompt 18 asked for a new shared `lib/script-text.ts`. Creating it
> now would be the duplication it was trying to prevent — `script-normalise.ts` **is** that
> shared module, and `docx.ts` already exposes both a browser and a server entry point. Import
> them; add nothing.

New, because filename parsing genuinely does not exist yet — `lib/bulk-import.ts`, pure
functions only, no React, no I/O, no Supabase:

- `parseFileName(name)` → `{ number: number | null; title: string }`, contract:

  | Input | Number | Title |
  |---|---|---|
  | `ch12_rejection.docx` | 12 | `Rejection` |
  | `chapter-12-the-rejection.txt` | 12 | `The Rejection` |
  | `12 - The Rejection.docx` | 12 | `The Rejection` |
  | `012_the_rejection.md` | 12 | `The Rejection` |
  | `The Rejection.txt` | `null` | `The Rejection` |

- `evaluateBatch(rows, existingNumbers, highestExisting)` → `BatchRow[]`, assigning exactly
  the statuses in the table below. Unnumbered rows take sequential numbers continuing from
  `highestExisting`. **Deterministic**: same inputs, same output, every time.

`evaluateBatch` is called by the client for the preview **and** by the server during
preflight. The preview and the import must never disagree about a row's status.

## Row status

| Status | Pill | Condition | Blocking |
|---|---|---|---|
| `New chapter` | `status-pill--ok` | Number free, fields valid | no |
| `Replaces script` | `status-pill--warn` | Number exists on this book | no, but starts **unchecked** |
| `No number found` | `status-pill--warn` | Parser found no number | until a number is entered |
| `Duplicate number` | `status-pill--destructive` | Two+ rows claim one number | yes |
| `Unreadable file` | `status-pill--destructive` | Extraction failed or empty | yes |

Order by chapter number ascending, unnumbered rows first so they demand attention.

## The screen

Reuse existing patterns rather than inventing: `PageHeader` with `backLink` to the book,
`card` / `card__header` / `card__header-title` / `card__sub-line`, `table-wrapper`, the
`colgroup` + sticky `TableHeader` structure from `chapters-table.tsx`, and TanStack's
`createColumnHelper` / `useReactTable` / `flexRender`.

**Drop files card** — dashed `border-border` dropzone, a `Choose files` outline action, and a
constraint line listing `acceptedScriptFormats` from `app_settings` (never
`SETTINGS_DEFAULTS` — see prompt 16's threading). Accepts folder drop and multi-select.
Rejected extensions never enter the preview; a toast names how many were rejected. The
dropzone stays visible so more files can be appended.

**Matching preview** — columns IMPORT / FILE / CHAPTER # / TITLE / WORDS / STATUS. CHAPTER #
and TITLE are editable per-row overrides; editing either re-runs `evaluateBatch` immediately,
including conflict detection against the batch and against existing chapters. WORDS uses
`countWords` from `lib/catalog.ts`, rendering `—` muted for unparsed rows.

**Summary bar** — `<n> new · <n> replacing · <n> blocked · <n> excluded`, segments omitted at
zero, blocked counts in `text-destructive`, beside a muted line naming the destination range.

**Confirm** — one ember button, `Import <n> chapters`, carrying the live count, disabled until
at least one row will import. It opens a confirmation dialog restating the counts and stating
plainly that `Replaces script` rows overwrite existing chapter text.

## Server actions — `app/actions/bulk-import.ts`

`requireAdmin()` is the first statement in every one. All writes go through the Clerk-token
client so RLS applies; never import `lib/supabase-admin.ts`.

**`preflightBulkImport({ bookId, rows })`** — confirms the book is visible to this admin,
re-reads current chapter numbers, re-runs `evaluateBatch` server-side, and returns the
authoritative rows plus resolved defaults. If the server's evaluation differs from the
client's preview (another operator added chapters meanwhile), return corrected rows with a
form-level notice — *"The book changed since you dropped these files. Review the updated
statuses before importing."* — and import nothing on that call.

**`createImportTarget({ batchId, bookId, row })`** — one call per importable row, before its
upload.

- `new_chapter`: insert with number, title, `script_text` null, access resolved as
  `number <= freeChaptersAtStart ? "free" : <book default>`. Resolve access the way
  `createChapter` already does — book's `default_chapter_access` first, `app_settings` only as
  fallback. Do not reimplement that chain differently.
- `replaces_script`: resolve the existing chapter id for that number; leave its access and
  title alone.
- Returns `{ chapterId, path, token, contentType }` for an immutable
  `scripts/<bookId>/<chapterId>/<uuid><ext>` path.
- A `23505` on `(book_id, number)` returns a typed `duplicate_number` failure carrying the
  colliding number — never a thrown 500.
- Writes no activity log entry.

**`ingestImportedScript({ batchId, bookId, chapterId, path, fileName, chapterNumber, chapterTitle, previousScriptPath })`**
— one call per row after its upload completes. Downloads the object, extracts via
`extractDocxTextFromBuffer` or `.text()`, normalises via `normaliseScriptText` passing the
row's number and title so a redundant leading heading is stripped, and gates on
`hasReadableText`. On success persists `script_path`, `script_file_name`, `script_text`. For a
replacement, deletes the previous object **after** the row is repointed; a failed delete is
logged and still reports success. On extraction failure it deletes the uploaded object, leaves
the chapter row in place with `script_text` null, and returns a typed failure. Writes no
activity entry and performs no revalidation.

**`finalizeBulkImport({ batchId, bookId, imported, replaced, failed })`** — writes **exactly
one** `activity_log` entry, past tense and specific, naming the book and the counts. Then
revalidates `/books/<bookId>`, `/books`, and `/`. One entry, not one per chapter: a 148-file
import must not flood Recent activity. Per-row actions deliberately skip `revalidatePath`;
this single call is the batch's only cache invalidation.

## Client orchestration

The import runs from the client so each file's body goes browser → storage directly and every
server call stays small. **Do not push 148 files through one Server Action.**

- Generate a `batchId` (uuid) when the dialog is confirmed; pass it to every call.
- Process in ascending chapter number, **3 files in flight at a time**.
- Per row: `createImportTarget` → `PUT` to the signed URL → `ingestImportedScript`.
- Retry transient failures (network, 5xx) twice with short backoff. Never retry typed failures
  (`duplicate_number`, `unreadable_file`, RLS rejection).
- A failed preflight or an RLS rejection aborts the batch with a form-level error. **Per-row
  failures never abort the batch.**
- Call `finalizeBulkImport` once after the last row settles, failures or not.
- Unchecked and blocked rows are never sent.

Per-row progress reuses the STATUS column — no new columns. `Queued` → `Uploading` →
`Reading text` → `Imported` (ok pill) or `Failed` (destructive pill, reason beneath in muted
12px). CHAPTER # and TITLE go read-only once the batch starts.

The summary bar becomes the progress line: `<n> of <total> imported · <n> failed`, with a 6px
bar. Inline style is permitted for the bar width only (see AGENTS.md, Style Exception Rules).
The bar's denominator is fixed before work starts and its numerator moves only when a round
trip has returned — a report, never a prediction (see *Show progress by counting real work*).

When the batch settles, replace the confirm button with a result block in the same card: final
counts, a muted line naming failed files, a `Retry failed` outline button re-running only the
failed rows under a new `batchId`, and an `Open book` primary link. The preview clears only on
leaving the screen or dropping new files — never automatically while failures are on screen.

Guard navigation during an active batch: a `beforeunload` handler while any row is in flight.

## Partial success is the expected outcome

A row whose chapter is created but whose extraction fails leaves a real chapter with no
script. **That is intended and must not be rolled back.** The chapter appears in the Dashboard
Needs attention queue and is fixable in the Chapter editor. Say so in the failure copy —
*"Chapter created, text not imported. Fix in the chapter editor."* No batch-wide rollback, no
deleting created chapters.

## Constraints

- **Install nothing.** In particular, do not add `@tanstack/react-virtual`. The original
  prompt required virtualising the table; that library is not installed and AGENTS.md forbids
  installing without asking. Cap a batch at **150 files** instead and render all rows — at that
  cap an unvirtualised table scrolls acceptably. Over the cap, reject the selection with a
  toast naming the cap and import nothing. Raise the cap only alongside real virtualisation.
- **Additive only.** Do not modify the cover, narration or single-script upload paths, the
  Book editor form, the Chapter editor, the Dashboard or Settings. The one permitted edit to
  existing code is adding the `Import chapters` entry point to the Chapters card.
- Never set `x-upsert`. Every script object goes to a fresh immutable path.
- No schema changes, no new columns, no batch or import tables.
- No background jobs, queues, cron, Edge Functions or webhooks.
- Do not store word counts; they stay computed at render.
- No ZIP, CSV or JSON manifest import, no scheduling, no dry-run, no chapter reordering, no
  audio or cover matching.
- Strict TypeScript. Row and result types are discriminated unions; no `any`.

## States

- **No files yet** — preview card absent entirely, not an empty table
- **Parsing** — skeleton rows, muted `Reading <n> files…`
- **Preflight running** — confirm button pending, table read-only
- **Preflight corrected the batch** — form-level notice, statuses updated, import not started
- **Importing** — per-row states, progress line, navigation guarded
- **All imported** — ok summary, `Open book`
- **Partial** — counts plus failed list, `Retry failed` and `Open book`
- **All failed** — destructive summary, `Retry failed`, no chapters lost
- **Aborted** — form-level error, nothing imported beyond rows already settled
- **All rows blocked** — primary disabled, destructive line stating how many need attention

## Verification

1. `npm run typecheck`, `npm run lint` (expect exactly the 4 known pre-existing RHF/TanStack
   warnings), `npm run build`.
2. Probe `parseFileName` and `evaluateBatch` directly against the contract table above,
   including the duplicate and unnumbered cases, before trusting the UI. Pure functions with
   offset and regex logic typecheck cleanly while being wrong (see AGENTS.md on
   `lib/script-markup.ts`).
3. Drop a mixed `.txt`/`.docx` batch into a book with existing chapters. Confirm numbering
   continues from the highest existing number, the batch completes, and the book lists every
   chapter in order with correct word counts.
4. Include two files claiming the same number — both blocked in the preview, neither reaches
   the server.
5. Include one file matching an existing chapter. Leave it unchecked, import, confirm the
   existing script is untouched. Then check it, re-import, confirm the text is replaced and the
   old storage object is gone.
6. Include a deliberately corrupt `.docx`. Confirm the chapter row exists, `script_text` is
   null, the row reads Failed with the recoverable message, and the chapter appears in
   Dashboard Needs attention.
7. Confirm exactly **one** `activity_log` row for the batch, and that `/books`, the book
   editor and the Dashboard all reflect the new chapters without a manual refresh.
8. Confirm the `scripts` bucket holds one object per imported chapter and no orphans from
   failed rows.

## Reference

- mammoth.js: https://github.com/mwilliamson/mammoth.js
- Supabase signed uploads: https://supabase.com/docs/guides/storage/uploads/standard-uploads
