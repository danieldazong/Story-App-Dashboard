-- Read-path support for the Talebrim mobile app.
--
-- PURELY ADDITIVE, DELIBERATELY. This migration creates indexes and one view.
-- It alters no existing table, drops nothing, and changes no policy, so the
-- admin dashboard's queries, generated types and RLS verification are all
-- unaffected. That constraint is the point: the dashboard is in production at
-- talebrim.com and this app is a reader of its database, not a co-owner.
--
-- What is NOT here, and why: `unlocks` and `reading_positions` are per-user
-- tables the mobile app owns, and they need product decisions this migration
-- should not front-run (does an ad unlock expire? is a position per-device or
-- per-account?). See AGENTS_APP.md, Data Contract.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Every reader query filters on this column and nothing indexed it.
--
-- Discover, Search and Library all read `where status = 'published'`, which
-- table-scans `books` today. Invisible at two rows; not at five hundred. The
-- dashboard never needed it because it deliberately shows drafts too.
create index if not exists books_status_idx
  on books (status);

-- Genre filtering on the Discover tab strip (M3) and the Search chips (M8).
--
-- GIN because `genres` is a text[] and the query is a containment test
-- (`genres @> array['Romance']`), which a btree cannot serve.
create index if not exists books_genres_idx
  on books using gin (genres);

-- "New Audio Releases" (M3) and the Library's audiobook segment (M7) both ask
-- for chapters that HAVE narration. A partial index stays small because it
-- indexes only the rows that qualify, and the catalog is mostly text-first
-- today (1 of 22 chapters has audio as of 2026-09-20).
create index if not exists chapters_with_audio_idx
  on chapters (book_id)
  where audio_path is not null;

-- ---------------------------------------------------------------------------
-- Reader-facing catalog view
-- ---------------------------------------------------------------------------

-- One row per published book, with the counts every catalog screen needs.
--
-- WHY A VIEW RATHER THAN CLIENT-SIDE JOINS: M3 alone renders a hero plus three
-- carousels. Without this, that screen is a `books` query followed by a
-- `chapters` query per book to compute counts — the N+1 that makes a mobile
-- list feel slow on a t3.nano where a trivial query already costs ~450ms
-- (AGENTS.md, Performance Rules).
--
-- WHY NO STORED AGGREGATES: the same rule the dashboard follows. A persisted
-- `chapter_count` drifts from its source the moment a chapter is added outside
-- the path that maintains it. A view recomputes per read and cannot drift.
--
-- `security_invoker = on` so the querying user's RLS still applies. Without it
-- the view would run as its owner and hand a reader rows the policies deny —
-- the same setting, for the same reason, as chapters_needing_attention.
create or replace view books_catalog
with (security_invoker = on)
as
select
  b.id,
  b.title,
  b.author,
  b.short_description,
  b.synopsis,
  b.genres,
  b.maturity,
  b.cover_path,
  b.cover_width,
  b.cover_height,
  b.default_chapter_access,
  b.created_at,
  b.updated_at,
  coalesce(c.chapter_count, 0)      as chapter_count,
  coalesce(c.audio_count, 0)        as audio_count,
  coalesce(c.free_chapter_count, 0) as free_chapter_count,
  -- Null, not zero, when nothing has a measured duration. A catalog row
  -- claiming "0 min" over chapters whose duration was never detected is the
  -- confident-lie failure AGENTS.md records against the dashboard's own
  -- audio card. Absence and zero are different facts.
  c.total_duration_seconds
from books b
left join (
  select
    book_id,
    count(*)                                          as chapter_count,
    count(*) filter (where audio_path is not null)    as audio_count,
    count(*) filter (where access = 'free')           as free_chapter_count,
    sum(audio_duration_seconds)                       as total_duration_seconds
  from chapters
  group by book_id
) c on c.book_id = b.id
-- Drafts are unfinished admin work and must never reach a reader. Filtering
-- here rather than in the client makes that structural: a mobile query that
-- forgets the filter cannot leak one, because this view has no drafts in it.
where b.status = 'published';

comment on view books_catalog is
  'Published books with computed chapter/audio/free counts, for the mobile '
  'reader. Excludes drafts by construction. The admin dashboard does NOT use '
  'this view - it needs drafts and uses books directly.';

-- ---------------------------------------------------------------------------
-- Reader-facing chapter list
-- ---------------------------------------------------------------------------

-- Chapter rows for M4's preview and M9's full list, WITHOUT the prose.
--
-- Distinct from `chapters_list` (migration 20260917000003), which exists for
-- the dashboard and carries a word count it computes in Postgres. A reader
-- needs duration and access, not word counts, and needs the book's published
-- state enforced — which `chapters_list` does not do.
--
-- `script_text` is omitted on purpose. M9 renders 100+ rows; shipping every
-- chapter's prose to draw a list of titles is the exact mistake the dashboard
-- measured at 1,044,123 bytes versus 10,223 for the same ten rows.
create or replace view chapters_catalog
with (security_invoker = on)
as
select
  c.id,
  c.book_id,
  c.number,
  c.title,
  c.access,
  c.audio_duration_seconds,
  c.audio_duration_source,
  -- Booleans rather than the paths themselves: a list row only needs to know
  -- WHETHER audio and text exist, and audio_path is useless to a client that
  -- cannot read the private bucket without a signed URL anyway.
  (c.audio_path is not null)  as has_audio,
  (c.script_text is not null) as has_text,
  c.created_at,
  c.updated_at
from chapters c
join books b on b.id = c.book_id
where b.status = 'published';

comment on view chapters_catalog is
  'Chapter metadata for mobile list screens. Omits script_text deliberately - '
  'fetch prose per chapter from chapters.script_text when the reader opens '
  'one. Excludes chapters of unpublished books by construction.';
