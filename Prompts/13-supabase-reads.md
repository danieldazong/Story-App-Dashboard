# 13-supabase-reads

Read AGENTS.md first and follow it strictly.

Study every screen currently reading from `data/mock-catalog.ts`, `data/mock-activity.ts` and `data/settings-defaults.ts`, then replace those reads with real Supabase queries against the schema created in the previous prompt.

**Keep the existing UI and navigation exactly as they are.** Do not change any screen design, any layout, any copy or any component structure. If a real query cannot supply something a screen currently renders, ask me before changing the screen.

Reads only in this prompt. No mutations — `Save`, `Save chapter`, `Save changes`, `Import`, upload actions and the seed-data delete all stay as local-state-and-toast exactly as they are now. Writes are the next prompt.

## Client creation

Create `lib/supabase.ts` exporting a factory that builds the client with an `accessToken` callback returning the Clerk session token:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createSupabaseClient(
  getToken: () => Promise<string | null>,
): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await getToken()) ?? null },
  );
}
```

In Server Components get `getToken` from `auth()`. In Client Components get it from `useAuth()`.

**Do not** create the client by injecting a Clerk JWT-template token into a global `Authorization` header. Supabase documents that integration as deprecated as of 1 April 2025 — sharing the project JWT secret with a third party is a poor security practice, rotating it causes downtime, and minting a separate JWT adds latency versus using the session token directly. Use the `accessToken` callback above.

Also create `lib/supabase-admin.ts` using the service-role key, for the narrow cases that must bypass RLS. Import it **only** from Server Components, Server Actions or Route Handlers, never from a Client Component. Nothing in this prompt should need it — add it with a comment stating its constraint, and if you find yourself reaching for it to make a read work, that read is wrong and you should flag it instead.

## Query layer

Add `lib/queries.ts` holding one function per screen read. No React, no JSX. Every function takes a Supabase client and returns typed rows derived from `types/database.ts`.

| Function               | Feeds                      | Returns                                                   |
| ---------------------- | -------------------------- | --------------------------------------------------------- |
| `getBooks`             | Books list                 | books plus their chapters, enough for the computed ratios |
| `getBook`              | Book editor                | one book by id                                            |
| `getChapters`          | Book editor chapters table | all chapters for a book, ordered by number                |
| `getChapter`           | Chapter editor             | one chapter by book id and chapter number                 |
| `getChapterNeighbours` | Chapter editor prev/next   | previous and next chapter numbers for a book              |
| `getDashboardCounts`   | Dashboard tiles            | book count, chapter count, missing-audio count            |
| `getNeedsAttention`    | Dashboard queue            | rows from the `chapters_needing_attention` view           |
| `getRecentActivity`    | Dashboard and Uploads      | latest activity rows, newest first                        |
| `getAppSettings`       | Settings                   | the single settings row                                   |
| `getBooksForImport`    | Bulk import target select  | book id, title and current chapter count                  |

`getBooks` must not fetch full `script_text` for every chapter — select only the columns the ratios need (`id`, `number`, `script_text is not null`, `audio_path is not null`) or compute the counts in Postgres. Pulling every chapter's prose to render a books list is the one performance mistake that will actually hurt here, since a 148-chapter serial carries megabytes of text.

## Aggregates stay computed

Every ratio, count and total continues to flow through `lib/catalog.ts`. The schema has no aggregate columns by design. `bookChapterProgress`, `bookAudioProgress`, `countWords`, `readTimeMinutes`, `formatDuration`, `formatBytes` and `chapterMissingAsset` all stay exactly as they are — only their input changes from fixture rows to database rows.

Where a query returns a shape that does not match what a helper expects, adapt at the query boundary. Do not rewrite the helpers and do not compute a ratio inline in a component.

## Asset state mapping

The database expresses asset presence as nullable columns; the UI consumes the discriminated unions from `types/catalog.ts`. Add mapping functions — one place, in `lib/catalog.ts` or a sibling — that convert a database chapter row into `ScriptAsset` and `AudioAsset`, and a book row into `CoverAsset`.

`script_text is null` maps to `{ state: "missing" }`. `audio_path is null` maps to `{ state: "missing" }`. Otherwise map to the ready variant, carrying `audio_duration_source` through so the Chapter editor keeps rendering `Detected` versus `Edited` correctly.

## Storage URLs

Cover and audio URLs derive from the storage path plus the public CDN domain in `app_settings`. Add a helper for this. Never store a full URL in the database and never append a cache-busting query string to a media URL — audio paths are immutable and long-cached, and cached egress costs roughly a third of uncached.

Add the Supabase CDN hostname to `next.config.ts` so `next/image` can serve covers without disabling optimization.

## Settings

The Storage, Upload defaults and Publishing defaults sections now read from `app_settings`. The Account and Team sections continue to read from Clerk, as wired in the previous prompt.

Keep `data/settings-defaults.ts` for exactly one purpose: the option lists that are application constants rather than configuration — storage provider options, and the genre and maturity lists already in their own modules. Delete the value defaults now served by the database, and note what remains and why in a comment at the top of the file.

## Empty database

Every screen already has an empty state from its own prompt. This prompt must make them real rather than theoretical, because a fresh database has no books at all. Verify against a genuinely empty database: the Books list shows its empty-catalog state, the Dashboard shows zero tiles and its no-books state, the Uploads activity card shows its empty line, the Bulk import target select shows a disabled state with a line pointing the operator at creating a book first.

## Error handling

A failed query renders the screen's existing error state with a specific message and a retry affordance. Do not swallow a Supabase error into an empty result — an empty table and a failed request must look different to the operator, because one means "create something" and the other means "something is broken".

An RLS rejection is not an empty result either. If a read returns nothing because the caller lacks the admin role, surface that plainly rather than rendering an empty catalog.

## Delete

Remove `data/mock-catalog.ts` and `data/mock-activity.ts` entirely, along with the development-fixture comments that referenced them. Nothing should import them when this prompt finishes.

Leave the upload simulator in `09-upload-queue` alone — it is replaced when the real TUS pipeline lands, not here.

## Constraints

- Server Components fetch data. Pass typed rows down as props. Client Components take data, they do not fetch.
- Strict TypeScript. Derive row types from `types/database.ts`. No `any`, no redeclared primitives.
- Do not add a client-side data-fetching library. Server Components plus `revalidatePath` cover this, per AGENTS.md.
- Do not add a global store for server data.
- Do not implement any mutation, Server Action or upload path.
- Do not modify the schema. If a read needs a column or an index that does not exist, stop and flag it.
- Do not modify any screen's layout, copy or component structure.

## Verification

Seed two or three books with chapters **through the Supabase dashboard by hand for this test only** — not through a migration — then confirm every screen renders from the database with no fixture imports remaining. Check that the Books list ratio, the Dashboard `MISSING AUDIO` tile, the Dashboard queue length and the Book editor chapters table all agree with each other, since they now compute from the same rows. Then empty the database and confirm every empty state.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
