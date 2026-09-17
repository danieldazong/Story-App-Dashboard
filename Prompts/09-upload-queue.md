# 09-upload-queue

Read AGENTS.md first and follow it strictly.

Implement the Upload Queue screen. **There is no design frame for this screen** — build it from the specification below, using the design system tokens, type utilities and card patterns already established on the Books, Book editor and Settings screens. Visual consistency with those screens is the fidelity target.

Route: `app/(dashboard)/uploads/page.tsx`, replacing the placeholder from the app shell prompt.

Use the `UploadItem` type from `types/upload.ts` and the activity fixture from `data/mock-activity.ts`. All progress in this prompt is simulated — no network, no storage, no real files leave the browser.

## Header

Breadcrumb `Uploads`. Page title `Uploads` at 24px / 600, with a 12px `muted` sub-line reading `Transfers in progress and recent ingestion.`

Ember `Add files` button right-aligned on the title row — the single primary button on this screen. It opens a file picker accepting the audio and script formats from `data/settings-defaults.ts`, and pushes each selected file into the queue as a new `UploadItem` in the `queued` state.

## Active uploads card

Card heading `Active uploads` with a 12px `muted` sub-line reading `Files transferring directly from this browser to storage.`

One row per `UploadItem`, divided by 1px borders. Each row is a three-part layout:

**Left** — a kind icon (audio, script or cover), the file name in mono at 13px, and beneath it a 12px `muted` target line reading `<book title> · Chapter <nn>` for chapter-scoped uploads, or `<book title>` for a cover.

**Center** — a progress bar, 6px tall, full width of its column, `border` track with a `primary` fill and an 8px radius. The fill width is the only inline style on this screen, computed from `uploadedBytes` over `sizeBytes`. Never store a percent.

**Right** — the state readout, right-aligned, in a fixed-width column so rows do not jitter as values change:

| State        | Readout                                                                    | Trailing action                              |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------- |
| `queued`     | `muted` `Queued`                                                           | `Cancel` link in `muted`                     |
| `uploading`  | mono `68% · 12.4 / 42.3 MB`                                                | `Cancel` link in `muted`                     |
| `processing` | `muted` italic note, e.g. `Detecting duration…`, with an indeterminate bar | none                                         |
| `complete`   | `status-ok` check with `Complete`                                          | `Dismiss` link in `muted`                    |
| `failed`     | `destructive` message text                                                 | `Retry` muted outline button, then `Dismiss` |

Byte values format through `formatBytes` from `lib/catalog.ts`. Percent is derived at render time.

Card footer, divided, shows a 12px `muted` summary: `<n> uploading · <n> complete · <n> failed`, computed, with segments omitted when their count is zero. When all counts are zero the footer is omitted entirely.

Include a right-aligned muted `Clear completed` action on the card header row, removing all `complete` items from the queue.

## Failure messaging

Failed rows carry a specific message, never a generic one. Build these three, since they are the failures this pipeline actually produces:

- `Upload conflict — another transfer is writing to this path. Retry.` for a `409`
- `Upload link expired after 24 hours. Retry to get a fresh link.` for an expired resumable URL
- `File exceeds the 100 MB limit.` for an oversize file, with the limit read from `data/settings-defaults.ts`

Oversize files are rejected at selection time with a toast and never enter the queue.

## Seed import card

Card heading `Seed import` with a 12px `muted` sub-line reading `Load a full serial in one pass.`

This card is an **entry point only**. It holds a short muted paragraph explaining that a folder of `.txt` or `.docx` files can be matched to chapters by filename, and a muted outline `Open bulk script import` button navigating to `/uploads/bulk-import`.

**Do not build a dropzone, a target-book select or a match-audio checkbox here.** AGENTS.md lists duplicate upload paths on the upload surfaces as a known defect, and the matching workflow belongs entirely to the Bulk Script Import screen built in the next prompt. One path only.

Create a minimal placeholder at `app/(dashboard)/uploads/bulk-import/page.tsx` rendering only the breadcrumb `Uploads / Bulk script import` and its page title, so navigation does not 404. The next prompt replaces it.

## Recent activity card

Card heading `Recent activity`. Identical structure to the Dashboard's activity card — mono `HH:mm` timestamp in a fixed-width left column, message in `text` beside it, 1px dividers between rows.

If the Dashboard's activity rows were built as a reusable component, reuse it rather than duplicating. If they were built inline, extract the component now and use it in both places.

## Simulated progress

Drive the queue with a small client-side simulator so every state is observable without a backend: a queued item advances to `uploading`, increments `uploadedBytes` on an interval, passes through `processing` for audio, then resolves to `complete`. Seed the initial queue with four items covering `uploading`, `processing`, `complete` and `failed`, so the screen is fully populated on first load.

Keep the simulator isolated in one module and clearly commented as a development harness to be deleted when the real TUS pipeline lands.

## States

- **Loading** — skeleton rows matching the upload row structure. Not a spinner.
- **Empty queue** — inside the Active uploads card, a short heading such as `No transfers in progress`, one muted explanatory line, and the `Add files` action. Explain the next step.
- **All complete** — the queue still lists completed rows with `Dismiss` and `Clear completed` available; it does not auto-empty.
- **No activity** — a single muted line inside the activity card.

## Constraints

- Server Component for the page shell. The queue is a Client Component — it is live, ephemeral state.
- Queue state lives in local component state or a small context. Per AGENTS.md, uploads are ephemeral and do not belong in a global store.
- The progress bar fill width is the only permitted inline style. Everything else is Tailwind classes.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen — `Add files`. `Clear completed`, `Retry` and `Open bulk script import` are muted outline or links.
- Do not add upload speed, throughput, ETA, bandwidth totals, storage-used readouts, a concurrency setting, a pause-all control, a chart of any kind, or a history table beyond the activity card. AGENTS.md rules all of it out.
- Do not create any Supabase client, Server Action, TUS client or storage call in this prompt.
- Do not install `tus-js-client`, Uppy or any upload library yet.
- Verify every one of the five row states and all three failure messages render correctly before finishing.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
