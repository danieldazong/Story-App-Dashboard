# 16-audio-upload-tus

Read AGENTS.md first and follow it strictly.

Study the Narration audio card on the Chapter editor and the Active uploads card on the Uploads screen, then implement real resumable narration uploads into the Supabase `audio` bucket.

**Keep the existing UI exactly as it is.** The Narration audio card's ready state, missing state, metadata block, `Detected` / `Edited` label, `Edit duration` link, play button, `Replace` and `Remove` links and constraint line all stay. The Uploads screen's five row states, progress bars, failure messages and footer summary all stay. Do not change any screen design. If the upload flow needs a UI change, ask me before implementing.

Audio only in this prompt. Script upload is prompt 17; bulk import creation is prompt 18.

## Library approval required

This needs `tus-js-client`. AGENTS.md permits either `tus-js-client` or Uppy and requires asking before installing. **Recommend and ask before installing `tus-js-client`**, not Uppy: Uppy brings its own dashboard UI and DOM, which would conflict with the upload rows already built to the design system, and AGENTS.md lists Uppy widget styling as a style exception precisely because the library owns its markup. `tus-js-client` is the protocol client alone and leaves the existing UI intact.

Do not install anything until approved. State the recommendation, then stop.

## Why resumable

Chapter narration runs 20 to 100 MB. Supabase recommends the resumable path for anything above 6 MB, and it is what gives real progress events and survival across network interruption. A standard upload is not acceptable here, and the file body must never be proxied through a Next.js Route Handler or Server Action.

## Authorisation

Add a Server Action that calls `requireAdmin()`, validates the target book id, chapter id, declared file name, declared size and MIME type against `app_settings`, then returns a signed upload token via `createSignedUploadUrl` plus the object path it authorises.

Pass that token in the **`x-signature` header** of the resumable upload, per the Supabase resumable-upload documentation. Chunks go to the unique upload URL the storage server creates, via `PATCH`.

## Object paths

Audio paths are **immutable**. Write every upload to a fresh path, for example `audio/<bookId>/<chapterId>/<uuid>.<ext>`.

**Never set `x-upsert`.** Supabase advises against overwriting because CDN propagation delay serves stale content to clients that cached the old object — and for audio that means a reader hearing the previous take. Immutable paths are also what make aggressive edge caching safe, which matters because cached egress bills roughly a third of uncached.

## Protocol behaviour to handle explicitly

These are documented characteristics, not edge cases. Each needs a distinct, specific UI outcome — the three failure messages already built on the Uploads screen exist for exactly these.

**Upload URL expiry.** A resumable upload URL is valid for **up to 24 hours**. TUS clients typically mint a fresh URL when the previous one expires, but do not assume it silently. On expiry, surface `Upload link expired after 24 hours. Retry to get a fresh link.` and have `Retry` request a new signed token and restart, rather than retrying against a dead URL.

**Concurrent writes to one upload URL.** Only one client may write to a given upload URL at a time; others receive `409 Conflict`. Surface `Upload conflict — another transfer is writing to this path. Retry.`

**Two clients, same path, different URLs.** The first to complete wins; the loser gets `409 Conflict`. Because `x-upsert` is never set, the loser must not silently overwrite. Same conflict message, and the row is not repointed.

**Oversize file.** Rejected at selection with the limit read from `app_settings`, never entering the queue.

Resume across a page reload where `tus-js-client` supports it via its URL storage. If resumption is not achievable cleanly, a `Retry` that restarts is acceptable — say so in the implementation notes rather than pretending resumption works.

## Duration detection

After the object exists, detect duration in the browser from the selected file using an `<audio>` element and `loadedmetadata`.

`loadedmetadata` **can report `Infinity` or `NaN`** for some encodings. When it does:

- the upload still shows a **success** state, never a failure — the file is in storage and is valid
- persist `audio_duration_seconds` as null and leave `audio_duration_source` null
- the Narration audio card renders the duration row with a `status-warn` `Duration not detected` and the `Edit duration` link, so an operator can correct it immediately
- publishing is never blocked on detection

Never show a failed upload because duration detection failed. These are separate concerns and conflating them will make operators re-upload files that uploaded fine.

When detection succeeds, persist the rounded seconds with `audio_duration_source` set to `'detected'`, and the card shows `Detected` with its check, exactly as it does now. `Edit duration` continues to flip it to `'manual'` and render `Edited`, as wired in prompt 14.

## Flow

1. Operator picks or drops a file on the Narration audio card, or adds files from the Uploads screen `Add files` action.
2. Client validation: MIME type against accepted audio formats, size against the max from `app_settings`.
3. Request a signed upload token. Begin the resumable upload.
4. The card and the Uploads row both reflect live progress — `uploading` with mono percent and `<uploaded> / <total>` bytes.
5. On completion, both enter `processing` with the note `Detecting duration…`.
6. Call a Server Action persisting `audio_path`, `audio_file_name`, `audio_size_bytes`, `audio_duration_seconds` and `audio_duration_source` on the chapter row, writing an `activity_log` entry in the existing register — `Chapter 12 narration uploaded`.
7. Revalidate `/books/<id>/chapters/<n>`, `/books/<id>`, `/books` and `/`. The Dashboard `MISSING AUDIO` tile and its queue both derive from audio presence, so they must update without a refresh.
8. Both surfaces enter `complete`.

The chapter row is updated **only after** the object exists. Never write a path for an incomplete upload.

## Replace and remove

`Replace` uploads to a new path, repoints the row, then deletes the previous object. Order is upload new, repoint row, delete old — a failed delete leaves an orphan to log, while deleting first risks a chapter with no audio.

`Remove` confirms, nulls the five audio columns, deletes the object, logs activity, and revalidates the same four routes. The card returns to its dropzone state and the chapter reappears in the Dashboard queue.

## Retire the simulator

Delete the upload simulator harness from prompt 09 and wire the Active uploads card to the real queue. Every row state, the footer summary, `Cancel`, `Retry`, `Dismiss` and `Clear completed` now operate on real transfers.

`Cancel` aborts the TUS upload and, if any bytes reached storage, cleans up the partial object. A cancelled upload leaves no row change and no orphan.

## Uploads screen targeting

Files added from the Uploads screen need a target chapter. Because the existing row layout already shows a `<book title> · Chapter <nn>` target line, add target selection at **file-add time**: the `Add files` picker is preceded by a small dialog choosing a book and a chapter, defaulting to the first chapter missing audio in that book. Do not add a target column or per-row selects to the existing table — that would change the built design.

This is the one addition to existing UI in this prompt. If you would rather audio uploads only originate from the Chapter editor, flag it instead of building something different.

## States

Every state already exists in the built UI. Wire them to real events and verify all of them: `queued`, `uploading`, `processing`, `complete`, `failed` with each of the three distinct messages, plus the Narration audio card's `Duration not detected` variant, its `Saving…` window between upload completion and row write, and `Cancel` mid-transfer.

## Constraints

- Ask before installing `tus-js-client`. Install nothing else.
- The file body never touches the server.
- `requireAdmin()` first in every Server Action here.
- Never set `x-upsert` on any storage write.
- Never append a cache-busting query string to an audio URL.
- Progress bar fill width remains the only permitted inline style.
- Do not add a waveform, a scrubber, volume control, playback speed, transcoding, normalisation, loudness analysis, or any audio processing. The play button stays a plain `<audio>` element.
- Do not add upload speed, ETA, throughput or bandwidth readouts. AGENTS.md rules them out.
- Do not touch the Book editor cover card or the script upload path.
- Do not modify the schema.

## Verification

Upload a genuine 40 MB `.m4a` to a chapter and confirm progress reports real bytes, duration is detected, the row persists, and the Dashboard tile and queue both update without a manual refresh. Then upload a file whose encoding makes `loadedmetadata` report `Infinity` and confirm the upload still shows success with `Duration not detected` and a working `Edit duration`. Kill the network mid-transfer and confirm the failure message is specific and `Retry` recovers. Replace an existing narration and confirm the old object is deleted and no stale audio is served. Attempt a 120 MB file and confirm it is rejected at selection.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

---

(Here paste the latest Supabase resumable uploads documentation: https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
