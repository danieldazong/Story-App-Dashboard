-- A chapter's own access decides whether it is free, not its number.
--
-- Asked for by the owner on 2026-09-30, after locking chapters 2 and 3 of a
-- book in the chapter editor and finding they still opened and played in the
-- mobile app.
--
-- BEFORE: can_play_audio() treated every chapter numbered up to
-- app_settings.free_chapters_at_start as free, whatever its own access said,
-- so a chapter the owner locked still played for every reader.
--
-- AFTER: free_chapters_at_start means what the dashboard's own code already
-- uses it for: the access a chapter is given when it is created
-- (createChapter in app/actions/chapters.ts, createImportTarget in
-- app/actions/bulk-import.ts). After that, the chapter's access column
-- decides. The mobile app's lock rule changes with it
-- (resolveChapterState() in talebrim-app/src/types/states.ts).
--
-- Only the function body changes: same name, signature and security; CREATE
-- OR REPLACE keeps its owner and grants (authenticated only). The audio_read
-- policy that calls it is untouched.

create or replace function public.can_play_audio(object_name text)
returns boolean
-- plpgsql, not sql: the uuid cast below must run only after the regex check.
-- A sql function can be inlined and its constant subexpressions folded at
-- plan time, which would raise on a malformed path instead of returning
-- false.
language plpgsql
stable
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
declare
  -- Objects are <bookId>/<chapterId>/<file>; the chapter id is the second
  -- segment.
  chapter_segment text := split_part(object_name, '/', 2);
begin
  if chapter_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  return coalesce((
    select
      c.access = 'free'
      or exists (
        select 1
        from public.unlocks u
        where u.user_id = (auth.jwt() ->> 'sub')
          and u.chapter_id = c.id
      )
      -- TODO(paywall): prompt 22a adds the subscriber branch here, from the
      -- entitlements mirror.
    from public.chapters c
    join public.books b on b.id = c.book_id
    -- By primary key, never by scanning paths.
    where c.id = chapter_segment::uuid
      -- Only the chapter's current file: a replaced upload's old object, or
      -- a file filed under the wrong chapter, plays nothing.
      and c.audio_path = object_name
      and b.status = 'published'
  ), false);
end;
$$;

comment on function public.can_play_audio(text) is
  'True when the caller may play this audio object: it is a published '
  'chapter''s current audio_path, and the chapter is free by its own access '
  'or unlocked by the caller. Used by the audio_read storage policy. A '
  'malformed path returns false, never an error. Subscribers wait for the '
  'entitlement mirror (prompt 22a).';

-- Teardown (local resets only): re-apply 20260928140000's function body,
-- which adds back "or c.number <= (select s.free_chapters_at_start from
-- public.app_settings s)".
