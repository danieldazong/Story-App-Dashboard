-- library_items: a reader's "My List" (M7), for the Talebrim mobile app.
--
-- PURELY ADDITIVE. Creates one table with its indexes, grants and policies.
-- Alters no existing table, view, enum, function or policy.
--
-- No order column (decided 2026-09-23): the list is sorted by created_at desc,
-- because M7 has no drag-to-reorder and a position column would bring
-- reindexing for nothing. A nullable sort_order can be added later.

create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user id, text like activity_log.actor_id, never uuid. Defaults to
  -- the caller, so a client never has to supply it.
  user_id text not null default (auth.jwt() ->> 'sub'),
  -- CASCADE: a book the dashboard deletes leaves every list, instead of the
  -- delete failing on it.
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A book is on a reader's list once. The leading user_id also serves every
  -- policy below.
  constraint library_items_user_book_key unique (user_id, book_id)
);

comment on table public.library_items is
  'Mobile My List: the books a reader saved, newest first by created_at. '
  'Owned by the mobile app; the dashboard does not read it.';

create index library_items_user_created_idx
  on public.library_items (user_id, created_at desc);

-- The cascade above looks rows up by this.
create index library_items_book_idx on public.library_items (book_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.library_items enable row level security;

-- New public tables inherit ALL rights for anon and authenticated here,
-- TRUNCATE included, which RLS does not govern. Narrow them to what the
-- policies decide.
revoke all on table public.library_items from anon, authenticated;
grant select, insert, update, delete on table public.library_items to authenticated;

-- A reader touches only their own rows; no is_admin() branch on purpose.
create policy library_items_select on public.library_items
  for select
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

create policy library_items_insert on public.library_items
  for insert
  to authenticated
  with check (user_id = (select auth.jwt() ->> 'sub'));

create policy library_items_update on public.library_items
  for update
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'))
  with check (user_id = (select auth.jwt() ->> 'sub'));

create policy library_items_delete on public.library_items
  for delete
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- Teardown (local resets only)
-- drop table if exists public.library_items;
