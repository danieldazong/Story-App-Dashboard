# 17-script-upload-and-parse

Read AGENTS.md first and follow it strictly.

Study the Chapter script card on the Chapter editor, then **move** `.docx` extraction server-side and start preserving the original file in the `scripts` bucket.

**Keep the existing UI exactly as it is.** The Chapter script card's structure — file row, divider, formatting toolbar, editor/preview split with its collapse controls, footer word count — stays. The `Replace file`, `Remove` and `Choose file` affordances stay. Do not change any screen design. If the flow needs a UI change, ask before implementing.

Scripts only in this prompt. Bulk import creation is prompt 18.

## What already exists — read this before planning

This prompt was written before prompts 13-16 landed. The following is the state of the codebase now, verified against it:

- **`mammoth@^1.12.3` is already installed and working.** There is no library to approve. `src/lib/docx.ts` wraps `mammoth.extractRawText` behind a dynamic import.
- **Extraction already runs, client-side, in three places:** `chapter-editor-script-card.tsx`, `chapter-script-card.tsx` (the composer's twin) and `manuscript-card.tsx`. This prompt **moves** one of them, it does not add extraction.
- **`script_text` is already persisted** by `createChapter` / `updateChapter` (prompt 14). 38 chapters currently have text.
- **`script_path` has never been populated and the `scripts` bucket is empty.** Preserving the original file is the genuinely new capability here.
- **The editor has a live Markdown preview** (`lib/script-markup.ts`) rendering bold, italic and `## ` headings from parsed data as React elements. Extraction must not break it.

## Scope decisions already made

**The Manuscript card stays client-side. Do not touch it.** It extracts to preview chapter splits *before the book exists*, so there is no chapter id to upload a file against. Moving it would mean inventing a staging path for files that may never be saved. It keeps using `lib/docx.ts`, which therefore stays.

**The composer's `chapter-script-card.tsx` also stays client-side** for the same reason: in create mode there is no chapter row yet. Its extracted text is carried into `createChapter` as `scriptText`, which is correct and already works.

So exactly one call site changes: **the Chapter editor's script card**, which is the only one that has a saved chapter to attach a file to.

## Why move extraction server-side

Not for bundle size — `lib/docx.ts` already dynamic-imports mammoth, so it loads only when a `.docx` is picked.

The real reason is **validation**. §"Normalisation" below requires rejecting an extraction that yields empty or whitespace-only text, and requires normalising before persistence. If the browser decides what `script_text` becomes, neither is enforceable: a client can send anything to `updateChapter`. Extraction server-side makes the normalisation rules a boundary rather than a convention.

## Two-part flow

A script upload does two distinct things, and they must not be conflated:

1. **The original file** goes to the `scripts` bucket, preserved as the source of record. Operators need to re-extract or audit against the manuscript they were sent.
2. **The extracted text** goes into `chapters.script_text`, which is what the mobile reader actually serves.

Both are persisted. Neither substitutes for the other.

### The 38 chapters that have text but no file

They predate this prompt and cannot be back-filled — the originals were never kept. **"Text present, no source file" is a permanent, legitimate state**, not a broken one. The card must render it without implying something is missing or failed: show the text, show `script_file_name` (which those rows do have), and simply offer `Choose file` rather than `Replace file`.

## Upload path

Scripts are small — a 5,000-word chapter is a few tens of kilobytes. A standard direct-to-storage upload is correct; no resumable protocol and no upload library.

Authorise with a signed upload URL from a Server Action that calls `requireAdmin()`, validates the target chapter id, file name, size and extension, and returns the URL plus its authorised path.

Paths are immutable: `<bookId>/<chapterId>/<uuid>.<ext>` within the `scripts` bucket. Never set `x-upsert`.

**The size ceiling is 5 MB** — the `scripts` bucket's own `file_size_limit`, which binds well below the plan's 50 MB per-file ceiling. Reject oversize at selection with the real number in the message, never a hardcoded one.

## Accepted formats come from `app_settings`

Three sources must agree, and today they agree only by coincidence:

| Source | Currently |
| --- | --- |
| Both script cards | `TEXT_EXTENSIONS = [".txt", ".md"]` plus a hardcoded `.docx` branch, and `accept=".docx,.txt,.md"` |
| `app_settings.accepted_script_formats` | `.txt`, `.docx`, `.md` |
| `scripts` bucket `allowed_mime_types` | `text/plain`, `text/markdown`, the `.docx` MIME |

Edit the formats in Settings today and the cards will not change. This is the same defect fixed for audio in prompt 16 — see AGENTS.md. Thread `acceptedScriptFormats` from `app_settings` into the Chapter editor's script card as a required prop, so the constraint line, the `accept` attribute, the client rejection and the server validation all read one source.

Do the same for `chapter-script-card.tsx` and `manuscript-card.tsx` even though their extraction stays client-side — the format list is a separate concern from where parsing runs, and leaving them hardcoded recreates the bug.

## Extraction happens server-side

The browser uploads the file to storage, then calls a Server Action that downloads the object server-side, extracts its text, normalises it, and persists the result.

`lib/docx.ts` currently takes a `File` and is browser-shaped. Add a server-side path that takes the downloaded bytes; keep the existing export for the two client-side callers above.

### Normalisation

The extracted text is prose destined for a reader, so clean it once at ingestion rather than papering over it at render time:

- Normalise line endings to `\n`
- Collapse three or more consecutive blank lines to one blank line
- Trim trailing whitespace from every line
- Preserve paragraph breaks as single blank lines
- Strip a leading chapter heading line when it merely repeats the chapter number or title, since the reader renders its own heading
- Pass Word's smart quotes and em dashes through unchanged — they are correct for prose and must not be flattened to ASCII

**Do not strip or escape `**`, `_` or `## `.** The editor renders those as Markdown through `lib/script-markup.ts`, and the mobile reader consumes the same plain text. Normalisation must not alter them.

Reject an extraction that produces empty or whitespace-only text with the message `No readable text found in this file.` and do not persist it. An empty `script_text` must mean "no script", not "a script that failed to parse".

## Persistence

On successful extraction, a Server Action persists `script_path`, `script_file_name` and `script_text` on the chapter row, writes an `activity_log` entry in the existing register, and revalidates `/books/<id>/chapters/<n>`, `/books/<id>`, `/books` and `/`.

**Revalidating `/` is deliberate here**, against the general rule in AGENTS.md's Performance Rules. Same reasoning as prompt 16: the Dashboard queue derives from `script_text` presence and is exactly what this changes, and the cost is small relative to an upload. Do not reintroduce it to the text-save paths.

Word count is **never persisted**. It continues to compute from `script_text` via `countWords` at render time.

## Editing after upload

The prose area remains fully editable after an upload. An operator can fix an extraction artefact inline and press `Save chapter`, which persists the edited `script_text` through `updateChapter` from prompt 14 — no new action needed.

Editing the text does **not** change `script_path` or `script_file_name`. The original file stays as uploaded, which is the point of keeping it. The card continues to show the source file name alongside edited text, and that is correct rather than inconsistent.

## Replace and remove

`Replace file` uploads to a new path, extracts, repoints the row, then deletes the previous object. Upload new, repoint, delete old — a failed delete leaves an orphan to log; deleting first risks a chapter with no script. Follow `setChapterAudio` in `app/actions/audio.ts`, which already implements exactly this ordering.

`Replace file` **overwrites `script_text`**, discarding inline edits. Because that destroys work, it opens a confirmation dialog warning that the current text will be replaced by the new file's contents. This is the only script action that needs confirmation.

`Remove` confirms, nulls `script_path`, `script_file_name` and `script_text`, deletes the object, logs activity, and revalidates the same four routes. The card returns to its empty state and the chapter reappears in the Dashboard queue.

## `deleteBook` must clean up the scripts bucket

`deleteBook` in `app/actions/books.ts` collects `cover_path` and every chapter `audio_path` **before** deleting the row — chapters cascade via the foreign key, so those references vanish the instant the book goes. It deliberately does not collect script paths, because nothing wrote to that bucket.

**This prompt changes that.** Extend the same `Promise.all` to gather every chapter `script_path`, and remove those objects alongside the others. Without it, every deleted book leaks its script files permanently — the exact bug that was fixed for covers and audio.

## Book editor row buttons

The `+ Upload text` buttons in the chapters table navigate to the Chapter editor. Keep that behaviour — do not build a second inline upload path from the table. AGENTS.md lists duplicate upload paths as a known defect, and the Chapter editor is where an operator needs to see the extracted text anyway.

## States

- **Idle, no script** — existing empty file row and empty editor.
- **Idle, script present, no source file** — the 38 legacy rows. Text and file name render; `Choose file` rather than `Replace file`. Not an error state.
- **Idle, script present with source file** — existing ready state, prose in the editor, live word count.
- **Uploading** — determinate progress in the file row, `Replace file` and `Remove` disabled.
- **Extracting** — a muted `Extracting text…` state between upload completion and row write, so the card never looks finished before text exists.
- **Failed** — a `destructive` message in the file row with a `Retry` action, distinguishing: unsupported extension, oversize file, no readable text found, expired signed URL, and network failure. No generic failure message.
- **Replacing** — pending state on the confirmation dialog's confirm action.

Every terminal state needs a way out. AGENTS.md records a Manuscript card defect where two states rendered a message and no control at all, leaving a page reload as the only escape. Make `Retry` structural rather than per-state.

## Constraints

- Install nothing. `mammoth` is already present.
- The file body goes browser-to-storage. Extraction downloads it server-side; it does not receive it from the client.
- `requireAdmin()` first in every Server Action here.
- Never set `x-upsert`. Never append a cache-busting query string.
- The prose area stays a plain controlled textarea. Do not introduce a rich-text editor or `contenteditable`. The preview pane renders parsed data as React elements and must never use `dangerouslySetInnerHTML` — this text comes from uploaded files and is not trusted input.
- Extract to **plain text**, not HTML. No markup reaches the database.
- Do not add spellcheck, grammar checking, readability scoring, translation, AI cleanup, chapter splitting or a diff view against the original file. Out of scope.
- Do not persist word count, read time or any derived value.
- Do not touch the cover or audio upload paths.
- Do not modify the schema. `script_path` and `script_file_name` already exist.

## Verification

**Verify the signed-URL shape against the live project before building the UI.** Prompt 16 lost four rounds to a transport assumption that typechecked, linted and built cleanly while being wrong — mint a URL, PUT a real file, confirm the response, then delete the probe.

Then: upload a real `.docx` chapter and confirm the extracted prose renders with paragraph breaks intact, smart quotes preserved, any `**bold**` still rendering in the preview, the word count computed live, and the Books list ratio and Dashboard queue both updating without a refresh. Edit the text inline, save, and confirm the file name is unchanged while the text persists. Replace the file and confirm the dialog warns about losing edits, the old object is deleted, and the new text appears. Upload a `.txt` and confirm it needs no parser. Upload an empty file and confirm it is rejected without persisting an empty script. Open one of the 38 legacy chapters and confirm it renders as a normal ready state. Delete a book that has script files and confirm the `scripts` bucket is left clean.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing. Expect exactly the four known pre-existing RHF/TanStack warnings and no new ones.
