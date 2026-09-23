-- Live catalog updates for the Talebrim mobile app.
--
-- ADDITIVE, WITH ONE DELIBERATE, OWNER-APPROVED EXCEPTION (2026-09-23). This
-- creates one function, six triggers and one policy on realtime.messages. It
-- alters no column, constraint, view or existing policy. But the triggers DO
-- run inside the dashboard's own writes to `books` and `chapters`, so they are
-- written to be unable to fail one: the whole body sits in an exception block
-- that downgrades any error to a WARNING. The worst case is a missed signal,
-- never a failed save.
--
-- WHAT IT DOES: after an insert, update or delete that touches a PUBLISHED
-- book or its chapters, send one small Broadcast message on the private
-- Realtime topic `catalog`: `{ book_ids, chapter_ids }`, never row contents.
-- The app treats it as "these are stale" and refetches through its normal
-- RLS-checked queries, so a new title, cover, narration file or script shows
-- up without the reader refreshing. Covers and audio get a fresh storage path
-- on every upload (actions/covers.ts, actions/audio.ts), so every one of those
-- changes is a row update here and nothing needs a storage trigger.
--
-- WHY BROADCAST, NOT POSTGRES CHANGES: Postgres Changes ships the whole row —
-- a chapter save would push the full `script_text` to every connected phone —
-- and runs one RLS check per subscriber per change on a t3.nano. It also never
-- tells a reader about a book going published → draft, because the new row
-- fails their RLS. Broadcast sends ids only, costs one insert per statement,
-- and the old-rows check below catches unpublishing.
--
-- WHY STATEMENT-LEVEL: bulk import writes chapters one statement at a time,
-- and a bulk UPDATE should cost one message, not one per row.
--
-- WHY PUBLISHED-ONLY: drafts are unfinished admin work and invisible to
-- readers; signalling them would leak draft activity and waste messages.
--
-- WHY A PRIVATE TOPIC: on a public topic anyone holding the anon key could
-- both listen and SEND, and a spoofed message would make every reader
-- refetch at once. The policy below lets signed-in users receive only; with
-- no insert policy, no client can send on `catalog`.

create or replace function public.broadcast_catalog_change()
returns trigger
language plpgsql
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
declare
  book_ids uuid[] := '{}';
  chapter_ids uuid[] := '{}';
begin
  -- Transition tables exist only for the operations that have them:
  -- `new_rows` on INSERT/UPDATE, `old_rows` on UPDATE/DELETE. PL/pgSQL plans a
  -- statement only when it first runs, so the skipped branches never fail.
  if tg_table_name = 'books' then
    if tg_op <> 'DELETE' then
      select coalesce(array_agg(n.id), '{}') into book_ids
      from new_rows n
      where n.status = 'published';
    end if;
    if tg_op <> 'INSERT' then
      -- Old rows catch published → draft and deletes of published books.
      select book_ids || coalesce(array_agg(o.id), '{}') into book_ids
      from old_rows o
      where o.status = 'published';
    end if;
  else
    if tg_op <> 'DELETE' then
      select coalesce(array_agg(n.id), '{}'), coalesce(array_agg(n.book_id), '{}')
        into chapter_ids, book_ids
      from new_rows n
      join public.books b on b.id = n.book_id
      where b.status = 'published';
    end if;
    if tg_op <> 'INSERT' then
      select chapter_ids || coalesce(array_agg(o.id), '{}'),
             book_ids || coalesce(array_agg(o.book_id), '{}')
        into chapter_ids, book_ids
      from old_rows o
      join public.books b on b.id = o.book_id
      where b.status = 'published';
    end if;
  end if;

  book_ids := array(select distinct unnest(book_ids));
  chapter_ids := array(select distinct unnest(chapter_ids));

  if cardinality(book_ids) > 0 then
    perform realtime.send(
      jsonb_build_object(
        'book_ids', to_jsonb(book_ids),
        -- Past 100 ids the message stops being small; null means "every
        -- chapter of these books", which the app handles as a wider refetch.
        'chapter_ids', case when cardinality(chapter_ids) > 100 then null else to_jsonb(chapter_ids) end
      ),
      'catalog_changed',
      'catalog',
      true
    );
  end if;

  return null;
exception when others then
  raise warning 'broadcast_catalog_change on %.% skipped: %', tg_table_name, tg_op, sqlerrm;
  return null;
end;
$$;

-- Triggers only. Nothing should call this directly, and trigger firing does
-- not check EXECUTE, so no client role needs it.
revoke execute on function public.broadcast_catalog_change() from public, anon, authenticated;

-- One trigger per operation: a trigger with transition tables may name only
-- one event.
create trigger books_broadcast_insert
  after insert on public.books
  referencing new table as new_rows
  for each statement execute function public.broadcast_catalog_change();

create trigger books_broadcast_update
  after update on public.books
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.broadcast_catalog_change();

create trigger books_broadcast_delete
  after delete on public.books
  referencing old table as old_rows
  for each statement execute function public.broadcast_catalog_change();

create trigger chapters_broadcast_insert
  after insert on public.chapters
  referencing new table as new_rows
  for each statement execute function public.broadcast_catalog_change();

create trigger chapters_broadcast_update
  after update on public.chapters
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.broadcast_catalog_change();

create trigger chapters_broadcast_delete
  after delete on public.chapters
  referencing old table as old_rows
  for each statement execute function public.broadcast_catalog_change();

-- Signed-in users may RECEIVE on the private `catalog` topic. There is
-- deliberately no insert policy, so no client can send on it — only the
-- trigger above, which runs as the function owner.
create policy "readers receive catalog broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'catalog'
    and realtime.messages.extension = 'broadcast'
  );
