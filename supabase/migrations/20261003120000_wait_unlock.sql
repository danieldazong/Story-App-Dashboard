-- Wait-for-free: one free unlock per reader per story every 24 hours (the
-- mobile app's prompt 23, Part A).
--
-- WHAT IT GIVES READERS: on a locked chapter's sheet, "Unlock free" opens that
-- one chapter, permanently, once per story per day. No ad, no plan.
--
-- ADDITIVE, on this app's own table, plus two functions. It widens one check
-- constraint on public.unlocks and creates public.wait_unlock_status() and
-- public.claim_wait_unlock(). It touches no policy, no view, no grant on
-- unlocks, and nothing on books, chapters, app_settings or activity_log (it
-- only reads chapters and books, as its owner).
--
-- THE SERVER WRITES THE UNLOCK, NEVER THE APP. Readers still hold SELECT on
-- unlocks and nothing else (20260923121638): an app that could insert there
-- would let anyone replaying their own token unlock the whole catalogue.
-- claim_wait_unlock() is the one door, and it enforces the rule itself:
--   * the caller is always auth.jwt() ->> 'sub'; nothing in an argument says
--     who is asking;
--   * the day is the SERVER's clock (now()), never the phone's;
--   * a claim opens exactly the chapter named, and only a chapter that is
--     locked for this reader: never a free one, never one already unlocked,
--     never for a subscriber (a plan opens everything, so it never spends the
--     free unlock);
--   * two claims at once for one story are serialised by an advisory lock, so
--     both cannot pass the cooldown.
--
-- The server already opens a locked chapter's text and narration for a reader
-- holding an unlocks row (chapters_select and can_play_audio(), 20261002130000
-- and 20261002120000), so the new row needs no further policy.
--
-- THE COOLDOWN counts only 'wait' rows. A chapter unlocked by a rewarded ad
-- (prompt 23, Part B) or a purchase doesn't start or stop it.

-- ---------------------------------------------------------------------------
-- unlocks.source accepts 'wait'
-- ---------------------------------------------------------------------------

-- Best effort: give up on the table lock after 5 seconds rather than queue
-- every reader's query behind a long one (a local setting, gone at the end of
-- this migration's transaction). The table is empty on the day this is
-- written, and one ALTER with both subcommands swaps the check atomically.
select set_config('lock_timeout', '5s', true);

alter table public.unlocks
  drop constraint unlocks_source_check,
  add constraint unlocks_source_check
    check (source in ('ad', 'purchase', 'wait'));

comment on column public.unlocks.source is
  'What earned the grant: ad (a rewarded ad Google confirmed), purchase '
  '(a one-off chapter purchase) or wait (the free unlock, one per story per '
  '24 hours, from claim_wait_unlock()). Never written by the app.';

-- ---------------------------------------------------------------------------
-- wait_unlock_status(): how long until the caller's next free unlock
-- ---------------------------------------------------------------------------

-- Whole seconds, rounded up, until the caller may claim again in this story: 0
-- when one is available, and 0 for a caller who never claimed there. Counts
-- only the caller's 'wait' rows in this story's chapters: the newest one's
-- created_at plus 24 hours, against the server's now(). It reads only the
-- caller's own rows.
create or replace function public.wait_unlock_status(p_book_id uuid)
returns integer
language sql
stable
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
  select coalesce((
    select greatest(
      0,
      ceil(extract(epoch from (max(u.created_at) + interval '24 hours' - now())))
    )::integer
    from public.unlocks u
    join public.chapters c on c.id = u.chapter_id
    where u.user_id = (auth.jwt() ->> 'sub')
      and u.source = 'wait'
      and c.book_id = p_book_id
  ), 0);
$$;

comment on function public.wait_unlock_status(uuid) is
  'Mobile free unlock: the whole seconds, rounded up, until the caller may '
  'claim their next free chapter in this story (one per story per 24 hours, '
  'by the server''s clock). 0 when one is available, and for a caller who '
  'never claimed there.';

-- Postgres grants EXECUTE to PUBLIC, and this project's default privileges to
-- anon by name as well (a dry run caught exactly that on 2026-09-28). Signed-in
-- readers only.
revoke all on function public.wait_unlock_status(uuid) from public, anon;
grant execute on function public.wait_unlock_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_wait_unlock(): the free unlock
-- ---------------------------------------------------------------------------

-- Every answer is DATA, never an error, so the app tells them apart without
-- parsing messages:
--   {"status":"unavailable"}                  no caller, no such chapter, or its
--                                             book isn't published
--   {"status":"not_locked"}                   the chapter is free, or the caller
--                                             already holds an unlock for it
--   {"status":"subscribed"}                   the caller holds Talebrim
--                                             Unlimited: a plan never spends
--                                             the free unlock
--   {"status":"cooldown","seconds_left":N}    already claimed in this story in
--                                             the last 24 hours
--   {"status":"claimed"}                      the unlocks row was written
create or replace function public.claim_wait_unlock(p_chapter_id uuid)
returns jsonb
language plpgsql
volatile
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
declare
  caller text := (auth.jwt() ->> 'sub');
  chapter_book uuid;
  chapter_free boolean;
  seconds_left integer;
  written bigint;
begin
  -- 1. Nothing to claim: nobody signed in, no such chapter, or a draft book.
  if caller is null or caller = '' or p_chapter_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select c.book_id, c.access = 'free'
    into chapter_book, chapter_free
  from public.chapters c
  join public.books b on b.id = c.book_id
  where c.id = p_chapter_id
    and b.status = 'published';

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- 2. Nothing to unlock: free by its own access, or already unlocked.
  if chapter_free or exists (
    select 1 from public.unlocks u
    where u.user_id = caller and u.chapter_id = p_chapter_id
  ) then
    return jsonb_build_object('status', 'not_locked');
  end if;

  -- 3. A subscriber is never charged the free unlock.
  if public.has_active_plan() then
    return jsonb_build_object('status', 'subscribed');
  end if;

  -- 4. One claim at a time per reader and story, released at the end of the
  -- transaction. Without it, two taps at once could both read "no claim in 24
  -- hours" and both write. The second waits here, then sees the first's row.
  perform pg_advisory_xact_lock(hashtextextended(caller || ':' || chapter_book::text, 0));

  -- 2 again, inside the lock: the same chapter claimed a moment ago.
  if exists (
    select 1 from public.unlocks u
    where u.user_id = caller and u.chapter_id = p_chapter_id
  ) then
    return jsonb_build_object('status', 'not_locked');
  end if;

  -- 5. The cooldown, again inside the lock.
  seconds_left := public.wait_unlock_status(chapter_book);
  if seconds_left > 0 then
    return jsonb_build_object('status', 'cooldown', 'seconds_left', seconds_left);
  end if;

  -- 6. Claim it. The unique (user_id, chapter_id) turns a lost race with an
  -- ad's unlock into a no-op, which is "not locked", not a spent cooldown.
  insert into public.unlocks (user_id, chapter_id, source)
    values (caller, p_chapter_id, 'wait')
    on conflict (user_id, chapter_id) do nothing;
  get diagnostics written = row_count;

  if written = 0 then
    return jsonb_build_object('status', 'not_locked');
  end if;
  return jsonb_build_object('status', 'claimed');
end;
$$;

comment on function public.claim_wait_unlock(uuid) is
  'Mobile free unlock: opens one locked chapter for the caller, once per story '
  'per 24 hours by the server''s clock. Answers data, never an error: '
  'claimed, cooldown (with seconds_left), not_locked (free or already '
  'unlocked), subscribed (a plan never spends it) or unavailable (no such '
  'chapter, or a draft book). The only way a reader writes a ''wait'' unlock.';

revoke all on function public.claim_wait_unlock(uuid) from public, anon;
grant execute on function public.claim_wait_unlock(uuid) to authenticated;

-- Teardown (local resets only): remove any 'wait' rows first, then restore the
-- old check.
-- drop function if exists public.claim_wait_unlock(uuid);
-- drop function if exists public.wait_unlock_status(uuid);
-- delete from public.unlocks where source = 'wait';
-- alter table public.unlocks
--   drop constraint unlocks_source_check,
--   add constraint unlocks_source_check check (source in ('ad', 'purchase'));
