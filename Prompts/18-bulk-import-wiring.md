# 18-bulk-import-wiring

Read AGENTS.md first and follow it strictly.

Study the existing Bulk script import screen (`app/(dashboard)/uploads/bulk-import/page.tsx`),
the pure parser in `lib/bulk-import.ts`, and the single-file script pipeline built in
`17-script-upload-and-parse`. Make the Import button do real work.

Keep the screen's UI and layout exactly as built: target book select, dropzone,
matching preview table (IMPORT / FILE / CHAPTER # / TITLE / WORDS / STATUS), summary bar,
confirm dialog. Ask before changing any structure. The only additions permitted are the
per-row progress states and the batch result block described below.

## Reuse, do not duplicate

Extract the text-extraction and normalisation logic added in prompt 17 into a single shared
module — `lib/script-text.ts` — exporting:

- `extractScriptText(buffer: ArrayBuffer, fileName: string): Promise<string>`
  - `.docx` via `mammoth`, `.txt` and `.md` read as UTF-8
  - normalisation identical to prompt 17: LF line endings, collapse runs of more than two
    blank lines, trim trailing whitespace per line, preserve single blank lines as paragraph
    breaks, strip a redundant leading heading line that duplicates the chapter title, keep
    smart quotes and em dashes
  - throws a typed error for unreadable or empty extraction

Refactor the single-chapter script action to call this module. Both paths must produce
byte-identical text for the same input file. Do not leave two copies of the normaliser.

Extend `lib/bulk-import.ts` with one more pure function (no React, no I/O):

- `evaluateBatch(parsed: ParsedFile[], existingNumbers: number[], highestExisting: number): BatchRow[]`
  - assigns statuses `new_chapter`, `replaces_script`, `no_number`, `duplicate_number`,
    `unreadable_file` using exactly the rules from prompt 10
  - unnumbered files are assigned sequential numbers continuing from `highestExisting`
  - deterministic: same inputs always produce the same output

The client and the server must both call `evaluateBatch`. The preview and the import must
never disagree about a row's status.

## Server actions

Create `app/actions/bulk-import.ts` with three actions. Every action calls `requireAdmin()`
first and validates its input against a schema before touching Supabase.

**1. `preflightBulkImport({ bookId, rows })`**

- confirms the book exists and is visible to this admin
- re-reads the book's current chapter numbers from the database
- re-runs `evaluateBatch` server-side against those fresh numbers
- returns the authoritative row list plus the resolved import defaults read from
  `app_settings` (`default_chapter_access`, `free_chapters_at_start`)
- if the server-side evaluation differs from the client's preview (another operator added
  chapters since the files were dropped), return the corrected rows and have the client
  re-render the table with a form-level notice: "The book changed since you dropped these
  files. Review the updated statuses before importing." Do not import on that call.

**2. `createImportTarget({ batchId, bookId, row })`**

Called once per importable row, before the file is uploaded.

- for `new_chapter`: insert the chapter row with number, title, `script_text` null, and
  access resolved as `number <= free_chapters_at_start ? 'free' : default_chapter_access`
- for `replaces_script`: resolve the existing chapter id for that number; do not touch its
  access or title
- returns `{ chapterId, uploadUrl, uploadPath, token }` where the signed upload URL targets
  an immutable path `scripts/<bookId>/<chapterId>/<uuid>.<ext>`
- a unique-constraint violation on `(book_id, number)` returns a typed
  `duplicate_number` failure carrying the colliding number — never a thrown 500
- writes no activity log entry

**3. `ingestImportedScript({ batchId, bookId, chapterId, uploadPath, fileName, previousScriptPath })`**

Called once per row after the browser upload completes.

- downloads the uploaded object server-side, runs `extractScriptText`
- on success: persists `script_path`, `script_file_name`, `script_text` on the chapter row
- for a replacement, deletes `previousScriptPath` after the row is repointed; if the delete
  fails, log it and still report success
- on extraction failure: leaves the chapter row in place with `script_text` null, deletes the
  uploaded object, and returns a typed failure with the reason
- writes no activity log entry and performs no revalidation

**4. `finalizeBulkImport({ batchId, bookId, imported, replaced, failed })`**

- writes exactly one `activity_log` entry, past tense and specific, naming the book and the
  counts — e.g. "Imported 85 chapters into The Alpha King's Ugly Bride (3 replaced, 1 failed)"
- revalidates `/books/<bookId>`, `/books`, `/uploads`, and `/`
- returns nothing beyond success

One summary entry, not one per chapter. A 148-file import must not flood the Recent activity
card. Per-row actions deliberately skip `revalidatePath`; the single finalize call is the only
cache invalidation for the batch.

## Client orchestration

The import runs from the client component so each file's body goes browser to storage
directly and each server call stays small. Do not attempt to push 148 files through one
server action.

- generate a `batchId` (uuid) when the confirm dialog is accepted; pass it to every call so a
  retry of the same batch is traceable in logs
- process rows in ascending chapter number, with a concurrency limit of 3 in-flight files
- per row: `createImportTarget` → upload to the signed URL → `ingestImportedScript`
- retry transient failures (network error, 5xx) up to twice with a short backoff; do not
  retry typed failures (`duplicate_number`, `unreadable_file`, RLS rejection)
- an RLS rejection or a failed `preflightBulkImport` aborts the whole batch immediately with
  a form-level error; per-row failures never abort the batch
- call `finalizeBulkImport` once, after the last row settles, whether or not some rows failed
- files whose IMPORT checkbox is unchecked, and any blocked row, are never sent

Per-row progress reuses the existing STATUS column — no new columns. Replace the static pill
with the live state for that row: `Queued`, `Uploading`, `Reading text`, `Imported` (ok pill),
`Failed` (destructive pill with the reason text beneath, muted 12px). The CHAPTER # and TITLE
inputs become read-only once the batch starts.

The summary bar becomes the batch progress line while importing:
"<n> of <total> imported · <n> failed", with a 6px progress bar using the primary fill.
Inline style is permitted for the bar width only.

When the batch settles, replace the confirm button with a result block inside the same card:
the final counts, a muted line naming any failed files, a muted outline `Retry failed` button
that re-runs only the failed rows under a new `batchId`, and a primary `Open book` link to
`/books/<bookId>`. The preview clears only when the operator leaves the screen or drops new
files — never automatically while failures are still on screen.

Guard against navigation during an active batch: a `beforeunload` handler while any row is
in flight, and a confirmation dialog on in-app navigation away from the screen.

## Partial success is the expected outcome

A row that gets its chapter created but fails extraction leaves a real chapter with no script.
That is intended and must not be rolled back: the chapter appears in the Dashboard
Needs attention queue and is fixable in the Chapter editor. Say so in the failure copy —
"Chapter created, text not imported. Fix in the chapter editor." Do not delete created
chapters on extraction failure and do not attempt a batch-wide rollback.

## Overrides

- The dropzone's `.docx` fallback message from prompt 10 is removed; `.docx` is handled by
  `mammoth` as approved in prompt 17. If that approval was not given, stop and ask before
  writing any `.docx` path.
- Cap a single batch at 300 files. Over the cap, reject the selection with a toast naming the
  cap and import nothing.
- Bulk import progress stays on this screen. It does not feed the Active uploads card on
  `/uploads`; that card remains narration-only.

## Constraints

- `requireAdmin()` is the first statement in every action in this file.
- Install nothing. `mammoth` is the only library this feature needs and it was already
  approved.
- Never set `x-upsert`. Every script object goes to a fresh immutable path.
- Never import `lib/supabase-admin.ts` from these actions; all writes go through the
  Clerk-token client so RLS applies.
- No background jobs, no queue table, no cron, no Edge Function, no webhooks.
- No schema changes. No new columns, no batch/import tables.
- Do not store word counts; they stay computed at render.
- Do not touch the cover upload path, the narration upload path, the Book editor, the Chapter
  editor, the Dashboard, or Settings.
- Do not add ZIP support, CSV or JSON import, scheduling, dry-run mode, or chapter reordering.
- Strict TypeScript. Row and action result types are discriminated unions; no `any`.

## States

- **Preflight running** — confirm button shows a pending label, table read-only
- **Preflight corrected the batch** — form-level notice, import not started, statuses updated
- **Importing** — per-row states, progress line, navigation guarded
- **All imported** — ok summary, `Open book`
- **Partial** — counts plus failed file list, `Retry failed` and `Open book`
- **All failed** — destructive summary, `Retry failed`, no chapters lost
- **Aborted (RLS or preflight failure)** — form-level error, nothing imported beyond rows that
  already settled

## Verification

1. Drop a real batch of 148 mixed `.txt` and `.docx` files into a book with 12 existing
   chapters. Confirm numbering continues from 13 for unnumbered files, that the batch
   completes, and that the book editor lists all chapters in order with correct word counts.
2. Include two files that map to the same chapter number. Confirm both are blocked in the
   preview and neither reaches the server.
3. Include one file that maps to an existing chapter. Leave it unchecked, import, confirm the
   existing script is untouched. Then check it, re-import, and confirm the text is replaced
   and the old storage object is gone.
4. Include one deliberately corrupt `.docx`. Confirm the chapter row exists, `script_text` is
   null, the row reads Failed with the recoverable message, and the chapter shows up in
   Dashboard Needs attention.
5. Kill the network mid-batch. Confirm in-flight rows fail with a retryable message, the batch
   finalises, and `Retry failed` completes the import without duplicating chapters.
6. Add a chapter from a second browser tab between dropping files and confirming. Confirm
   preflight corrects the statuses and blocks the stale import.
7. Confirm exactly one `activity_log` row exists for the batch and that `/books`, the book
   editor, and the Dashboard tiles all reflect the new chapters without a manual refresh.
8. Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

## Reference

- Supabase resumable uploads (for the contrast — scripts use plain signed uploads, not TUS):
  https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- mammoth.js: https://github.com/mwilliamson/mammoth.js
