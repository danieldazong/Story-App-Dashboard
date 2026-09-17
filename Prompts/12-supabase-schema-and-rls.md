# 12-supabase-schema-and-rls

Read AGENTS.md first and follow it strictly.

Create the Supabase schema, RLS policies and storage buckets for the catalog, then generate the database types. No UI in this prompt. Do not replace any mock data read yet — that is the next prompt.

Deliver every change as a migration file under `supabase/migrations/` via the Supabase CLI. Do not apply schema changes by hand in the dashboard, because the mobile app codebase consumes this same database and needs the migrations in version control.

## Scope boundary

This prompt creates the **catalog** tables only — the content this dashboard authors. Reader-scoped tables (bookmarks, reading positions, unlock records, entitlement mirrors) belong to the NovelNow mobile app and are out of scope here. Do not create them. If the schema below needs a column to support a reader feature, flag it rather than adding it.

## Tables

Mirror the types already defined in `types/catalog.ts`. Where that file and this specification disagree, flag the conflict.

### `books`

| Column              | Type                                            | Notes                                                                  |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                | `uuid` primary key, default `gen_random_uuid()` |                                                                        |
| `title`             | `text not null`                                 |                                                                        |
| `author`            | `text not null`                                 |                                                                        |
| `short_description` | `text`                                          | max 160 enforced by a check constraint                                 |
| `synopsis`          | `text`                                          | max 600 enforced by a check constraint                                 |
| `genres`            | `text[] not null default '{}'`                  | values validated against the app's genre list at the application layer |
| `maturity`          | `maturity` enum `not null default 'mature_17'`  |                                                                        |
| `status`            | `book_status` enum `not null default 'draft'`   |                                                                        |
| `cover_path`        | `text`                                          | storage object path, null when no cover                                |
| `cover_file_name`   | `text`                                          |                                                                        |
| `cover_size_bytes`  | `bigint`                                        |                                                                        |
| `cover_width`       | `integer`                                       |                                                                        |
| `cover_height`      | `integer`                                       |                                                                        |
| `created_at`        | `timestamptz not null default now()`            |                                                                        |
| `updated_at`        | `timestamptz not null default now()`            | maintained by trigger                                                  |

### `chapters`

| Column                   | Type                                                     | Notes                                          |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------- |
| `id`                     | `uuid` primary key, default `gen_random_uuid()`          |                                                |
| `book_id`                | `uuid not null` references `books(id) on delete cascade` |                                                |
| `number`                 | `integer not null`                                       |                                                |
| `title`                  | `text not null`                                          |                                                |
| `script_text`            | `text`                                                   | null means script missing                      |
| `script_file_name`       | `text`                                                   |                                                |
| `script_path`            | `text`                                                   | original manuscript in the `scripts` bucket    |
| `audio_path`             | `text`                                                   | null means audio missing                       |
| `audio_file_name`        | `text`                                                   |                                                |
| `audio_size_bytes`       | `bigint`                                                 |                                                |
| `audio_duration_seconds` | `integer`                                                |                                                |
| `audio_duration_source`  | `duration_source` enum                                   | `'detected'` or `'manual'`, null when no audio |
| `access`                 | `chapter_access` enum `not null default 'locked'`        |                                                |
| `created_at`             | `timestamptz not null default now()`                     |                                                |
| `updated_at`             | `timestamptz not null default now()`                     | maintained by trigger                          |

Unique constraint on `(book_id, number)`. Index on `book_id`. Index on `(book_id, number)` for ordered reads.

### `activity_log`

| Column       | Type                                                | Notes         |
| ------------ | --------------------------------------------------- | ------------- |
| `id`         | `uuid` primary key, default `gen_random_uuid()`     |               |
| `actor_id`   | `text not null`                                     | Clerk user id |
| `message`    | `text not null`                                     |               |
| `book_id`    | `uuid` references `books(id) on delete set null`    |               |
| `chapter_id` | `uuid` references `chapters(id) on delete set null` |               |
| `created_at` | `timestamptz not null default now()`                |               |

Index on `created_at desc`. This backs the Recent activity cards on the Dashboard and Uploads screens, replacing `data/mock-activity.ts` in the next prompt.

### `app_settings`

A single-row configuration table backing the Settings screen, with a check constraint enforcing exactly one row. Columns for storage provider, bucket name, public CDN domain, max audio MB, accepted audio formats, accepted script formats, detect-duration boolean, default chapter access, free chapters at start, default maturity, plus `updated_at` and `updated_by`.

Account and Team sections of the Settings screen are **not** backed by this table — they read from Clerk.

## Enums

`maturity` — `'general' | 'mature_17'`
`book_status` — `'draft' | 'published'`
`chapter_access` — `'free' | 'locked'`
`duration_source` — `'detected' | 'manual'`

## No stored aggregates

Do **not** add `chapter_count`, `audio_count`, `word_count`, `read_time` or any other aggregate column to `books` or `chapters`. Every ratio and total in this dashboard is computed from chapter rows by `lib/catalog.ts`. This is deliberate — stored aggregates are how the same serial ends up reporting two different chapter counts on two different screens.

Word count is derived from `script_text` at render time, never persisted. Asset presence is derived from path nullability: `script_text is null` means script missing, `audio_path is null` means audio missing.

Provide a `chapters_needing_attention` **view** returning book id, book title, chapter id, chapter number, chapter title and a derived missing-asset value of `'script'`, `'audio'` or `'both'`, ordered by book title then chapter number. This lets the Dashboard queue read one relation instead of pulling every chapter row.

## RLS

Enable RLS on every table. No table is left open.

**Caller identity** is `auth.jwt() ->> 'sub'`, the Clerk user id, stored and compared as `text`. Never cast it to `uuid`.

**Admin check.** Roles come from Clerk `publicMetadata`, surfaced on the session token by the claim configured in the previous prompt. Create a SQL helper function that reads the role out of `auth.jwt()` and returns true when it equals `'admin'`. Use that helper in every policy rather than repeating the JSON path.

The claim path must match exactly what was configured on the Clerk session token in the previous prompt. Verify the actual decoded token shape before writing the function — do not assume a path.

**Policies:**

| Table          | Read                                                                                   | Write                                             |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `books`        | admin: all rows. Non-admin authenticated: `status = 'published'` only                  | admin only, all of insert, update, delete         |
| `chapters`     | admin: all rows. Non-admin authenticated: only chapters whose parent book is published | admin only                                        |
| `activity_log` | admin only                                                                             | insert admin only; no update or delete for anyone |
| `app_settings` | admin only                                                                             | admin only                                        |

Chapter `script_text` is readable by non-admin authenticated users for published books, because the mobile reader needs it. Access gating for locked chapters is the mobile app's entitlement concern and is not enforced by these policies — note that explicitly in a migration comment so nobody later assumes locked chapters are protected at the row level.

**RLS is the enforcement boundary.** The Next.js middleware and the layout role check added in the previous prompt are UX, not security. Assume an attacker holds a valid non-admin token and is calling the REST API directly. Every policy must hold under that assumption.

## Storage buckets

Create three buckets with RLS policies:

- `covers` — public read, admin write. Cover art is served to every reader client.
- `audio` — authenticated read, admin write. Entitlement gating happens in the mobile app; note that in a comment.
- `scripts` — admin read and write only. Source manuscripts never reach a reader client.

Set the `audio` bucket's file size limit to 100 MB and its allowed MIME types to the audio formats the app accepts. Set `covers` to 2 MB with JPEG and WebP. Set `scripts` to a small limit with plain text, markdown and the Word MIME type.

Do not enable `x-upsert` behaviour anywhere. Replacing an asset writes a new immutable path, because CDN propagation lag on an overwritten path serves stale content.

## Generated types

Generate `types/database.ts` with the Supabase CLI and commit it. Never hand-edit it.

Then reconcile `types/catalog.ts`: keep the app-level discriminated unions (`ScriptAsset`, `AudioAsset`, `CoverAsset`, `MissingAsset`) because they model state the database expresses as nullable columns, but derive their field types from the generated row types rather than redeclaring primitives. Flag any place where the two genuinely cannot align.

## Constraints

- Migrations only. Every object created here is reproducible from `supabase/migrations/`.
- Include a `down` path or a clearly commented teardown for local resets.
- Add an `updated_at` trigger function once and attach it to both `books` and `chapters`.
- Do not seed data in a migration. Seed content is loaded through this dashboard, per AGENTS.md.
- Do not create any client, Server Action, page or component in this prompt.
- Do not modify any screen.
- Add the Supabase environment variables to `.env.example` with placeholder values. The service-role key is server-only and must be commented as such.

## Verification

Prove the boundary rather than assuming it. Using a non-admin token against the REST API directly, confirm that draft books are invisible, that chapters of draft books are invisible, that every write is rejected, that `activity_log` and `app_settings` return nothing, and that the `scripts` bucket refuses a download. Using an admin token, confirm full access and that `chapters_needing_attention` returns the expected rows.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
