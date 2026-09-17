# 06-chapter-editor

Read AGENTS.md first and follow it strictly.

Implement the Chapter editor screen exactly as shown in the attached design. Use the mock catalog from `data/mock-catalog.ts`, the helpers in `lib/catalog.ts`, and the existing design system utilities.

Route: `app/(dashboard)/books/[bookId]/chapters/[chapterNumber]/page.tsx`, replacing the placeholder from the previous prompt.

## Header

Breadcrumb `Books / <book title> / Chapter <n>` — `Books` and the book title are links, the chapter segment is not, single separator throughout.

Page title reads `Chapter <n> · <chapter title>` at 24px / 600. Immediately to its right, baseline-aligned, a 12px `muted` passive status line reading `Saved 2 min ago`. This is a display of local save state only — it shows `Unsaved changes` while the form is dirty, and a relative timestamp after a successful save in this session. It performs no persistence and never claims a save that did not happen.

Ember `Save chapter` button right-aligned on the title row. The single primary button on this screen. Validates and toasts via `sonner`; no persistence in this prompt.

## Layout

Two-column layout at a 2:1 ratio with 24px gap. Left column holds the **Chapter script** card. Right column holds **Narration audio** and **Chapter settings**, stacked with a 24px gap.

## Chapter script card

The script file row and the prose editor live in the **same card**, separated by a 1px `border` divider — do not split them into two cards.

Top row: a document icon, the file name in mono, then right-aligned `Replace file` in `muted` and `Remove` in `destructive`. When no script file has been uploaded, this row instead shows a muted instruction and a `Choose file` action, and the editor below starts empty.

Beneath the divider, a formatting toolbar: `B`, `I`, `H2`, and a paste-as-plain-text icon button. The toolbar operates on the text area below it. Keep the implementation to a plain controlled textarea with these four actions applied as simple text transformations — do not install a rich-text editor, and do not introduce `contenteditable` or `dangerouslySetInnerHTML`.

Beneath the toolbar, the chapter prose in an editable area, rendered in a serif face at a comfortable reading measure with generous line-height, matching the frame. The area grows with content rather than scrolling internally.

Card footer, separated by a divider, shows the word count in `muted` — `1,842 words` — computed live from the current text by `countWords`. Never a stored number.

`Replace file` and `Choose file` open a file picker and update local state only. Parsing and upload land in a later prompt.

## Narration audio card

Card heading `Narration audio`.

**Audio ready state.** An audio-file icon with the file name in mono, then a circular ember play button right-aligned. Below, a metadata block: `Duration <mm:ss>`, then a `status-ok` check with the label `Detected`, then an `Edit duration` link right-aligned. On the next line, `Size <n> MB`. Then a divider, then `Replace` in `muted` and `Remove` in `destructive`. Then a 12px `muted` constraint line reading `Uploads directly to storage · .m4a or .mp3 · max 100MB`.

The `Detected` label renders **only** when `audio.durationSource` is `"detected"`. When it is `"manual"`, show `Edited` in `muted` with no check. Book A chapter 10 in the fixture carries `"manual"` — verify both renderings against it.

`Edit duration` opens a small dialog with a `mm:ss` input prefilled with the current value, a `Cancel` and a `Save duration` action. Saving updates local state and flips `durationSource` to `"manual"`. This control is mandatory and always available, because automatic detection can report `Infinity` or `NaN` for some encodings and an operator must be able to correct it by hand.

The play button plays the audio via a native `<audio>` element and toggles to a pause glyph while playing. No waveform, no scrubber, no volume control.

**Audio missing state.** The same card showing a dashed dropzone with a short muted instruction, an `Upload audio` action, and the same constraint line beneath. No duration or size rows.

Neither state uploads anything in this prompt.

## Chapter settings card

Card heading `Chapter settings`. Three field groups:

| Field          | Control                             | Helper line                                         |
| -------------- | ----------------------------------- | --------------------------------------------------- |
| Chapter number | number input                        | —                                                   |
| Title          | text input                          | —                                                   |
| Access         | segmented control `Free` / `Locked` | `Locked chapters need an ad view or a subscription` |

Note the field order in the frame differs from AGENTS.md's listing. Follow the frame: Chapter number, then Title, then Access.

## Navigation

Provide previous and next chapter navigation so an operator can work a serial without returning to the Book editor each time — a pair of muted outline chevron buttons placed at the end of the Chapter settings card, disabled at the first and last chapter. This is not in the frame; it is required by the throughput bias in AGENTS.md. If you would rather it were omitted, flag it instead of building something different.

## States

- **Loading** — skeletons shaped like the three cards, not a spinner.
- **Unknown book id or chapter number** — a card with a short heading, one muted line, and a `Back to book` action. Do not throw.
- **Script missing** — the file row and editor empty states described above.
- **Audio missing** — the dropzone state described above.
- **Unsaved changes** — `Save chapter` disabled until dirty and valid; inline field errors on invalid submit; the header status line reads `Unsaved changes`.

## Overrides — deviate from the attached design here

- The frame shows a **three-item sidebar with no Dashboard**. Stale. The four-item shell is correct — do not touch it.
- The frame's breadcrumb shows a **doubled separator** before `Chapter 12`. Use exactly one.
- The frame's Access segmented control must show `Locked` as the **dark-filled selected** option and `Free` as white with a `border` border. The filled state tracks the actual value, never a fixed position.
- All content in the frame is placeholder — `ch12_rejection.docx`, `ch12_rejection_master.m4a`, `09:14`, `42.3MB`, `1,842 words`, `Saved 2 min ago`, the chapter title and the prose. Every one resolves from `data/mock-catalog.ts` or is computed at render time. Hardcode none of it.

## Constraints

- Server Component for the page and the data read. Client Components for the script card, the audio card and the settings form.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen — `Save chapter`. The circular play button is the one permitted exception, as it is an ember control rather than a competing primary action, and it appears in the frame.
- Validate the form with a schema.
- Do not install a rich-text editor, an audio waveform library or a media player library.
- Do not create any Supabase client, Server Action or upload logic in this prompt.
- Do not add a publish toggle, a schedule field, a notify-subscribers toggle, a read-time row, a translation field or a revision history panel. None are in the design.
- Test against Book A chapter 1 (both assets ready), chapter 7 (audio missing), chapter 8 (script missing), chapter 9 (both missing) and chapter 10 (manual duration) before finishing.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

@"/c:/Users/PC/Desktop/story-app-dashboad/material/3.png"
