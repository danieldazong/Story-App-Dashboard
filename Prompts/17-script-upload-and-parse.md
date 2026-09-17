# 17-script-upload-and-parse

Read AGENTS.md first and follow it strictly.

Study the Chapter script card on the Chapter editor and the `+ Upload text` buttons on the Book editor chapters table, then implement real script file upload, server-side text extraction and persistence.

**Keep the existing UI exactly as it is.** The Chapter script card's single-card structure — file row, divider, formatting toolbar, editable prose area, footer word count — stays. The `Replace file`, `Remove` and `Choose file` affordances stay. Do not change any screen design. If the flow needs a UI change, ask me before implementing.

Scripts only in this prompt. Bulk import creation is prompt 18.

## Library approval required

`.docx` extraction needs a parser. **Recommend and ask before installing `mammoth`.** It converts Word documents to plain text or simple HTML, runs server-side in Node, and has no UI surface — which is what this needs, since the extracted text lands in a plain textarea and never renders as markup.

`.txt` and `.md` need no library and are read directly.

Do not install anything until approved. State the recommendation, then stop. Until approved, `.docx` selection shows a specific message — `.docx parsing not yet enabled` — rather than a generic failure or a faked word count.

## Two-part flow

A script upload does two distinct things, and they must not be conflated:

1. **The original file** goes to the `scripts` bucket, preserved as the source of record. Operators need to re-extract or audit against the manuscript they were sent.
2. **The extracted text** goes into `chapters.script_text`, which is what the mobile reader actually serves.

Both are persisted. Neither substitutes for the other.

## Upload path

Scripts are small — a 5,000-word chapter is a few tens of kilobytes. A standard direct-to-storage upload is correct; no resumable protocol and no upload library.

Authorise with a signed upload URL from a Server Action that calls `requireAdmin()`, validates the target chapter id, file name, size and extension against the accepted script formats in `app_settings`, and returns the URL plus its authorised path.

Paths are immutable: `scripts/<bookId>/<chapterId>/<uuid>.<ext>`. Never set `x-upsert`.

## Extraction happens server-side

The browser uploads the file to storage, then calls a Server Action that downloads the object server-side, extracts its text, normalises it, and persists the result.

Extraction must not run in the browser. `mammoth` in a client bundle would ship a Word parser to every page load, and the extracted text needs validating before it reaches the database regardless.

### Normalisation

The extracted text is prose destined for a reader, so clean it once at ingestion rather than papering over it at render time:

- Normalise line endings to `\n`
- Collapse three or more consecutive blank lines to one blank line
- Trim trailing whitespace from every line
- Preserve paragraph breaks as single blank lines
- Strip a leading chapter heading line when it merely repeats the chapter number or title, since the reader renders its own heading
- Convert Word's smart quotes and em dashes through unchanged — they are correct for prose and must not be flattened to ASCII

Reject an extraction that produces empty or whitespace-only text with the message `No readable text found in this file.` and do not persist it. An empty `script_text` must mean "no script", not "a script that failed to parse".

## Persistence

On successful extraction, a Server Action persists `script_path`, `script_file_name` and `script_text` on the chapter row, writes an `activity_log` entry in the existing register, and revalidates `/books/<id>/chapters/<n>`, `/books/<id>`, `/books` and `/`.

The Books list `Chapters` ratio and the Dashboard queue both derive from `script_text` presence, so both must update without a manual refresh.

Word count is **never persisted**. It continues to compute from `script_text` via `countWords` at render time, exactly as it does now.

## Editing after upload

The prose area remains fully editable after an upload. An operator can fix an extraction artefact inline and press `Save chapter`, which persists the edited `script_text` through `updateChapter` from prompt 14 — no new action needed.

Editing the text does **not** change `script_path` or `script_file_name`. The original file stays as uploaded, which is the point of keeping it. The card continues to show the source file name alongside edited text, and that is correct rather than inconsistent.

## Replace and remove

`Replace file` uploads to a new path, extracts, repoints the row, then deletes the previous object. Upload new, repoint, delete old — a failed delete leaves an orphan to log; deleting first risks a chapter with no script.

`Replace file` **overwrites `script_text`**, discarding inline edits. Because that destroys work, it opens a confirmation dialog warning that the current text will be replaced by the new file's contents. This is the only script action that needs confirmation.

`Remove` confirms, nulls `script_path`, `script_file_name` and `script_text`, deletes the object, logs activity, and revalidates the same four routes. The card returns to its empty state and the chapter reappears in the Dashboard queue.

## Book editor row buttons

The `+ Upload text` buttons in the chapters table currently navigate to the Chapter editor. Keep that behaviour — do not build a second inline upload path from the table. AGENTS.md lists duplicate upload paths as a known defect, and the Chapter editor is where an operator needs to see the extracted text anyway.

## States

- **Idle, no script** — existing empty file row and empty editor.
- **Idle, script present** — existing ready state, file name from the row, prose in the editor, live word count.
- **Uploading** — determinate progress in the file row, `Replace file` and `Remove` disabled.
- **Extracting** — a muted `Extracting text…` state between upload completion and row write, so the card never looks finished before text exists.
- **Failed** — a `destructive` message in the file row with a `Retry` action, distinguishing: unsupported extension, oversize file, `.docx` parsing not enabled, no readable text found, expired signed URL, and network failure. No generic failure message.
- **Replacing** — pending state on the confirmation dialog's confirm action.

## Constraints

- Ask before installing `mammoth`. Install nothing else.
- The file body goes browser-to-storage. Extraction downloads it server-side; it does not receive it from the client.
- `requireAdmin()` first in every Server Action here.
- Never set `x-upsert`. Never append a cache-busting query string.
- The prose area stays a plain controlled textarea. Do not introduce a rich-text editor, `contenteditable`, or `dangerouslySetInnerHTML`. The four toolbar actions stay simple text transformations.
- If `mammoth` is used, extract to **plain text**, not HTML. No markup reaches the database.
- Do not add spellcheck, grammar checking, readability scoring, translation, AI cleanup, chapter splitting or a diff view against the original file. Out of scope.
- Do not persist word count, read time or any derived value.
- Do not touch the cover or audio upload paths.
- Do not modify the schema.

## Verification

Upload a real `.docx` chapter and confirm the extracted prose renders with paragraph breaks intact, smart quotes preserved, the word count computed live, and the Books list ratio and Dashboard queue both updating without a refresh. Edit the text inline, save, and confirm the file name is unchanged while the text persists. Replace the file and confirm the dialog warns about losing edits, the old object is deleted, and the new text appears. Upload a `.txt` and confirm it needs no parser. Upload an empty file and confirm it is rejected without persisting an empty script.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

---

(Here paste the mammoth documentation if approved: https://github.com/mwilliamson/mammoth.js)
