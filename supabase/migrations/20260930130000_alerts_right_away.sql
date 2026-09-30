-- New-chapter alerts go out as soon as a chapter is added.
--
-- Decided by the owner on 2026-09-30: "the time to upload every chapter
-- should be determined by the admin", and readers should hear about a new
-- chapter straight away.
--
-- BEFORE: pg_cron ran notify-new-chapters every 5 minutes, and
-- notify_due_books() held a book back until its new chapters had been quiet
-- for 10 minutes (compared at 9), and to at most one alert every 24 hours.
-- A chapter reached readers 10 to 15 minutes after it was added, and a
-- second chapter the same day sent nothing until the next day.
--
-- AFTER: the job runs every minute, and a book is due as soon as it has a
-- readable chapter not yet announced. Chapters found in the same run (a bulk
-- import) still go out as one alert. book_alerts still records each book's
-- last alert; nothing reads it as a cap any more.
--
-- Not every few seconds: the schedule only fires an HTTP call, so runs can
-- overlap if one is slow, and two overlapping runs could announce the same
-- chapter twice. A run takes about a second, so a minute leaves room.
--
-- Changes: notify_due_books()'s body (same signature, security and grants),
-- and the schedule of the existing cron job, in place. No table changes.

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
    select distinct u.book_id
    from unsent u
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

select cron.alter_job(
  (select jobid from cron.job where jobname = 'notify-new-chapters'),
  schedule := '* * * * *'
);

-- Teardown (local resets only): re-apply 20260928120000's notify_due_books()
-- body, and alter the job back to '*/5 * * * *'.
