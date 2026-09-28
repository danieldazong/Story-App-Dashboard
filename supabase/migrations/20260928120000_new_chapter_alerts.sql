-- New-chapter alerts for the Talebrim mobile app (its prompt 23a): the
-- phones readers asked to alert, and the server-only state of the Edge
-- Function notify-new-chapters.
--
-- PURELY ADDITIVE. Creates four tables, four functions and two extensions
-- (pg_cron and pg_net, for the schedule in the next migration). Alters no
-- existing table, view, enum, function or policy. Nothing is added to books,
-- chapters, app_settings or activity_log: the new tables reference them, as
-- the reader tables do, and a cascade takes their rows along when the
-- dashboard deletes a book or chapter.
--
-- NO TRIGGER ON chapters (decided 2026-09-25). The Edge Function, called
-- every 5 minutes, finds new chapters itself, so a save in this dashboard
-- never waits on, or fails because of, an alert. A trigger would have been a
-- third change to a dashboard-owned table, and alerts are bundled over 10
-- minutes anyway.
--
-- What a run does, in the function (supabase/functions/notify-new-chapters):
--   1. notify_find_new_chapters() records every readable chapter of a
--      published book that has no chapter_alerts row yet.
--   2. notify_due_books() lists each book whose unsent chapters have been
--      quiet for 10 minutes and that has not alerted in 24 hours, with the
--      tokens of the readers who have it on My List.
--   3. It sends through Expo's push API, then notify_mark_sent() marks the
--      chapters sent and the book's last_sent_at.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- push_tokens: the phones that asked for alerts, one account per phone
-- ---------------------------------------------------------------------------

-- An Expo push token, as expo-notifications' getExpoPushTokenAsync() returns
-- it. Checked here and in set_push_token(), so nothing else is ever stored or
-- sent to Expo.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user id, text like the reader tables, never uuid.
  user_id text not null default (auth.jwt() ->> 'sub'),
  token text not null,
  -- Android only while the mobile app's iOS scope is open.
  platform text not null default 'android' check (platform = 'android'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A phone belongs to one account at a time.
  constraint push_tokens_token_key unique (token),
  constraint push_tokens_token_format
    check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$')
);

comment on table public.push_tokens is
  'Mobile new-chapter alerts: the Expo push token of each phone whose reader '
  'turned alerts on, one account per phone. Written only through '
  'set_push_token(); readers can select their own rows.';

-- The policy below and the job's join from library_items look rows up by this.
create index push_tokens_user_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row
  execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

-- New public tables inherit ALL rights for anon and authenticated here,
-- TRUNCATE included. Readers get SELECT only; every write goes through
-- set_push_token() below. service_role keeps its default rights for the job.
revoke all on table public.push_tokens from anon, authenticated;
grant select on table public.push_tokens to authenticated;

create policy push_tokens_select on public.push_tokens
  for select
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- The one way a reader writes push_tokens.
--
-- p_enabled true: the phone's token is the caller's, taken from any other
-- account that held it (the previous reader on a shared phone, whose
-- sign-out never reached the server).
-- p_enabled false: the token is released, whoever holds it. Only the phone
-- knows its token, so this is how a sign-out, or the next sign-in with alerts
-- off, stops a previous account's alerts reaching it.
create or replace function public.set_push_token(p_token text, p_enabled boolean)
returns void
language plpgsql
volatile
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
declare
  caller text := (select auth.jwt() ->> 'sub');
begin
  if caller is null or caller = '' then
    raise exception 'set_push_token: not signed in' using errcode = '42501';
  end if;
  if p_enabled is null
    or p_token is null
    or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$' then
    raise exception 'set_push_token: not an Expo push token' using errcode = '22023';
  end if;

  if p_enabled then
    insert into public.push_tokens (user_id, token)
      values (caller, p_token)
      on conflict (token) do update
        set user_id = excluded.user_id
        where public.push_tokens.user_id is distinct from excluded.user_id;
  else
    delete from public.push_tokens where token = p_token;
  end if;
end;
$$;

comment on function public.set_push_token(text, boolean) is
  'Mobile new-chapter alerts: true gives the phone''s token to the caller '
  '(taking it from any other account), false releases it whoever holds it.';

-- Postgres grants EXECUTE to PUBLIC, and this project's default privileges to
-- anon as well. Signed-in readers only.
revoke all on function public.set_push_token(text, boolean) from public, anon;
grant execute on function public.set_push_token(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The job's own state. Server only: RLS on with no policy, and no grants to
-- anon or authenticated. service_role, which bypasses RLS, is the only
-- reader and writer.
-- ---------------------------------------------------------------------------

-- One row per chapter the job has seen: found, then sent.
create table public.chapter_alerts (
  chapter_id uuid primary key references public.chapters (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  found_at timestamptz not null default now(),
  -- Null until the alert naming it has gone (or the book was on no one's list).
  sent_at timestamptz
);

comment on table public.chapter_alerts is
  'Mobile new-chapter alerts: each readable chapter the notify-new-chapters '
  'job has found, and when it was announced. Server only.';

-- The book cascade, and the job's per-book grouping, look rows up by this.
create index chapter_alerts_book_idx on public.chapter_alerts (book_id);

-- When each book last alerted: the 24-hour cap.
create table public.book_alerts (
  book_id uuid primary key references public.books (id) on delete cascade,
  last_sent_at timestamptz not null
);

comment on table public.book_alerts is
  'Mobile new-chapter alerts: when each book last sent one, for the '
  'once-in-24-hours cap. Server only.';

-- Expo's tickets for sent messages, until their receipts are checked.
create table public.push_tickets (
  -- Expo's ticket id.
  id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);

comment on table public.push_tickets is
  'Mobile new-chapter alerts: Expo push tickets awaiting their receipts, '
  'checked 15 minutes on and dropped after a day. Server only.';

create index push_tickets_created_idx on public.push_tickets (created_at);

alter table public.chapter_alerts enable row level security;
alter table public.book_alerts enable row level security;
alter table public.push_tickets enable row level security;

revoke all on table public.chapter_alerts from anon, authenticated;
revoke all on table public.book_alerts from anon, authenticated;
revoke all on table public.push_tickets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: nothing already out is new
-- ---------------------------------------------------------------------------

-- Every chapter a reader can already open (text or narration, in a published
-- book) is recorded as found and sent, so the first run announces nothing
-- old. chapters_catalog is the mobile app's own definition of both.
insert into public.chapter_alerts (chapter_id, book_id, found_at, sent_at)
select c.id, c.book_id, now(), now()
from public.chapters_catalog c
where c.has_text or c.has_audio
on conflict (chapter_id) do nothing;

-- ---------------------------------------------------------------------------
-- The job's steps, for notify-new-chapters (service_role only)
-- ---------------------------------------------------------------------------

-- Step 1. Records every readable chapter of a published book not yet seen.
-- A draft book's chapters are never found: chapters_catalog has none.
-- Returns how many it recorded.
create or replace function public.notify_find_new_chapters()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with found as (
    insert into public.chapter_alerts (chapter_id, book_id)
    select c.id, c.book_id
    from public.chapters_catalog c
    where (c.has_text or c.has_audio)
      and not exists (
        select 1 from public.chapter_alerts a where a.chapter_id = c.id
      )
    on conflict (chapter_id) do nothing
    returning 1
  )
  select count(*)::integer from found;
$$;

-- Step 2. The books due an alert, each with its unsent chapters (still
-- readable, in a still-published book, by number) and the push tokens of the
-- readers who have it on My List.
--
-- Due once its newest unsent chapter has been quiet for 10 minutes and it
-- has not alerted in 24 hours. The 10 minutes is two runs of the 5-minute
-- schedule, compared at 9 so a run's few seconds of lateness never pushes an
-- alert to a third: a chapter reaches a phone within about 15 minutes of
-- being published. Chapters held back by the cap stay unsent, and go in the
-- book's next alert.
create or replace function public.notify_due_books()
returns table (book_id uuid, title text, chapters jsonb, tokens text[])
language sql
stable
security definer
set search_path = ''
as $$
  with unsent as (
    select a.book_id, a.chapter_id, a.found_at, c.number, c.title
    from public.chapter_alerts a
    join public.chapters_catalog c on c.id = a.chapter_id
    where a.sent_at is null
      and (c.has_text or c.has_audio)
  ),
  due as (
    select u.book_id
    from unsent u
    left join public.book_alerts ba on ba.book_id = u.book_id
    group by u.book_id, ba.last_sent_at
    having max(u.found_at) <= now() - interval '9 minutes'
      and (ba.last_sent_at is null or ba.last_sent_at <= now() - interval '24 hours')
  )
  select
    d.book_id,
    b.title,
    (
      select jsonb_agg(
        jsonb_build_object('id', u.chapter_id, 'number', u.number, 'title', u.title)
        order by u.number
      )
      from unsent u
      where u.book_id = d.book_id
    ),
    coalesce(
      (
        select array_agg(distinct t.token)
        from public.library_items li
        join public.push_tokens t on t.user_id = li.user_id
        where li.book_id = d.book_id
      ),
      '{}'::text[]
    )
  from due d
  join public.books_catalog b on b.id = d.book_id;
$$;

-- Step 3. Marks the chapters an alert named as sent. p_sent is false for a
-- book on no one's list: its chapters are done, but no alert went, so the
-- 24-hour cap does not start.
create or replace function public.notify_mark_sent(
  p_book_id uuid,
  p_chapter_ids uuid[],
  p_sent boolean
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.chapter_alerts
    set sent_at = now()
    where book_id = p_book_id
      and chapter_id = any (p_chapter_ids)
      and sent_at is null;

  insert into public.book_alerts (book_id, last_sent_at)
    select p_book_id, now()
    where p_sent
    on conflict (book_id) do update set last_sent_at = excluded.last_sent_at;
$$;

-- The job's functions are the Edge Function's alone.
revoke all on function public.notify_find_new_chapters() from public, anon, authenticated;
revoke all on function public.notify_due_books() from public, anon, authenticated;
revoke all on function public.notify_mark_sent(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.notify_find_new_chapters() to service_role;
grant execute on function public.notify_due_books() to service_role;
grant execute on function public.notify_mark_sent(uuid, uuid[], boolean) to service_role;

-- Teardown (local resets only)
-- drop function if exists public.notify_mark_sent(uuid, uuid[], boolean);
-- drop function if exists public.notify_due_books();
-- drop function if exists public.notify_find_new_chapters();
-- drop function if exists public.set_push_token(text, boolean);
-- drop table if exists public.push_tickets;
-- drop table if exists public.book_alerts;
-- drop table if exists public.chapter_alerts;
-- drop table if exists public.push_tokens;
