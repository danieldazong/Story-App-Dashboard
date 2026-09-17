# 16-audio-upload-tus

Read AGENTS.md first and follow it strictly.

Study the Narration audio card on the Chapter editor, then implement real resumable narration uploads into the Supabase `audio` bucket.

**Keep the existing UI exactly as it is.** The Narration audio card's ready state, missing state, metadata block, `Detected` / `Edited` label, `Edit duration` link, play button, `Replace` and `Remove` links, dashed dropzone and constraint line all stay. Do not change any screen design. If the upload flow needs a UI change, ask before implementing.

Audio only in this prompt. Script upload is prompt 17; bulk import creation is prompt 18.

## Scope: the Chapter editor only

Earlier revisions of this prompt targeted an **Uploads screen** with an Active uploads card, five row states, a footer summary and an `Add files` target dialog. **That screen no longer exists** — `app/(dashboard)/` contains only `books` and `settings`, and `types/upload.ts`, `data/mock-activity.ts` and the prompt-09 simulator harness are all deleted. There is nothing to retire and nothing to rewire.

So: **narration uploads originate from the Narration audio card on the Chapter editor, and nowhere else.** That card already knows its chapter, so no target-selection step is needed.

This also satisfies AGENTS.md's _single upload surface per asset_ rule by structure. The Chapter composer was made create-mode only during the UX pass, so the Narration audio card now appears once per chapter — one TUS wiring, one progress implementation, one place for conflict handling to live.

## Library approval required

This needs `tus-js-client`. AGENTS.md permits either `tus-js-client` or Uppy and requires asking before installing. **Recommend and ask before installing `tus-js-client`**, not Uppy: Uppy brings its own dashboard UI and DOM, which would conflict with the card already built to the design system, and AGENTS.md lists Uppy widget styling as a style exception precisely because the library owns its markup. `tus-js-client` is the protocol client alone and leaves the existing UI intact.

Do not install anything until approved. State the recommendation, then stop.

## Why resumable

Chapter narration runs 20 to 100 MB. Supabase recommends the resumable path for anything above 6 MB, and it is what gives real progress events and survival across network interruption. A standard upload is not acceptable here, and the file body must never be proxied through a Next.js Route Handler or Server Action.

## Authorisation

Add a Server Action that calls `requireAdmin()`, validates the target book id, chapter id, declared file name, declared size and MIME type, then returns a signed upload token via `createSignedUploadUrl` plus the object path it authorises.

Pass that token in the **`x-signature` header** of the resumable upload (verified against the current Supabase documentation — see the reference section at the end).

## Accepted formats and size limit come from `app_settings`

**This is a real defect to fix, not a nicety.** Three sources currently disagree:

| Source                                                | Accepts                                                   |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `chapter-editor-audio-card.tsx` (hardcoded constants) | `.m4a`, `.mp3`                                            |
| `app_settings.accepted_audio_formats` (default)       | `.m4a`, `.mp3`, **`.wav`**                                |
| `audio` bucket `allowed_mime_types`                   | `audio/mp4`, `audio/x-m4a`, `audio/mpeg`, **`audio/wav`** |

The card silently refuses a `.wav` that both the settings row and the bucket permit. This is the same shape as the cover-art PNG disagreement that cost a migration — see AGENTS.md, prompt 15 notes.

Thread the real settings into both audio cards:

- `ChapterEditorAudioCard` — replace the `ACCEPTED_AUDIO_FORMATS` and `MAX_AUDIO_SIZE_MB` constants with values passed from the page, which already calls `serverSupabaseWithSettings()`.
- `NarrationAudioCard` — its file-header comment documents this exact divergence and why it was deferred. That reason has expired; fix it and delete the comment.

The constraint line, the `accept` attribute, the client-side rejection and the server-side validation must all read the same source. Server-side validation remains the boundary; the client check is a courtesy.

## Object paths

Audio paths are **immutable**. Write every upload to a fresh path: `<bookId>/<chapterId>/<uuid>.<ext>` within the `audio` bucket.

**Never set `x-upsert`.** Supabase advises against overwriting because CDN propagation delay serves stale content to clients that cached the old object — and for audio that means a reader hearing the previous take. Immutable paths are also what make aggressive edge caching safe, which matters because cached egress bills roughly a third of uncached.

## Protocol behaviour to handle explicitly

These are documented characteristics, not edge cases. Each needs a distinct, specific message on the card's `failed` state — never a generic one.

**Upload URL expiry.** A resumable upload URL is valid for **up to 24 hours**. On expiry, surface `Upload link expired after 24 hours. Retry to get a fresh link.` and have `Retry` request a new signed token and restart, rather than retrying against a dead URL.

**Concurrent writes to one upload URL.** Only one client may write to a given upload URL at a time; others receive `409 Conflict`. Surface `Upload conflict — another transfer is writing to this path. Retry.`

**Two clients, same path, different URLs.** The first to complete wins; the loser gets `409 Conflict`. Because `x-upsert` is never set, the loser must not silently overwrite. Same conflict message, and the row is not repointed.

**Oversize file.** Rejected at selection with the limit read from `app_settings`, never starting a transfer. The message interpolates the real limit — do not hardcode `100 MB`, it becomes a lie the moment an operator edits the setting.

**A stalled request must fail visibly, not hang.** The cover upload once sat at `0.0 KB` forever because no timeout guarded a Server Action call that could never resolve. Guard the signed-token call the same way `cover-thumbnail-card.tsx` does with its `withTimeout` helper.

Resume across a page reload where `tus-js-client` supports it via its URL storage (`removeFingerprintOnSuccess: true` keeps the fingerprint store clean). If resumption is not achievable cleanly, a `Retry` that restarts is acceptable — say so in the implementation notes rather than pretending resumption works.

## Duration detection

After the object exists, detect duration in the browser from the selected file using an `<audio>` element and `loadedmetadata`.

`loadedmetadata` **can report `Infinity` or `NaN`** for some encodings. When it does:

- the upload still shows a **success** state, never a failure — the file is in storage and is valid
- persist `audio_duration_seconds` as null and leave `audio_duration_source` null
- the card renders the duration row with a `status-warn` `Duration not detected` and the `Edit duration` link, so an operator can correct it immediately
- publishing is never blocked on detection

**This needs a type change, so plan for it.** `AudioAsset`'s `ready` variant currently types `durationSource` as non-nullable, and `toAudioAsset` defaults it to `"detected"`. A file whose duration never resolved is neither `detected` nor `manual`. Widen the union honestly rather than casting — an undetected duration is a real third state and the compiler should carry it.

Never show a failed upload because duration detection failed. These are separate concerns and conflating them will make operators re-upload files that uploaded fine.

When detection succeeds, persist the rounded seconds with `audio_duration_source` set to `'detected'`, and the card shows `Detected` with its check, exactly as it does now. `Edit duration` continues to flip it to `'manual'` and render `Edited`, as wired in prompt 14.

## Flow

1. Operator picks or drops a file on the Narration audio card.
2. Client validation: MIME type against `app_settings.accepted_audio_formats`, size against `app_settings.max_audio_size_mb`.
3. Request a signed upload token. Begin the resumable upload.
4. The card reflects live progress — mono `<uploaded> / <total>` bytes with the determinate bar. The fill width is the only permitted inline style.
5. On completion, the card enters `processing` with the note `Detecting duration…`.
6. Call a Server Action persisting `audio_path`, `audio_file_name`, `audio_size_bytes`, `audio_duration_seconds` and `audio_duration_source` on the chapter row, writing an `activity_log` entry in the existing register — `Chapter 12 narration uploaded`.
7. Revalidate `/books/<id>/chapters/<n>`, `/books/<id>`, `/books` **and `/`**.
8. The card enters `complete`.

### On revalidating `/`

AGENTS.md's Performance Rules say _"revalidate only what is on screen"_, and `revalidatePath("/")` was removed from all seven book and chapter mutations because rebuilding the dashboard's five queries taxed every ~1s text save with ~2s of work.

**Audio upload is the deliberate exception, and the reasoning is the cost ratio.** A 40 MB transfer already takes 30 seconds or more, so the same revalidation is noise against it — and the Dashboard's `MISSING AUDIO` tile and its attention queue are precisely what this upload exists to change. The rule is about cost relative to the operation, not a blanket ban. Include `/` here; do not reintroduce it to the text-save paths.

The chapter row is updated **only after** the object exists. Never write a path for an incomplete upload.

## Replace and remove

`Replace` uploads to a new path, repoints the row, then deletes the previous object. Order is upload new, repoint row, delete old — a failed delete leaves an orphan to log, while deleting first risks a chapter with no audio. This mirrors `setBookCover` in `app/actions/covers.ts`; follow that implementation.

`Remove` confirms, nulls the five audio columns, deletes the object, logs activity, and revalidates the same four routes. The card returns to its dropzone state and the chapter reappears in the Dashboard queue.

## Cancel

`Cancel` aborts the TUS upload and, if any bytes reached storage, cleans up the partial object. A cancelled upload leaves no row change and no orphan.

## States

Wire every state on the card and verify all of them: idle/missing dropzone, `uploading` with real bytes, `processing`, `complete`, `failed` with each of the three distinct messages, the `Duration not detected` variant, the `Saving…` window between upload completion and row write, and `Cancel` mid-transfer.

**Every terminal state needs a way out.** AGENTS.md records a Manuscript card defect where two states rendered a message and no control at all, leaving a page reload as the only escape. A `failed` upload must always expose `Retry`; make the control structural rather than per-state.

## Constraints

- Ask before installing `tus-js-client`. Install nothing else.
- The file body never touches the server.
- `requireAdmin()` first in every Server Action here.
- Never set `x-upsert` on any storage write.
- Never append a cache-busting query string to an audio URL.
- Progress bar fill width remains the only permitted inline style.
- Do not add a waveform, a scrubber, volume control, playback speed, transcoding, normalisation, loudness analysis, or any audio processing. The play button stays a plain `<audio>` element — it already is one.
- Do not add upload speed, ETA, throughput or bandwidth readouts. AGENTS.md rules them out.
- Do not touch the Book editor cover card or the script upload path.
- Do not modify the schema. (The `AudioAsset` **TypeScript** union does change — see Duration detection. The database columns do not.)

## Verification

**Verify the endpoint shape against the live project before building the UI.** The cover-upload URL shape was confirmed end to end before shipping precisely because a wrong shape fails only at runtime, with typecheck, lint and build all passing regardless. Mint a token, PUT a small real file, confirm the response, then delete the probe.

Then: upload a genuine 40 MB `.m4a` to a chapter and confirm progress reports real bytes, duration is detected, the row persists, and the Dashboard tile and queue both update without a manual refresh. Upload a `.wav` and confirm it is now accepted. Upload a file whose encoding makes `loadedmetadata` report `Infinity` and confirm the upload still shows success with `Duration not detected` and a working `Edit duration`. Kill the network mid-transfer and confirm the failure message is specific and `Retry` recovers. Replace an existing narration and confirm the old object is deleted and no stale audio is served. Attempt a file above the configured limit and confirm it is rejected at selection with the real limit in the message.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing. Expect exactly the four known pre-existing RHF/TanStack warnings and no new ones.

---

## Reference: Supabase resumable uploads

Fetched from `https://supabase.com/docs/guides/storage/uploads/resumable-uploads`.

**Endpoint** — note the dedicated storage hostname, which the docs recommend over the standard project domain for large files:

```
https://{projectId}.storage.supabase.co/storage/v1/upload/resumable
```

**Client configuration:**

```javascript
var upload = new tus.Upload(file, {
    endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
    },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
        bucketName: bucketName,
        objectName: fileName,
        contentType: 'image/png',
        cacheControl: '3600',
        metadata: JSON.stringify({ yourCustomMetadata: true }),
    },
    chunkSize: 6 * 1024 * 1024,
    onError: function (error) { ... },
    onProgress: function (bytesUploaded, bytesTotal) { ... },
    onSuccess: function () { ... },
})
```

Adapt that example rather than copying it:

- **`chunkSize` must be exactly `6 * 1024 * 1024`.** The docs state: _"it must be set to 6MB (for now) do not change it"_.
- **Drop `'x-upsert': 'true'`** — this project never upserts. Use the `x-signature` header carrying the `createSignedUploadUrl` token instead of the session `authorization` header.
- **Metadata fields are `bucketName`, `objectName`, `contentType`, `cacheControl`**, plus an optional custom `metadata` JSON string.
- `retryDelays`, `uploadDataDuringCreation` and `removeFingerprintOnSuccess` are worth keeping as shown.

**Documented protocol facts:**

- _"The unique upload URL will be valid for up to 24 hours."_
- _"When two or more clients upload to the same upload URL only one of them will succeed. The other clients will receive a `409 Conflict` error."_
- Signed upload tokens are supported on the resumable endpoint: `createSignedUploadUrl()` returns a token passed in the **`x-signature`** header. Both session tokens and signed URLs work.
