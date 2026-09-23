-- reading_positions: the server copy of read/listen parity, for the Talebrim
-- mobile app (its AGENTS.md, State Management Rules, parity steps 2-4).
--
-- PURELY ADDITIVE. Creates one table with its indexes, grants and policies.
-- Alters no existing table, view, enum, function or policy, so the dashboard's
-- queries, generated types and RLS behaviour are unchanged.
--
-- One row per (reader, chapter). It holds the pair of positions, audio
-- milliseconds AND a character offset into chapters.script_text, plus which
-- mode wrote last, so switching between reading and listening maps from the
-- authoritative side. PER ACCOUNT, not per device (decided 2026-09-23): parity
-- across devices is the whole point of a server row.
--
-- updated_at is the conflict clock: last write wins against the SERVER
-- timestamp, never the device clock. It defaults to now() on insert. Nothing
-- bumps it on update yet, because this migration was asked not to add a
-- trigger and nothing writes positions yet. The mobile parity prompt must make
-- updates set it server-side (the existing set_updated_at() trigger, or an
-- RPC) before it ships a writer.

create table public.reading_positions (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user id, text like activity_log.actor_id, never uuid. Defaults to
  -- the caller, so a client never has to supply it.
  user_id text not null default (auth.jwt() ->> 'sub'),
  -- CASCADE on both keys: a book or chapter the dashboard deletes takes
  -- readers' positions with it, instead of the delete failing on them.
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  -- Denormalised on purpose: Library finds the latest position per book
  -- without joining chapters.
  book_id uuid not null references public.books (id) on delete cascade,
  audio_ms integer check (audio_ms >= 0),
  text_offset integer check (text_offset >= 0),
  last_mode text not null check (last_mode in ('text', 'audio')),
  updated_at timestamptz not null default now(),
  -- The side that wrote last must hold a value to map from.
  constraint reading_positions_last_mode_has_value check (
    (last_mode = 'text' and text_offset is not null)
    or (last_mode = 'audio' and audio_ms is not null)
  ),
  -- Makes the parity upsert idempotent. Its leading user_id also serves every
  -- policy below.
  constraint reading_positions_user_chapter_key unique (user_id, chapter_id)
);

comment on table public.reading_positions is
  'Mobile read/listen parity: one row per reader per chapter, per account. '
  'Last write wins against updated_at, a server timestamp. Owned by the mobile '
  'app; the dashboard does not read it.';
comment on column public.reading_positions.audio_ms is
  'Playback position in milliseconds.';
comment on column public.reading_positions.text_offset is
  'CHARACTER offset into chapters.script_text. Never a pixel scroll offset: '
  'that breaks on a font-size change and cannot map to audio.';
comment on column public.reading_positions.last_mode is
  'Which side wrote last (text or audio), so a mode switch maps from it.';

-- "Continue" and Library: a reader's most recent positions, overall and per
-- book.
create index reading_positions_user_updated_idx
  on public.reading_positions (user_id, updated_at desc);
create index reading_positions_user_book_updated_idx
  on public.reading_positions (user_id, book_id, updated_at desc);

-- The cascades above look rows up by these. Without them, deleting one
-- chapter would scan every reader's positions.
create index reading_positions_chapter_idx on public.reading_positions (chapter_id);
create index reading_positions_book_idx on public.reading_positions (book_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.reading_positions enable row level security;

-- This project's default privileges hand every new public table ALL rights
-- for anon and authenticated, including TRUNCATE, which RLS does not govern.
-- anon gets nothing; authenticated gets exactly the four operations the
-- policies below decide.
revoke all on table public.reading_positions from anon, authenticated;
grant select, insert, update, delete on table public.reading_positions to authenticated;

-- A reader touches only their own rows. There is deliberately no is_admin()
-- branch: an operator is a reader here too, with no view of anyone else's
-- positions. (select ...) makes Postgres read the claim once per statement,
-- not once per row.
create policy reading_positions_select on public.reading_positions
  for select
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

create policy reading_positions_insert on public.reading_positions
  for insert
  to authenticated
  with check (user_id = (select auth.jwt() ->> 'sub'));

create policy reading_positions_update on public.reading_positions
  for update
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'))
  with check (user_id = (select auth.jwt() ->> 'sub'));

create policy reading_positions_delete on public.reading_positions
  for delete
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- Teardown (local resets only)
-- drop table if exists public.reading_positions;
