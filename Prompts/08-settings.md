# 08-settings

Read AGENTS.md first and follow it strictly.

Implement the Settings screen exactly as shown in the attached design. Use the typed defaults from `data/settings-defaults.ts` and the existing design system utilities.

Route: `app/(dashboard)/settings/page.tsx`, replacing the placeholder from the app shell prompt.

All state on this screen is local in this prompt. Nothing persists, nothing connects to a real service. Persistence lands in a later prompt.

## Header

Breadcrumb `Settings`. Page title `Settings` at 24px / 600. Ember `Save changes` button right-aligned on the title row — the single primary button on this screen. It validates and toasts via `sonner`.

## Layout

A single scrolling column of cards, capped at **720px max width**, left-aligned within the content area. 24px gap between cards.

Every card carries a heading at 16px / 600 and a 12px `muted` descriptive sub-line directly beneath it, before its fields. Each field is a field group — label, control, helper line beneath in 12px `muted`.

## 1 · Account

Sub-line: `Your operator identity and authentication credentials.`

Read-only rows, label above value, no input boxes:

- `Name` — the operator name
- `Email` — in mono
- `Role` — a labelled status pill reading `Admin`

Then a `Change password` link in `muted`, underlined.

In this prompt these values come from `data/settings-defaults.ts`. The Clerk prompt replaces them with the real session user.

## 2 · Storage

Sub-line: `Direct object store configuration for chapter scripts and audio files.`

| Field             | Control                | Helper line                                            |
| ----------------- | ---------------------- | ------------------------------------------------------ |
| Storage provider  | select                 | `Primary high-throughput, S3-compatible storage tier.` |
| Bucket name       | text input, mono value | `Target object container name.`                        |
| Public CDN domain | text input, mono value | `Prefix for cover and audio URLs served to the app.`   |

Beneath the fields, a muted outline `Test connection` button with, to its right, a `status-ok` check and the label `Connected`.

`Test connection` is required and must stay on this screen. It is the fastest diagnosis when audio will not play in the mobile app. In this prompt it simulates a check with a brief `Testing…` state, then resolves to a `Connected` success state, and also supports rendering a `destructive` failure state with a message — build both, and wire the success path by default.

Provider options come from `data/settings-defaults.ts`, with **Supabase Storage selected by default**.

## 3 · Upload defaults

Sub-line: `Guard rails applied to browser upload operations.`

| Field                               | Control                                                     | Helper line                                           |
| ----------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Max audio file size                 | number input with a trailing `MB` suffix inside the control | `Maximum allowed size for narration audio uploads.`   |
| Accepted audio formats              | removable tag chips                                         | `Audio formats accepted at chapter upload dropzones.` |
| Accepted script formats             | removable tag chips                                         | `Manuscript text formats parsed during ingestion.`    |
| Detect audio duration automatically | toggle, default ON                                          | `Adds fallback to manual entry if detection fails.`   |

Format chips render as mono tags with an `×` remove affordance, matching the Genres control pattern from the Book editor. Provide an inline way to add a format back — a small `+ Add format` affordance inside the container.

## 4 · Publishing defaults

Sub-line: `Cataloging access control rules and default chapter settings.`

| Field                          | Control                                    | Helper line                                                 |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| Default chapter access         | segmented control `Free` / `Locked`        | `Initial paywall state assigned to newly created chapters.` |
| Free chapters at start of book | number input                               | `Chapters below this number are always free.`               |
| Default maturity               | segmented control `General` / `Mature 17+` | `Applies content advisory gate across mobile reader apps.`  |

`Locked` is the default selection on the first control. `Mature 17+` is the default on the second. Both render **dark-filled with light text** when selected; the unselected option is white with a 1px `border` border.

## 5 · Team

Sub-line: `Operators with access to publish and edit catalog contents.`

A table with columns `NAME`, `EMAIL`, `ROLE`, `ACTION`. Name in `text`, email in mono, role as a labelled status pill, action as a `Remove` link in `muted`.

Beneath the table, a muted outline `Invite member` button.

Rows come from `data/settings-defaults.ts`. `Remove` and `Invite member` render and are wired to local state only — removal updates the local list, invite opens a dialog with an email input and a role select that closes without effect.

## 6 · Danger zone

A card with a 1px `destructive` border and a heading in `destructive` reading `Danger zone`.

One row: label `Delete all seed data` on the left with a 12px `muted` line beneath reading `Removes test books, chapters and uploaded files. Cannot be undone.`, and a right-aligned outlined `destructive` button reading `Delete seed data`.

The button opens a confirmation dialog requiring the operator to type `delete seed data` before the confirm action enables. The confirm action closes the dialog and toasts; it deletes nothing in this prompt.

## States

- **Loading** — skeletons shaped like the six cards. Not a spinner.
- **Unsaved changes** — `Save changes` disabled until the form is dirty and valid; inline field errors on invalid submit.
- **Connection test** — idle, testing, connected, failed. All four rendered.
- **Empty team** — a single muted line inside the card with the `Invite member` action.

## Overrides — deviate from the attached design here

- The frame shows storage provider **`Cloudflare R2`** with bucket `novelnow-media-prod` and CDN domain `https://cdn.novelnow.internal`. Provider selections, bucket names and CDN domains are placeholder per AGENTS.md. Build the select with options from `data/settings-defaults.ts` and **Supabase Storage as the default**, since that is this project's storage layer.
- The frame's Team table renders a **toggle control inside the `ROLE` column** on the `Marcus Ray` row while the other two rows show pills. That is a generator artifact. All rows render a labelled role pill.
- The frame's `Delete seed data` button label **wraps and overflows its button**. Size the button to its label on one line.
- The frame's `Test connection` button label wraps across two lines. Keep it on one line.
- All content in the frame is placeholder — `Lead Operator`, `operator@novelnow.internal`, `Elena Vance`, `Marcus Ray`, `100`, the format chip sets, `3`. Every value comes from `data/settings-defaults.ts`.
- Confirm both segmented controls render with the **correct option filled** — `Locked` and `Mature 17+`. This is a known defect source across this project's frames.

## Constraints

- Server Component for the page shell. Client Components for the form sections that need interactivity.
- One `react-hook-form` instance with a schema covering the whole screen, so `Save changes` reflects dirty state across all cards.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- Exactly one ember button on this screen — `Save changes`. `Test connection` and `Invite member` are muted outline; `Delete seed data` is outlined destructive.
- Do not add API key fields, webhook URLs, secret inputs, a regenerate-token action, environment switchers, a theme switcher, notification preferences, an audit log, or usage and billing readouts. None are in the design, and secrets never belong in a browser form.
- Do not create any Supabase client or Server Action in this prompt.
- Verify the 720px column cap holds and that no card stretches to the full 1040px content width before finishing.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

@"/c:/Users/PC/Desktop/story-app-dashboad/material/5.png"
