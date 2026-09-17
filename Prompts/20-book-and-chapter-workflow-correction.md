# 20-book-and-chapter-workflow-correction

Read AGENTS.md first. Then read this entire file before writing a single line of code.

This file supersedes parts of AGENTS.md and parts of prompts 04, 05, 10, 12, 14 and 18.
Where this file and AGENTS.md disagree, this file wins — and your first task is to remove
the disagreement from AGENTS.md. Do not implement against a stale AGENTS.md.

================================================================================
§0 · EXECUTION PROTOCOL — FOLLOW IN ORDER, DO NOT SKIP AHEAD
================================================================================

§0.1 Execute the numbered sections strictly in this order:

Step 1 → §1 Update AGENTS.md
Step 2 → §2 STOP. Report the AGENTS.md diff. Wait for approval.
Step 3 → §3 Additive migration + regenerate types
Step 4 → §4 Server actions
Step 5 → §5 Pure functions (lib/manuscript.ts)
Step 6 → §6 Unify the book editor (create + edit)
Step 7 → §7 Book-level access default field
Step 8 → §8 Manuscript card
Step 9 → §9 Chapters card header
Step 10 → §10 Chapter creation page
Step 11 → §11 Inline row upload behaviour
Step 12 → §12 Screenshot defect fixes
Step 13 → §13 States audit
Step 14 → §14 Verification

§0.2 After each step, write one line to your summary naming the files you touched.
Do not batch the summary at the end. Do not narrate progress beyond those lines.

§0.3 §2 is a hard stop. Do not begin §3 until the AGENTS.md diff has been approved.
This is the only stop in the run. Everything after §2 runs to completion.

§0.4 Four decisions were open in review. They are now BINDING DEFAULTS. Implement them
as written. Do not re-raise them, do not implement alternatives, do not ask.

     D1  Access label stays "Locked", not "Premium".
         Reason: the DB enum is chapter_access ('free' | 'locked'), the mobile paywall
         copy says locked, and the rewarded-ad flow says "Unlock this chapter". A
         "Premium" label would make admin and app describe one state with two words.

     D2  Book-level audiobook upload is NOT built.
         Reason: a single audio file cannot be reliably split into chapter tracks; the
         mobile player queues one track per chapter via react-native-track-player, and
         read/listen parity stores an audio position scoped to a chapter id. A whole-book
         file breaks parity, which AGENTS.md ranks above every other feature.
         Narration is per-chapter only. Record this in AGENTS.md so it is not re-proposed.

     D3  Bulk script import is MOVED, not removed.
         It leaves the book editor header. It remains at /uploads/bulk-import, remains
         linked from the Seed import card on /uploads, and gains a link on the chapter
         creation page. Reason: seeding an 85–200 chapter serial by hand contradicts the
         throughput goal in AGENTS.md. Prompts 10 and 18 both depend on it.

     D4  PDF is NOT an accepted script format. Accepted formats remain .docx, .txt, .md.
         Reason: PDF encodes fixed page layout rather than document structure, so
         extraction bleeds headers, footers, page numbers and column breaks into the
         prose and corrupts hyphenated line breaks. The mobile reader reflows text at
         three type sizes and stores a character offset for parity; corrupted extraction
         silently corrupts every bookmark in the chapter.

§0.5 If you find a contradiction this file does not resolve, STOP and report it.
Do not resolve it yourself. Do not guess a product decision.

§0.6 THE GOVERNING RULE for this whole prompt:

     **A file upload requires a saved parent row.**

     Every storage path embeds the owning row id — covers/<bookId>/<uuid>.jpg,
     scripts/<bookId>/<chapterId>/<uuid>.docx, audio/<bookId>/<chapterId>/<uuid>.m4a —
     and Supabase mints a signed upload URL for that exact path, file name included.
     An unsaved book and an unsaved chapter therefore cannot receive files.

     FORBIDDEN workarounds: temp or placeholder paths, a staging bucket, client-side
     file buffers held across a navigation, deferred upload queues, optimistic row ids.
     Instead surface the constraint in the UI using the locked-card pattern in §6.3.

================================================================================
§0.7 · DESIGN ASSETS — READ THIS CAREFULLY
================================================================================

There are NO design frames for the new surfaces in this prompt. Do not wait for them,
do not ask for them, and do not treat their absence as a blocker.

§0.7.1 Surfaces that ALREADY EXIST in the running app. Open them in the browser and
match what is there. They are your fidelity target for anything you modify:

         /books                                 Books list, overflow menu
         /books/new                             current details-only create form
         /books/<id>                            populated editor, chapters table
         /books/<id>/chapters/<n>               chapter editor, script + narration cards
         /uploads/bulk-import                   preview table you will mirror in §8.3
         /settings                              select, segmented and toggle patterns

§0.7.2 Surfaces with NO frame. Build them from §17 by composing prompt-01 primitives and
the card patterns already in the app:

         Default chapter access select          §7
         Manuscript card                        §8
         Locked-card state (3 instances)        §6.3
         Chapter creation page                  §10
         Chapters card header + sub-line        §9
         Manuscript split preview table         §8.3
         ?focus= arrival outline                §11.2

§0.7.3 FORBIDDEN when no frame exists: new colours, new type sizes, new radii, new
spacing values, new shadows, new component libraries, new icon sets, invented
layouts. Every pixel of a new surface must trace to an existing token from
prompt 01 or an existing card pattern in the app. If you cannot derive a value,
STOP and report it rather than choosing one.

§0.7.4 If a §12 defect is not reproducible in the running app, report that instead of
changing code. Each §12 item is described in words; the description is the spec.

================================================================================
§1 · STEP 1 — UPDATE AGENTS.md
================================================================================

Make exactly the edits below. Add nothing else. Remove nothing else.

§1.1 Screen inventory
a. Merge the A3 Book editor entry and the separate New book entry into one entry:
"A3 Book editor (create and edit)". Describe the shared component and the
create/edit mode table from §6.2.
b. DELETE the rule stating the Chapters card is hidden in new-book mode.
c. In its place add the governing rule (§0.6) and the locked-card pattern (§6.3).
d. Add a new entry "A4a Chapter creation" describing §10.
e. Update the A3 chapters card header actions to the single "Add chapter" button and
the computed sub-line from §9.2.
f. Add "Manuscript" to the A3 card list with the split behaviour and the two-section
minimum from §8.

§1.2 Data model
a. Add books.default_chapter_access to the schema section.
b. Record D2 verbatim, including the parity reason.

§1.3 Project rules — add two numbered rules
a. The governing rule from §0.6, including the forbidden workarounds list.
b. The single-upload-surface rule from §11.

§1.4 Glossary — new short section
a. free / locked — the chapter_access enum values and the words used in BOTH admin
and app copy. Per D1 these are the only words for this concept.
b. script — chapter prose.
manuscript — a whole-book document that is split into scripts.
narration — chapter audio.
Never use "audiobook" for a chapter file. Never use "document" for a script.

§1.5 Script formats
Record D4: accepted script formats are .docx, .txt, .md. PDF is excluded, with the
reason. This applies to the Chapter editor, the Manuscript card, and bulk import.

§1.6 Known defects
Replace the stale entries with the five items in §12. Mark each fixed as you fix it.

§1.7 Design assets
Record that A3 create mode, A4a, and the Manuscript card have no design frames and are
governed by §0.7.3 and §17: new surfaces derive every value from existing tokens and
card patterns, and an underivable value is reported rather than chosen.

§1.8 Prompt series notes
Record that prompt 20 supersedes: prompt 04's disabled overflow menu items, prompt 05's
new-book mode and chapters card header, the book-editor entry point referenced by
prompts 10 and 18, and that it adds one column to prompt 12's schema.

================================================================================
§2 · STEP 2 — HARD STOP
================================================================================

Report the complete AGENTS.md diff, line by line. List every line added, changed and
removed. Then wait. Do not start §3 until approved.

================================================================================
§3 · STEP 3 — MIGRATION
================================================================================

§3.1 Add ONE additive migration under supabase/migrations/. Do not edit prompt 12's
migration file. Include the down path.

       alter table books
         add column default_chapter_access chapter_access not null default 'locked';

§3.2 Regenerate types/database.ts with the Supabase CLI. Never hand-edit it.

§3.3 Reconcile types/catalog.ts so Book carries defaultChapterAccess, derived from the
generated row type. Keep the existing discriminated unions for CoverAsset,
ScriptAsset and AudioAsset.

§3.4 No other schema change. No new tables. No new columns. No enum changes.

================================================================================
§4 · STEP 4 — SERVER ACTIONS
================================================================================

requireAdmin() is the FIRST STATEMENT in every action. Validate against a schema before
touching Supabase. Never import lib/supabase-admin.ts here — all writes go through the
Clerk-token client so RLS applies. Return typed discriminated results, never throw to
the client.

§4.1 createBook
a. accepts defaultChapterAccess
b. returns the new book id so the client can redirect
c. writes one activity_log entry, past tense, naming the book
d. revalidates /books and /

§4.2 updateBook
a. accepts defaultChapterAccess
b. otherwise unchanged from prompt 14

§4.3 createChapter
a. accepts an optional scriptText for prose pasted before the row exists
b. when access is not supplied, resolve it:
number <= app_settings.free_chapters_at_start ? 'free' : books.default_chapter_access
c. returns the created chapter number for the redirect
d. keeps the typed duplicate_number failure from prompt 14 carrying the taken number
e. revalidates /books/<bookId>, /books, /

§4.4 importManuscript — new
a. input: bookId, extracted text
b. calls splitManuscript (§5), then the prompt-18 row-creation path
c. writes exactly ONE summary activity_log entry for the batch
d. revalidates /books/<bookId>, /books, /

§4.5 Manuscript split and bulk import MUST share the prompt-18 row-creation path. Two
implementations of "create N chapters from parsed sections" is not acceptable. If
the prompt-18 code is not currently extractable, extract it before writing §4.4.

================================================================================
§5 · STEP 5 — PURE FUNCTIONS
================================================================================

§5.1 New file lib/manuscript.ts exporting:

       splitManuscript(text: string): ManuscriptSplit

     Detects chapter headings at line start:
       - "Chapter 12" / "chapter 12" / "CHAPTER 12"
       - "CHAPTER TWELVE" (spelled numbers one through fifty)
       - "12." and "12 -" and "12 —"
       - markdown "# " or "## " heading lines
     Returns detected sections (number, title, body) plus a confidence flag per section.

§5.2 Reuse extractScriptText from lib/script-text.ts (built in prompt 18) for the file
read and normalisation. Do not write a second normaliser.

§5.3 No React, no JSX, no I/O, no Supabase in lib/manuscript.ts. Deterministic: the same
input always produces the same output.

================================================================================
§6 · STEP 6 — UNIFY THE BOOK EDITOR
================================================================================

§6.1 Extract the whole editor into components/books/book-editor.tsx taking:

       type BookEditorMode =
         | { kind: "create" }
         | { kind: "edit"; book: Book; chapters: Chapter[] }

     Both routes render it:
       app/(dashboard)/books/new/page.tsx        → mode { kind: "create" }
       app/(dashboard)/books/[bookId]/page.tsx   → mode { kind: "edit", … }

     Delete the standalone new-book layout. There is now one design in two states.

§6.2 The ONLY differences between modes:

       field            create                edit
       ---------------------------------------------------------------
       breadcrumb       Books / New book      Books / <title>
       page title       New book              <book title>
       primary button   Create book           Save
       cover card       locked                live
       manuscript card  locked                live
       chapters card    locked, VISIBLE       live

     Layout, card order, field order, helper lines, dimensions and spacing are IDENTICAL
     in both modes. Nothing is hidden in create mode. The operator sees the whole shape
     of a book on first visit.

§6.3 LOCKED-CARD PATTERN
A locked card renders its real heading, real sub-line and real empty-state frame at
full opacity, with controls disabled, and ONE muted 12px line where the card's
primary affordance would sit:

       Cover:      "Save the book first to upload a cover."
       Manuscript: "Save the book first to upload a manuscript."
       Chapters:   "Save the book first to add chapters."

     FORBIDDEN: overlays, blur, reduced opacity on the whole card, tooltip-only
     explanation, hiding the card. The reason is always visible as text.

§6.4 CREATE → EDIT TRANSITION
Create book validates, calls createBook, and on success: 1. toast "Draft created. Add chapters below." 2. router.replace("/books/<newId>") — REPLACE, not push, so Back returns to
/books rather than an empty create form 3. the Cover, Manuscript and Chapters cards unlock in place

     The form must not reset and must not flash a loading state during the transition.
     If that is unavoidable with the current structure, STOP and flag it. Do not ship a
     visible flash.

================================================================================
§7 · STEP 7 — BOOK-LEVEL ACCESS DEFAULT
================================================================================

§7.1 Add "Default chapter access" to the Book details card, positioned immediately after
Maturity and immediately before Status.

§7.2 Control: Select with exactly two options — Free, Locked (per D1).
Default value: app_settings.default_chapter_access.
Helper line: "Applied to new chapters in this book. Individual chapters can
override it."

§7.3 Every chapter created inside this book — manually, by manuscript split, or by bulk
import — inherits this value unless app_settings.free_chapters_at_start places the
chapter inside the free run.

================================================================================
§8 · STEP 8 — MANUSCRIPT CARD
================================================================================

§8.1 New card in the right column, below Cover thumbnail.
Heading: "Manuscript"
Sub-line: "Upload one document and split it into chapters."
Constraint line: "DOCX, TXT or MD · max 10 MB"
Locked in create mode per §6.3. Compose per §17.2.

§8.2 Accepts a single .docx, .txt or .md file. No PDF (D4). Upload goes browser-direct to
a signed URL at scripts/<bookId>/manuscript/<uuid>.<ext>. Never set x-upsert.

§8.3 On upload: extract with extractScriptText, split with splitManuscript, render a
preview table per §17.6 — CHAPTER # | TITLE | WORDS | STATUS — with confirm and
discard actions.

§8.4 If fewer than two sections are detected, do NOT import. Render:
"No chapter breaks found. Use bulk import with one file per chapter instead."
plus a link to /uploads/bulk-import.

§8.5 Confirming calls importManuscript (§4.4). Access resolves per §7.3. Exactly one
activity_log entry for the batch.

§8.6 Do not build a book-level audio drop (D2).

================================================================================
§9 · STEP 9 — CHAPTERS CARD HEADER
================================================================================

§9.1 Remove BOTH existing header buttons — "Upload scripts in bulk" and "+ Add chapter".
Replace with ONE primary-outline button: "Add chapter" →
/books/<bookId>/chapters/new. Geometry per §17.5.

§9.2 Remove the sub-line "Drop a folder of .txt or .docx files — chapters are matched by
filename." Replace with, computed at render:
"<n> chapters · <n> with text · <n> with narration"

§9.3 Bulk import stays reachable at /uploads/bulk-import, linked from the Seed import
card on /uploads and from the chapter creation page (§10.4) — per D3.

================================================================================
§10 · STEP 10 — CHAPTER CREATION PAGE
================================================================================

§10.1 New route: app/(dashboard)/books/[bookId]/chapters/new/page.tsx
Compose the layout per §17.4.

§10.2 Extract the chapter editor into components/chapters/chapter-editor.tsx taking:

        type ChapterEditorMode =
          | { kind: "create"; bookId: string; nextNumber: number;
              defaultAccess: ChapterAccess }
          | { kind: "edit"; chapter: Chapter; neighbours: ChapterNeighbours }

§10.3 Create mode:
a. breadcrumb "Books / <book title> / New chapter", single separator
b. page title "New chapter"
c. primary button "Create chapter"
d. Chapter settings card LIVE, pre-filled with the next available number and the
book's default_chapter_access
e. Chapter script card LOCKED: "Save the chapter first to upload a file." BUT the
prose textarea stays EDITABLE — pasting text directly is a valid path needing no
file. Only the file row and Choose file are disabled.
f. Narration audio card LOCKED: "Save the chapter first to upload audio."
g. prev/next navigation buttons HIDDEN, not disabled

§10.4 Below the settings card, a muted line and link:
"Adding many chapters? Use bulk import." → /uploads/bulk-import

§10.5 Create chapter validates, calls createChapter persisting any pasted prose as
script_text, toasts "Chapter <nn> created.", then
router.replace("/books/<bookId>/chapters/<number>") where both uploads are live.

§10.6 Edit mode is UNCHANGED from prompts 06, 16 and 17.

================================================================================
§11 · STEP 11 — INLINE ROW UPLOADS
================================================================================

§11.1 The "+ Upload text" and "+ Upload audio" buttons inside chapter rows STAY and
continue to navigate to the chapter editor.

§11.2 Add a search param so the target card is scrolled to and outlined on arrival:
?focus=script and ?focus=audio. Treatment per §17.7.

§11.3 SINGLE-UPLOAD-SURFACE RULE: do not build in-row uploading. Two upload surfaces per
asset means two progress implementations, two failure surfaces, and two places for
the prompt-16 TUS conflict handling to drift.

================================================================================
§12 · STEP 12 — DEFECT FIXES
================================================================================

Each defect below is specified in words. Reproduce it in the running app first. If it is
not reproducible, report that instead of changing code (§0.7.4).

§12.1 Chapters table column misalignment.
The Text, Audio and Access header cells sit far right of the values they label —
word counts, durations and access pills are all bunched under Title. Header and
body must share ONE column definition. The action column is fixed-width and
right-aligned so ⋯ and > sit on a single vertical axis for every row; they
currently jitter horizontally row to row.

§12.2 Nested scroll container.
The chapters table has its own inner scrollbar inside the page scroll. Remove it.
Long lists virtualise within the page scroll with a sticky table header. Never a
second scrollbar.

§12.3 Overflow menu escapes the card.
The Books list ⋯ menu renders past the right edge of the card and the viewport on
the last rows. Use collision-aware placement so it flips left when it would
overflow. Apply the same fix to the chapters table menu.

§12.4 Cover fixture contradicts accepted formats.
A seed cover is named "…-cover.png" while the constraint line reads "JPG or WebP".
The covers bucket MIME allowlist from prompt 12 is JPEG and WebP only, so that file
could never have uploaded. Fix the seed fixture to a .jpg name. Do NOT widen the
allowlist.

§12.5 Overflow menu items.
"Add chapter" and "Delete book" were disabled placeholders in prompt 04 and were
enabled in prompt 14. Confirm both are live and point Add chapter at
/books/<id>/chapters/new.

================================================================================
§13 · STEP 13 — STATES
================================================================================

Every state below must be reachable and correct:

Create mode, untouched Create book disabled; Cover, Manuscript and Chapters
locked with their reason lines visible
Create mode, valid Create book enabled
Creating pending label, fields read-only, no double-submit
Created toast, replace-navigation, cards unlock in place, no flash
Edit mode, clean Save disabled
Edit mode, dirty Save enabled
Manuscript preview preview table with confirm and discard
Manuscript, no breaks §8.4 message and bulk-import link, no import offered
Manuscript, unreadable "No readable text found in this file."
Chapter create, collision field error on Chapter number naming the taken number
Book with zero chapters "No chapters yet." plus Add chapter, plus the muted
bulk-import line
RLS rejection "You don't have permission to change this." Not retryable.
Network failure "Couldn't reach the server. Try again." Retryable.

Route all action-result-to-copy mapping through lib/action-messages.ts. Do not scatter
these strings.

================================================================================
§14 · STEP 14 — VERIFICATION
================================================================================

Run every check. Fix every failure before reporting done.

1.  Click New book from the Books list. The screen shows Book details, Cover, Manuscript
    and Chapters, with the last three locked and each showing its reason as readable text.
2.  Fill the details, set Default chapter access to Locked, press Create book. The URL
    becomes /books/<id>, the cards unlock without the form resetting, and Back goes to
    /books rather than an empty create form.
3.  Press Add chapter. The settings card is pre-filled with number 1 and the book's
    default access; the script textarea accepts pasted prose; both file affordances are
    disabled with visible reasons.
4.  Paste prose, press Create chapter. Redirect lands on the real chapter editor, the
    pasted text is persisted, the word count is correct, and both uploads are live.
5.  Upload real narration on that chapter. The chapters row, the card sub-line counts and
    the Dashboard tiles all update with no manual refresh.
6.  Upload a genuine multi-chapter .docx to Manuscript. The split numbers correctly,
    confirming creates chapters with the book's default access, the free run from
    app_settings is respected, and exactly ONE activity entry is written.
7.  Upload a single-chapter .docx to Manuscript. It refuses and points to bulk import.
8.  Open the Books list ⋯ menu on the last row — it flips inside the card. Open a chapters
    table with 40 rows — one scrollbar, sticky header, aligned columns, ⋯ and > on a fixed
    axis.
9.  Create a chapter with an existing number — field-level error, no 500.
10. Confirm /uploads/bulk-import is still reachable from /uploads and from the chapter
    creation page.
11. Screenshot the create-mode book editor beside the edit-mode book editor at 1440×1024.
    Card positions, sizes and spacing must be identical. Do the same for both chapter
    editor modes.
12. Sign in as a non-admin and confirm the Not authorised page, not an error boundary.
13. Run npm run lint and npm run typecheck. Fix everything.

================================================================================
§15 · CONSTRAINTS — APPLY THROUGHOUT
================================================================================

1.  Install nothing. mammoth is already approved; splitManuscript is string handling.
2.  requireAdmin() is the first statement in every server action.
3.  Never set x-upsert. Every object goes to a fresh immutable path.
4.  Never import lib/supabase-admin.ts from a server action.
5.  No file body passes through the Next.js server on upload — signed URL, browser-direct.
6.  No happy-path visual change beyond what this file specifies. No new colours, no
    shadows, no gradients, max 1px borders, 8px card radius, 40px inputs, 48px table
    rows, 1040px page container, 8px spacing grid.
7.  Exactly ONE primary ember button per screen: Create book / Save on the book editor,
    Create chapter / Save chapter on the chapter editor. The narration play button
    remains the documented exception.
8.  Do not touch the Dashboard, Settings, Uploads queue, Clerk auth, the mobile app, or
    prompt 12's migration file.
9.  Strict TypeScript. Mode props and action results are discriminated unions. No any.
    No @ts-ignore without a justifying comment.
10. Desktop only at 1440×1024. No mobile breakpoints.
11. Server Components fetch data; Client Components receive props. The editors are
    Client Components; the route pages are Server Components.

================================================================================
§16 · REFERENCE
================================================================================

createSignedUploadUrl — path is required and includes the file name:
https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
mammoth.js:
https://github.com/mwilliamson/mammoth.js

================================================================================
§17 · COMPOSITION SPEC FOR SURFACES WITH NO FRAME
================================================================================

Every rule here derives a new surface from something already built. Where this section
says "identical to", copy the existing implementation rather than re-deriving values.

§17.1 Default chapter access select (§7)
Structurally identical to the existing Status select in the Book details card: same
40px height, 8px radius, 1px border, full left-column width, same label/control/helper
vertical rhythm, same 8px gap between label and control. Only the label, the two
options and the helper text differ.

§17.2 Manuscript card (§8)
Structurally identical to the existing Cover thumbnail card, minus the image preview: - 16px/600 heading, 12px muted sub-line beneath it - dashed-border frame, full card width, 120px tall (the cover frame is 2:3 and
taller; a document has no aspect ratio, so use a fixed 120px) - inside the empty frame, centred: 12px muted two-line prompt, then a
Choose file outline button — identical to the cover empty state - ready state: 13px mono file name, muted "·" separator, formatted size via
formatBytes, then Replace (muted) and Remove (destructive) text links on the
following line — identical to the cover ready state - constraint line last, 12px muted
Card sits directly below Cover thumbnail with the established 24px inter-card gap.

§17.3 Locked-card state (§6.3)
Not a new visual treatment. Take the card's normal empty state and: - keep every border, radius, padding and heading exactly as the live version - keep full opacity on the card, the heading, the sub-line and the frame - apply the existing disabled treatment to interactive controls only - replace the primary affordance (Choose file, Add chapter) with the reason line:
12px, muted, positioned exactly where that affordance sat, same alignment
The card's outer dimensions must be identical locked and unlocked so nothing shifts
on unlock (§6.4).

§17.4 Chapter creation page (§10)
Identical layout to the existing chapter editor: two columns at 2:1 with a 24px gap,
Chapter script on the left, Narration audio then Chapter settings stacked on the
right, same card order, same field order inside settings, same header row with
breadcrumb, title and primary button. Differences are only the copy in §10.3, the two
locked cards, the hidden prev/next buttons, and the bulk-import line in §10.4.
Where the edit page shows the "Saved 2 min ago" status line, create mode shows
nothing — do not substitute alternative copy.

§17.5 Chapters card header (§9)
Keep the existing header row geometry: heading left, action right, sub-line beneath the
heading. One primary-outline button replaces the previous two, at the same right edge
and same 40px height. The computed sub-line occupies the removed sub-line's exact slot
in the same 12px muted style.

§17.6 Manuscript split preview table (§8.3)
Reuse the bulk-import preview table implementation. Same shadcn Table, same 48px rows,
same 12px/600 uppercase muted headers, same status pill variants. Columns are
CHAPTER # | TITLE | WORDS | STATUS — the bulk-import IMPORT checkbox and FILE columns
are omitted because a manuscript is a single file and every section imports.
Confirm and discard actions sit in the card footer above a 1px divider, confirm as the
card's only filled button.

§17.7 ?focus= arrival outline (§11.2)
On arrival with ?focus=script or ?focus=audio, scroll the target card into view and
apply a 1px primary border in place of its normal 1px border — no glow, no shadow, no
animation, no thickness change, so nothing reflows. Clear it on the first interaction
with that card or on the next navigation. Strip the param from the URL once consumed.

§17.8 When §17 is silent on a value, derive it in this order: the same card elsewhere in
the app, then the prompt-01 token table, then the 8px spacing grid. If all three
are silent, STOP and report the gap. Do not choose a value.
