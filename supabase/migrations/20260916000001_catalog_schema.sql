-- NovelNow catalog schema.
--
-- Scope: catalog tables only — the content this dashboard authors. Reader-scoped
-- tables (bookmarks, reading positions, unlock records, entitlement mirrors)
-- belong to the NovelNow mobile app and are deliberately NOT created here.
--
-- Teardown for local resets is at the bottom of this file, commented out.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- NOTE: the value is `mature_17`, but every UI surface in the admin dashboard
-- labels it "Mature 18+". That mismatch is deliberate and recorded in AGENTS.md
-- (Known design-file defects). Do NOT "fix" one to match the other: renaming the
-- enum value is a schema migration with a mobile-app consumer, not a copy edit.
create type maturity as enum ('general', 'mature_17');

create type book_status as enum ('draft', 'published');

create type chapter_access as enum ('free', 'locked');

create type duration_source as enum ('detected', 'manual');

-- ---------------------------------------------------------------------------
-- updated_at trigger (defined once, attached to books and chapters)
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- books
-- ---------------------------------------------------------------------------

create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  short_description text,
  synopsis text,
  -- Genre values are validated against the app's genre list (data/genres.ts) at
  -- the application layer, not here — the list is product copy that changes
  -- without a migration.
  genres text[] not null default '{}',
  maturity maturity not null default 'mature_17',
  status book_status not null default 'draft',
  -- Cover lives in the `covers` storage bucket. Null path means no cover; the
  -- app models this as a CoverAsset discriminated union.
  cover_path text,
  cover_file_name text,
  cover_size_bytes bigint,
  cover_width integer,
  cover_height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint books_short_description_length
    check (short_description is null or char_length(short_description) <= 160),
  constraint books_synopsis_length
    check (synopsis is null or char_length(synopsis) <= 600)
);

create trigger books_set_updated_at
  before update on books
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- chapters
-- ---------------------------------------------------------------------------

-- Asset presence is derived from nullability, never from a stored flag:
--   script_text is null -> script missing
--   audio_path  is null -> narration missing
create table chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books (id) on delete cascade,
  number integer not null,
  title text not null,
  script_text text,
  script_file_name text,
  script_path text,
  audio_path text,
  audio_file_name text,
  audio_size_bytes bigint,
  audio_duration_seconds integer,
  -- Null when there is no audio. Detection can report Infinity/NaN for some
  -- encodings, so the UI always exposes a manual override (see AGENTS.md,
  -- Upload Rules / Audio duration).
  audio_duration_source duration_source,
  access chapter_access not null default 'locked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chapters_book_id_number_key unique (book_id, number),
  constraint chapters_number_positive check (number > 0)
);

create index chapters_book_id_idx on chapters (book_id);
create index chapters_book_id_number_idx on chapters (book_id, number);

create trigger chapters_set_updated_at
  before update on chapters
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------------

-- Backs the Dashboard's "Recent activity" card, replacing data/mock-activity.ts
-- in the next prompt. Append-only: there is no update or delete policy for
-- anyone, including admins (see the RLS migration).
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user id, stored as text. Never cast to uuid — Clerk ids are not uuids.
  actor_id text not null,
  message text not null,
  book_id uuid references books (id) on delete set null,
  chapter_id uuid references chapters (id) on delete set null,
  created_at timestamptz not null default now()
);

create index activity_log_created_at_idx on activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- app_settings (single row)
-- ---------------------------------------------------------------------------

-- Backs the Settings screen's Storage / Upload defaults / Publishing defaults
-- cards. The Account and Team cards are NOT backed by this table — they read
-- from Clerk (see AGENTS.md, Clerk Rules).
create table app_settings (
  -- Enforces exactly one row: the only permitted primary key value is true.
  id boolean primary key default true,
  storage_provider text not null default 'supabase_storage',
  bucket_name text not null default 'novelnow-media',
  public_cdn_domain text not null default 'https://cdn.novelnow.app',
  max_audio_size_mb integer not null default 100,
  accepted_audio_formats text[] not null default '{.m4a,.mp3,.wav}',
  accepted_script_formats text[] not null default '{.txt,.docx,.md}',
  detect_duration_automatically boolean not null default true,
  default_chapter_access chapter_access not null default 'locked',
  free_chapters_at_start integer not null default 3,
  default_maturity maturity not null default 'mature_17',
  updated_at timestamptz not null default now(),
  -- Clerk user id of the last editor. Text, never uuid.
  updated_by text,

  constraint app_settings_single_row check (id),
  constraint app_settings_max_audio_size_positive check (max_audio_size_mb > 0),
  constraint app_settings_free_chapters_non_negative
    check (free_chapters_at_start >= 0)
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- No stored aggregates
-- ---------------------------------------------------------------------------
-- Deliberately absent from books/chapters: chapter_count, audio_count,
-- word_count, read_time, or any other rollup. Every ratio and total in this
-- dashboard is computed from chapter rows by lib/catalog.ts. Stored aggregates
-- are how one serial ends up reporting two different chapter counts on two
-- different screens. Word count is derived from script_text at render time.

-- ---------------------------------------------------------------------------
-- Teardown (local resets only — do not run against a shared database)
-- ---------------------------------------------------------------------------
-- drop table if exists app_settings;
-- drop table if exists activity_log;
-- drop table if exists chapters;
-- drop table if exists books;
-- drop function if exists set_updated_at();
-- drop type if exists duration_source;
-- drop type if exists chapter_access;
-- drop type if exists book_status;
-- drop type if exists maturity;
