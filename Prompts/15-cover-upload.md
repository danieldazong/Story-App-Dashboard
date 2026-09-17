# 15-cover-upload

Read AGENTS.md first and follow it strictly.

Study the Cover thumbnail card on the Book editor, then replace its local-preview-only behaviour with real direct-to-storage uploads into the Supabase `covers` bucket.

**Keep the existing UI exactly as it is.** The card layout, the dashed 2:3 frame, the mono file name and size line, the `Replace` and `Remove` links, the constraint line and the empty dropzone state all stay. Do not change any screen design. If the upload flow needs a UI change, ask me before implementing.

Covers only in this prompt. Audio upload is prompt 16, script upload is prompt 17. Do not touch the Chapter editor or the Uploads screen.

## Upload path

Upload **directly from the browser to Supabase Storage**. Never proxy the file through a Next.js Route Handler or Server Action — the file body must not pass through the server.

Covers are small, so a standard upload is correct here; the resumable TUS protocol is for the 20–100 MB audio files in the next prompt. Do not install an upload library for this.

Authorise the upload with a signed upload URL minted server-side. Add a Server Action that calls `requireAdmin()`, validates the target book id and the declared file name and size, then returns a signed upload URL plus the object path it authorises. The browser uploads to that URL and nothing else.

## Object paths

Cover paths are **immutable**. Write every upload to a fresh path — include the book id and a generated suffix, for example `covers/<bookId>/<uuid>.<ext>`.

Do not use `x-upsert` and do not reuse a path on replace. Supabase advises against overwriting because CDN propagation lag serves stale content, and a reader client that has cached the old object at that path will keep showing the previous cover. Writing a new path and repointing the row makes the change immediate.

## Client validation

Validate before requesting a signed URL, so an invalid file never reaches storage:

- **Type** — JPEG or WebP only, matching the constraint line already in the card
- **Size** — maximum 2 MB, matching the bucket limit
- **Dimensions** — read intrinsic width and height in the browser, target 800 × 1200

Type and size rejections show a toast naming the specific problem and the file is discarded. Dimension mismatch is a **warning, not a rejection** — show an inline muted line stating the detected dimensions against the expected ratio and allow the upload to proceed. Operators source art from many places and blocking on exact pixels would stop real work; a wrong aspect ratio is visible and fixable, an unuploadable cover is not.

Server-side validation in the Server Action repeats the type and size checks. The browser check is a courtesy; the server check is the boundary.

## Flow

1. Operator picks or drops a file. Client validation runs.
2. The card enters an uploading state — the dashed frame shows a determinate progress bar using the `primary` fill, with the same 6px height and inline-width-only styling as the Uploads screen progress bars, plus a mono `<uploaded> / <total>` readout.
3. On completion, call a Server Action that persists `cover_path`, `cover_file_name`, `cover_size_bytes`, `cover_width` and `cover_height` on the book row, writes an `activity_log` entry, and revalidates `/books/<id>` and `/books`.
4. The card re-renders in its ready state from the persisted row, showing the real file name and formatted size.

The book row is only updated **after** the object exists in storage. Never write a path for an upload that has not completed.

## Replace

`Replace` opens a picker and runs the same flow to a new path. After the row points at the new object, delete the previous object from the bucket.

Order matters: upload new, repoint row, then delete old. If the delete fails, the row is still correct and only an orphaned object remains — log it and continue rather than failing the operation. Deleting first and uploading second risks a book with no cover at all.

## Remove

`Remove` opens a confirmation dialog, then nulls all five cover columns on the book row and deletes the storage object. On success the card returns to its empty dropzone state, an `activity_log` entry is written, and `/books/<id>` and `/books` revalidate.

## Books list

No change needed to the Books list itself, but verify it now renders real covers through the CDN helper added in prompt 13, with the local placeholder still serving books whose `cover_path` is null. Confirm the Supabase storage hostname is allowed in `next.config.ts` and that `next/image` optimization stays enabled.

## States

- **Idle, no cover** — existing empty dropzone with the constraint line.
- **Idle, cover present** — existing ready state, values from the row.
- **Validating** — brief, no separate visual needed.
- **Uploading** — determinate progress with bytes, `Replace` and `Remove` disabled.
- **Persisting** — a short muted `Saving…` state between upload completion and row update, so the card never looks finished before the row is written.
- **Failed** — the dashed frame shows a `destructive` message naming the cause, with a `Retry` muted outline action. Distinguish a rejected file type, an oversize file, an expired signed URL, and a network failure. No generic "upload failed".
- **Removing** — pending state on the confirm action.

## Constraints

- The file body never touches the server. Signed URL out, file straight to storage.
- `requireAdmin()` first in every Server Action here.
- Progress bar fill width is the only permitted inline style.
- Do not install `tus-js-client`, Uppy, or any upload or image-processing library.
- Do not generate, source, resize, crop or transform cover artwork. Operators upload finished art, per AGENTS.md.
- Do not add a crop tool, an image editor, a URL-import field, a drag-to-reorder gallery or multiple covers per book.
- Do not append a cache-busting query string to a cover URL. Paths are immutable, which is what makes caching safe.
- Do not touch the Chapter editor, the Uploads screen or the Bulk import screen.

## Verification

Upload a valid cover and confirm the Books list thumbnail and the Book editor card both show it after revalidation, with no manual refresh. Replace it and confirm the old object is gone from the bucket and the new cover appears immediately rather than serving a stale cached image. Remove it and confirm the card returns to its dropzone state and the object is deleted. Then attempt a 5 MB PNG and confirm it is rejected client-side with a specific message and never reaches storage.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
