# 03-types-and-mock-data

Read AGENTS.md first and follow it strictly.

Create the catalog type system and a typed mock dataset. No UI in this prompt.

AGENTS.md forbids hardcoding placeholder content from the design frames into components. That rule stands. This prompt creates something different: a clearly labelled development fixture in `data/`, which every screen prompt will consume through the same shape it will later receive from Supabase. Screens read from these modules, never from inline literals. When Supabase reads land in a later prompt, these modules are deleted and nothing else changes.

## Files to create

```txt
types/catalog.ts
types/upload.ts
data/genres.ts
data/maturity-levels.ts
data/mock-catalog.ts
data/mock-activity.ts
data/settings-defaults.ts
lib/catalog.ts
```

## types/catalog.ts

Define these. Use discriminated unions for state, not optional-field soup.

`Book` — id, title, author, shortDescription, synopsis, genres, maturity, status, cover, createdAt, updatedAt.

`BookStatus` — `"draft" | "published"`.

`Maturity` — `"general" | "mature_17"`.

`CoverAsset` — a union of `{ state: "missing" }` and `{ state: "ready"; fileName: string; sizeBytes: number; url: string; width: number; height: number }`.

`Chapter` — id, bookId, number, title, script, audio, access, updatedAt.

`ChapterAccess` — `"free" | "locked"`.

`ScriptAsset` — a union of `{ state: "missing" }` and `{ state: "ready"; fileName: string; text: string; wordCount: number }`.

`AudioAsset` — a union of:

- `{ state: "missing" }`
- `{ state: "ready"; fileName: string; sizeBytes: number; durationSeconds: number; durationSource: "detected" | "manual"; url: string }`

`durationSource` exists because automatic detection can fail and an operator can correct it by hand. The Chapter editor renders "Detected" only when the value is `"detected"`.

`MissingAsset` — `"script" | "audio" | "both"`. Derived, never stored.

`ActivityEntry` — id, timestamp, message.

## types/upload.ts

`UploadItem` — id, fileName, sizeBytes, kind (`"audio" | "cover" | "script"`), target (book id, and chapter id where applicable), and a `state` discriminated union:

- `{ state: "queued" }`
- `{ state: "uploading"; uploadedBytes: number }`
- `{ state: "processing"; note: string }`
- `{ state: "complete" }`
- `{ state: "failed"; message: string }`

Percent is computed from `uploadedBytes` and `sizeBytes`. Never store a percent.

## data/genres.ts and data/maturity-levels.ts

Genres as a typed const array of value plus label, covering the NovelNow catalog: Romance, Werewolf, Vampire, Fantasy, Possessive Alpha, Billionaire, Dark Romance, Paranormal, Shifter, Enemies to Lovers.

Maturity levels as a typed const array of value plus label plus helper text, where `mature_17` carries the age-verification helper line.

## data/mock-catalog.ts

Three books, chosen to exercise every state rather than to match the frames.

**Book A** — published, cover ready, 12 chapters. Chapters 1–3 free with script and audio ready. Chapters 4–6 locked with script ready and audio ready. Chapter 7 locked, script ready, audio missing. Chapter 8 locked, script missing, audio ready. Chapter 9 locked, script missing, audio missing. Chapter 10 locked, script ready, audio ready with `durationSource: "manual"`. Chapters 11–12 locked, script ready, audio missing. Include one chapter title long enough to test truncation.

**Book B** — published, cover ready, 40 chapters, every chapter script and audio ready, all locked except the first three. This is the long-list case that later screens must virtualise.

**Book C** — draft, cover missing, 6 chapters, all script missing and audio missing. This is the empty-ish case.

Chapter `script.text` should hold two or three short paragraphs of plausible prose for the books that have it, enough to render the editor and compute a word count honestly. Word counts must be computed from the text by the helpers below, not typed in by hand.

Do not copy the chapter counts, ratios, durations or file sizes from the design frames. Those are generator noise. Pick coherent values and keep them internally consistent.

## data/mock-activity.ts

Eight to ten `ActivityEntry` rows with descending timestamps, describing plausible operator actions — narration uploaded, bulk script import created chapters, chapters published, audio replaced, book created.

## data/settings-defaults.ts

Typed defaults for the Settings screen: storage provider options with Supabase Storage as the default selection, bucket name, public CDN domain, max audio size in MB, accepted audio formats, accepted script formats, detect-duration toggle default `true`, default chapter access `"locked"`, free chapters at start, default maturity `"mature_17"`.

## lib/catalog.ts

Pure functions only. No React, no JSX.

- `countWords(text)` — the single source of truth for word counts
- `readTimeMinutes(wordCount)` — at a stated words-per-minute constant
- `formatDuration(seconds)` — `mm:ss`, or `h:mm:ss` past an hour
- `formatBytes(bytes)` — one decimal place, `MB` and `KB`
- `chapterMissingAsset(chapter)` — returns `MissingAsset` or null
- `bookChapterProgress(chapters)` — returns counts of chapters with script ready and total
- `bookAudioProgress(chapters)` — returns counts of chapters with audio ready and total
- `chaptersNeedingAttention(books, chapters)` — flat list of book, chapter and missing asset

Every ratio, count and total shown anywhere in this dashboard is **computed by these functions from the chapter rows**. Never store an aggregate on a book. This is why the design frames disagree with themselves about chapter counts, and computing removes the possibility entirely.

## Constraints

- Strict TypeScript. No `any`. Derive, do not duplicate.
- Every module in `data/` is typed against `types/`.
- Keep the dataset small enough to read in a diff and rich enough to exercise every state listed above.
- Do not create any component, page or route.
- Do not install anything.

## Verification

`npm run typecheck` passes. Add a short comment at the top of `data/mock-catalog.ts` stating it is a development fixture, that it is replaced by Supabase reads in a later prompt, and that aggregates must be computed via `lib/catalog.ts`.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
