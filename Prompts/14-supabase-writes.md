# 14-supabase-writes

Read AGENTS.md first and follow it strictly.

Study every form and action across the dashboard that currently validates and toasts without persisting, then implement real mutations through Server Actions against the schema from prompt 12.

**Keep the existing UI and navigation exactly as they are.** Do not change any screen design, layout, copy or component structure. If a mutation cannot be wired without a UI change, ask me before implementing.

Metadata and text only in this prompt. **No file upload paths** — cover upload, audio upload and script upload keep their current local-state behaviour and land in prompts 15, 16 and 17. Bulk import confirm also stays as-is until prompt 18.

## Server Action layer

Add `app/actions/` with one module per entity. Every action:

1. Calls `requireAdmin()` from `lib/auth.ts` as its **first statement**, before touching arguments.
2. Validates its input against a schema. Never trust a client payload, even from a form you wrote.
3. Performs the mutation through the Supabase client built with the Clerk `accessToken` callback, so RLS applies. Do not reach for `lib/supabase-admin.ts` — if an action seems to need the service-role key, that is a signal the RLS policy is wrong, so stop and flag it.
4. Writes an `activity_log` row describing what happened.
5. Calls `revalidatePath` for every route whose displayed data changed.
6. Returns a typed result the form can render — success, or a field-level or form-level error. Do not throw raw Supabase errors at the UI.

| Action                | Called from                   |
| --------------------- | ----------------------------- |
| `createBook`          | Book editor, new book mode    |
| `updateBook`          | Book editor                   |
| `deleteBook`          | Books list overflow menu      |
| `createChapter`       | Book editor `Add chapter`     |
| `updateChapter`       | Chapter editor                |
| `updateChapterAccess` | Book editor row overflow menu |
| `deleteChapter`       | Book editor row overflow menu |
| `updateAppSettings`   | Settings                      |
| `deleteSeedData`      | Settings danger zone          |

## Revalidation map

Stale counts are the fastest way to lose an operator's trust in this tool, and because every ratio is computed from chapter rows, a chapter mutation changes what three other screens display. Get this right rather than revalidating one path and moving on.

| Mutation               | Revalidate                                               |
| ---------------------- | -------------------------------------------------------- |
| Book created           | `/books`, `/`                                            |
| Book updated           | `/books`, `/books/<id>`, `/`                             |
| Book deleted           | `/books`, `/`                                            |
| Chapter created        | `/books/<id>`, `/books`, `/`                             |
| Chapter updated        | `/books/<id>/chapters/<n>`, `/books/<id>`, `/books`, `/` |
| Chapter access changed | `/books/<id>`, `/books/<id>/chapters/<n>`                |
| Chapter deleted        | `/books/<id>`, `/books`, `/`                             |
| Settings updated       | `/settings`                                              |
| Seed data deleted      | every dashboard route                                    |

The Dashboard is on almost every row because its tiles and its queue derive from chapter asset state.

## Screen wiring

**Book editor — new book mode.** `Save` calls `createBook`, then redirects to `/books/<newId>` so the Chapters card becomes available. Apply the publishing defaults from `app_settings` as the initial maturity value. On failure, stay on the form and render the error.

**Book editor — existing book.** `Save` calls `updateBook`. Keep the disabled-until-dirty-and-valid behaviour. On success, reset the form's dirty state against the saved values so `Save` disables again. Render field-level errors inline against the offending field.

**Book editor — Add chapter.** Currently navigates to a chapter route for the next unused number. Change it to call `createChapter` with that number, an empty title and the default access from `app_settings`, then navigate to the created chapter. Creating a real row first means the Chapter editor is never asked to edit something that does not exist.

**Book editor — chapter row overflow menu.** The `Set free` / `Set locked` toggle and `Delete chapter` are currently rendered disabled. Enable them. The access toggle calls `updateChapterAccess` and updates optimistically. `Delete chapter` opens a confirmation dialog naming the chapter number and title, warning that its script text and its uploaded audio reference will be removed, then calls `deleteChapter`.

**Books list overflow menu.** `Add chapter` and `Delete book` are currently rendered disabled. Enable them. `Add chapter` behaves as above and navigates. `Delete book` opens a confirmation dialog naming the title and its chapter count, stating that all chapters are deleted with it, and requires typing the book title to enable confirm. Cascading away a 148-chapter serial deserves more friction than one click.

**Chapter editor.** `Save chapter` calls `updateChapter`, persisting chapter number, title, access and the edited script text. The header status line becomes truthful: `Unsaved changes` while dirty, and a real relative timestamp derived from the returned `updated_at` after a successful save. It must never display a saved time for a save that did not happen.

Changing chapter number must respect the `(book_id, number)` unique constraint. On collision, render a field-level error on the number input naming the conflicting chapter rather than surfacing a Postgres error string.

`Edit duration` now persists — it calls `updateChapter` with the new `audio_duration_seconds` and sets `audio_duration_source` to `'manual'`, so the card flips from `Detected` to `Edited`. This control must work even though audio upload is not yet implemented, because it is the manual fallback for detection that reports `Infinity` or `NaN`.

**Settings.** `Save changes` calls `updateAppSettings`, persisting the Storage, Upload defaults and Publishing defaults sections. Account and Team continue to read from Clerk and are not part of this mutation. `Test connection` stays simulated — a real connectivity check belongs with the upload work.

Team `Remove` and `Invite member` stay local-state-only, and the dialog still closes without effect. Operator provisioning happens in the Clerk Dashboard, and adding a Clerk write path here would be a privilege-escalation surface this tool does not need. Leave a comment saying so.

**Settings danger zone.** `Delete seed data` now genuinely deletes. Keep the existing type-to-confirm gate. `deleteSeedData` removes all books — chapters cascade — and clears `activity_log`. It must **also** delete the corresponding storage objects from the `covers`, `audio` and `scripts` buckets, or every subsequent seed leaves orphaned files accruing storage cost. If deleting storage objects requires a capability not available here, flag it rather than silently leaving the files.

## Activity log

Every action writes one row with the acting Clerk user id and a message matching the voice already on the Dashboard and Uploads activity cards — `Chapter 12 narration uploaded`, `Bulk script import — 8 chapters created`, and so on. Write messages in that same register: past tense, specific, no ceremony.

Log the mutation, not the intent. A failed mutation writes nothing.

## Optimistic updates

Use optimistic UI only for the chapter access toggle, where the change is a single boolean and instant feedback matters while working down a chapter list. Everything else waits for the server and then revalidates. Do not make forms optimistic — a book save that silently failed while showing success is worse than a save that took 300ms.

## States

- **Submitting** — the primary button shows a pending state and disables; the form stays interactive-disabled rather than unmounting.
- **Field error** — rendered inline against the field, from the action's typed result.
- **Form error** — rendered above the primary action, specific, with the operation named.
- **Conflict** — unique-constraint violations on chapter number render as a field error naming the conflict.
- **RLS rejection** — surfaces as an authorisation message, never as an empty success.
- **Success** — toast via `sonner`, form dirty state reset, affected routes revalidated.

## Constraints

- `requireAdmin()` first in every action, no exceptions.
- Schema validation on every action argument.
- Never import `lib/supabase-admin.ts` from a Client Component. Nothing here should need it at all.
- Do not implement cover, audio or script upload. Do not implement bulk import creation.
- Do not modify the schema. If a mutation needs a column or constraint that does not exist, stop and flag it.
- Do not add a client-side mutation library. Server Actions plus `revalidatePath`, per AGENTS.md.
- Do not modify any screen's layout, copy or component structure.
- Do not add a soft-delete flag, a revision history, an undo stack or an audit diff. Out of scope.

## Verification

Create a book, add three chapters, edit one chapter's text and number, toggle access on another, delete the third, then confirm the Books list ratio, the Dashboard tiles, the Dashboard queue and the Book editor chapters table all agree immediately without a manual refresh. Force a chapter-number collision and confirm it renders as a field error. Then run the seed-data delete and confirm both the rows and the storage objects are gone.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
