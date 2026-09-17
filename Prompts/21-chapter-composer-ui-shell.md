# 21-chapter-composer-ui-shell

Read AGENTS.md first. Then read this entire file before writing code.

## §0 · SCOPE — UI SHELL ONLY

This prompt builds **UI shell only**. No data, no persistence, no uploads, no server
actions, no migration, no schema change.

Specifically FORBIDDEN in this prompt:

- any new or modified file under app/actions/
- any Supabase call, client creation, query or mutation
- any signed upload URL, TUS call, file read or file parse
- any migration or change to types/database.ts
- any real chapter creation

Every control you add holds local component state and nothing more. Buttons that would
persist show a toast and do nothing. This is the visual and interaction shell; wiring is
prompt 22.

## §0.1 · EXECUTION ORDER

Step 1 → §1 Update AGENTS.md, report the diff in your summary
Step 2 → §2 Insert the chapter composer row
Step 3 → §3 Chapter script card
Step 4 → §4 Narration audio card
Step 5 → §5 Chapter settings card
Step 6 → §6 Bulk import line
Step 7 → §7 Composer state matrix
Step 8 → §8 Add chapter button behaviour
Step 9 → §9 Mockup noise — do not replicate
Step 10 → §10 Verification

Write one summary line per step naming the files you touched. Do not batch at the end.

## §0.2 · DESIGN ASSETS

@"/c:/Users/PC/Desktop/story-app-dashboad/material/new-story-page-old-page.png"----------------what the app renders today
@"/c:/Users/PC/Desktop/story-app-dashboad/material/new-story-page-update.png"----------------the target — build toward this

Image 14 is correct as far as it goes: the unified book editor, the three locked cards,
the Default chapter access select and the computed chapters sub-line are all right. Do not
change any of it except where §8 says so.

Image 15 is the target. The only structural difference is a new two-column row inserted
between the Book details row and the Chapters card. That row is what you are building.

Image 15 is a mockup, not a rendered build. It contains four errors listed in §9. Match
its structure and card composition; do not copy the four errors.

## §1 · STEP 1 — AGENTS.md

Make exactly these edits so AGENTS.md stops contradicting this file:

§1.1 In the A3 Book editor entry, add the chapter composer to the card list, positioned
between the Book details row and the Chapters card. Describe it as one row at 2:1
containing Chapter script on the left, Narration audio and Chapter settings stacked
on the right.

§1.2 Amend the A4a Chapter creation entry: chapter creation now happens in the inline
composer on the book editor. The dedicated route /books/<id>/chapters/new is no
longer the entry point and is no longer linked from anywhere. Record that its removal
is pending a decision (§11, question 1) and that until then it stays in the codebase
unlinked.

§1.3 Record that /books/<id>/chapters/<n> remains the EDIT surface for an existing
chapter and is unaffected by this prompt.

§1.4 Extend the single-upload-surface rule: the composer is the only chapter-creation
surface. Do not add a second one.

§1.5 In Known defects, add the four §9 items as "mockup artifacts — do not implement",
so they are not reintroduced from image 15 later.

If you find a contradiction these five edits do not resolve, STOP and report it.

## §2 · STEP 2 — INSERT THE COMPOSER ROW

§2.1 Position: immediately below the row containing Book details / Cover / Manuscript,
immediately above the Chapters card. Same 24px vertical gap as the existing
inter-card spacing. Full page container width, 1040px max.

§2.2 Geometry: two columns at 2:1 with a 24px gap — the same ratio and gap as the Book
details row above it, and the same as the existing chapter editor. Left column holds
Chapter script. Right column holds Narration audio, then Chapter settings, stacked
with a 24px gap.

§2.3 Reuse the existing chapter editor's card implementations wherever possible. If
components/chapters/chapter-editor.tsx already contains these three cards, extract
them into components/chapters/ so the composer and the edit page render the same
code. Do not fork them. Two implementations of the script card is not acceptable.

§2.4 The composer row appears in BOTH book editor modes, create and edit, per §7.

## §3 · STEP 3 — CHAPTER SCRIPT CARD

§3.1 Heading "Chapter script", 16px/600. No sub-line.

§3.2 File row directly beneath the heading, on one line: the locked reason line on the
left at 12px muted, a "Choose file" outline button on the right, disabled. A 1px
divider below the row.

§3.3 Prose textarea below the divider. Full card width, minimum 280px tall, grows with
content, no inner scrollbar until it exceeds roughly 600px. Placeholder:
"Paste chapter prose here…". Monospace is wrong here — this is prose, use the body
sans at 14px with comfortable line height.

§3.4 Footer below the textarea: live word count at 12px muted, left aligned, computed
with countWords from lib/catalog.ts. Reads "0 words" when empty.

§3.5 The formatting toolbar from the edit-mode script card (B, I, H2, paste-as-plain)
is NOT in the composer. Do not add it. Flag if you believe it should be.

## §4 · STEP 4 — NARRATION AUDIO CARD

§4.1 Heading "Narration audio", 16px/600. No sub-line.

§4.2 Keeps its real dropzone frame — dashed border, full card width, same 120px height as
the Manuscript frame — with the frame's controls disabled and the reason line at
12px muted beneath it. This is the §17.3 locked-card pattern from prompt 20: the
frame stays visible at full opacity. Image 15 drops the frame; that is error 4 in §9.

§4.3 Constraint line last, 12px muted: ".m4a or .mp3 · max 100 MB". Read the limit from
data/settings-defaults.ts, do not hardcode the number.

## §5 · STEP 5 — CHAPTER SETTINGS CARD

§5.1 Heading "Chapter settings", 16px/600. No sub-line.

§5.2 Field order — Chapter number, Title, Access. This is deliberately NOT image 15's
order, which puts Title last. The existing chapter edit page uses number, title,
access, and AGENTS.md requires the composer and the edit page to share field order.
One screen's field order changing between create and edit is a defect, not a design.
Flag this if you disagree; do not silently follow the image.

§5.3 Chapter number: number input, 40px, pre-filled with the next available number —
highest existing chapter number + 1, or 1 when the book has none. Computed, never
hardcoded.

§5.4 Title: text input, 40px, empty by default.

§5.5 Access: segmented control, Free | Locked, matching the existing Maturity segmented
control exactly — same height, radius, border, and dark-filled selected state.
Default selection mirrors the book's Default chapter access value from the Book
details card above, live, so changing that select moves this control.
Helper line beneath: use the edit page's existing copy, "Locked chapters need an ad
view or a subscription." Image 15 shows different copy; keep the app consistent and
flag the divergence.

§5.6 Primary action at the bottom of this card: "Create chapter", ember, full card width.
In this prompt it validates locally, toasts "Chapter <nn> created." and clears the
composer. It creates nothing. Per §10 the constraint of one ember button per screen
now has two on this page — Create book and Create chapter. Flag it; do not resolve
it by removing either. The wiring prompt will settle it.

## §6 · STEP 6 — BULK IMPORT LINE

Directly below the Chapter settings card, outside any card: a 12px muted line,
"Adding many chapters? Use bulk import." with "bulk import" as a link to
/uploads/bulk-import. No button, no card, no icon.

## §7 · STEP 7 — COMPOSER STATE MATRIX

The composer has two states, driven by the book editor's mode.

§7.1 Book unsaved — create mode, the page in image 14:
All three cards render at full size with every control disabled. One reason line per
card, 12px muted, in the position §3.2, §4.2 and §5 specify:
Chapter script "Save the book first to add chapters."
Narration audio "Save the book first to add chapters."
Chapter settings "Save the book first to add chapters."
The prose textarea is disabled in this state. The Create chapter button is disabled.
Chapter number shows 1.

§7.2 Book saved — edit mode:
Chapter settings is live. The prose textarea is live — pasting text directly is a
valid path that needs no file. The two file affordances stay locked, now with the
chapter-level reason:
Chapter script "Save the chapter first to upload a file."
Narration audio "Save the chapter first to upload audio."
Create chapter is enabled once Title is non-empty and Chapter number is valid.

§7.3 Image 15 shows §7.2's copy on a page titled New book. That combination is
unreachable and is error 3 in §9. Render §7.1 on New book.

§7.4 Card outer dimensions must be identical in both states so nothing shifts when the
book is saved and the composer unlocks in place.

## §8 · STEP 8 — ADD CHAPTER BUTTON

§8.1 The "Add chapter" button in the Chapters card header no longer navigates. It scrolls
the composer into view and focuses the Title input.

§8.2 Apply the same 1px primary border treatment the ?focus= param uses, then clear it on
first interaction. No glow, no shadow, no animation, no border thickness change.

§8.3 In create mode the button stays disabled with the existing Chapters reason line.

§8.4 Leave /books/<id>/chapters/new in the codebase but remove every link to it. Do not
delete it in this prompt — see §11 question 1.

## §9 · STEP 9 — MOCKUP NOISE, DO NOT REPLICATE

Image 15 contains four errors. Build the correct behaviour, not the image.

1. Chapter number reads 13 on a book with zero chapters. Compute it: 1 here.
2. Six populated chapter rows appear under a sub-line reading
   "0 chapters · 0 with text · 0 with narration", on an unsaved book. Both cannot be
   true. A new book renders the empty state, "No chapters yet." Never hardcode those
   rows, those titles, those word counts, those durations or those access pills.
3. Chapter-level reason copy on a page where the book itself is unsaved. See §7.3.
4. The Narration audio card has no dropzone frame while Cover and Manuscript keep
   theirs. Give it the frame per §4.2.

## §10 · CONSTRAINTS

1.  UI shell only, per §0. No actions, no Supabase, no uploads, no migration.
2.  Install nothing.
3.  Derive every value from an existing token or an existing card in the app. No new
    colours, type sizes, radii, spacing values, shadows or icon sets. If you cannot
    derive a value, STOP and report it rather than choosing one.
4.  No change to the Book details card, the Cover card, the Manuscript card, the sidebar,
    the breadcrumb, the Dashboard, Settings, Uploads, or the mobile app.
5.  No change to the chapter edit page at /books/<id>/chapters/<n>, other than the §2.3
    extraction, which must leave it rendering identically.
6.  Flat surfaces, max 1px borders, 8px card radius, 40px inputs, 48px table rows, 24px
    inter-card gap, 1040px container, 8px spacing grid.
7.  Strict TypeScript. Composer state is a discriminated union on locked/live. No any.
8.  Route pages stay Server Components; the composer is a Client Component.
9.  Desktop only at 1440×1024.

## §11 · VERIFICATION

1.  Load /books/new. The page matches image 14 plus the new composer row, positioned
    between Book details and Chapters, every composer control disabled with its reason
    line visible, Chapter number reading 1, Chapters table empty.
2.  Load a saved book. The composer is live per §7.2: settings editable, textarea
    editable, both file affordances locked with chapter-level copy, Chapter number one
    higher than the book's highest existing chapter.
3.  Screenshot both at 1440×1024 and confirm the three composer cards occupy identical
    positions and sizes in each. Nothing may shift between states.
4.  Type prose into the textarea and confirm the word count updates live and reads
    "0 words" when cleared.
5.  Change Default chapter access in Book details and confirm the composer's Access
    segmented control follows it.
6.  Press Add chapter in the Chapters header on a saved book. The composer scrolls into
    view, Title takes focus, the outline appears and clears on first keystroke, and the
    URL does not change.
7.  Press Create chapter with a title entered. A toast appears, the composer clears, and
    no chapter row is created anywhere.
8.  Open /books/<id>/chapters/<n> and confirm it renders exactly as before the §2.3
    extraction.
9.  Confirm no file under app/actions/ was created or modified, and no Supabase call
    exists in any file you touched.
10. Run npm run lint and npm run typecheck. Fix everything.

## §12 · FLAG, DO NOT DECIDE

Report these in your summary. Do not resolve them.

1.  /books/<id>/chapters/new is now unlinked. Delete it, or keep it as a deep-link
    surface rendering the same composer?
2.  Two ember buttons now sit on the book editor — Create book and Create chapter. Which
    keeps ember?
3.  The formatting toolbar is absent from the composer's script card (§3.5) but present
    on the edit page. Intended, or should both have it?
4.  Image 15's Chapter settings field order and Access helper copy differ from the edit
    page; §5.2 and §5.5 followed the edit page instead.
