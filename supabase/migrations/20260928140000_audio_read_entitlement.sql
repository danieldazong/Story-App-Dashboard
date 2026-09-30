-- The audio bucket signs only what a reader may play.
--
-- ONE CHANGE TO A DASHBOARD-OWNED OBJECT, sanctioned by the owner (the mobile
-- app's AGENTS.md, Decisions 2026-09-24 "Audio" and Deferred setup step 8):
-- the second, after the catalog broadcast triggers. It rewrites the using
-- clause of audio_read and nothing else. The other three audio policies, the
-- covers and scripts policies, and every table are untouched. Adds one
-- function.
--
-- BEFORE: audio_read let any signed-in user read any object in audio, so a
-- reader could sign every locked chapter's narration with their own token
-- (20260916000004 said so: "Do not assume this bucket enforces a paywall").
--
-- AFTER: an admin reads everything, as before, which keeps the dashboard's
-- playback (createAudioPlaybackUrl) and uploads working. Anyone else reads an
-- object only when public.can_play_audio() says this caller may play it:
-- the object is a chapter's current audio_path, the chapter's book is
-- published, and the chapter is free by access, free by position, or
-- unlocked by the caller. That is the mobile app's lock rule
-- (resolveChapterState() in talebrim-app/src/types/states.ts), minus the
-- subscription, which waits for the entitlement mirror (prompt 22a).
--
-- WHY ALTER POLICY: it swaps the expression in one statement, so there is no
-- moment with no read policy (a drop then create would leave one), and the
-- policy keeps its name, command and role.
--
-- A denied read surfaces through the Storage API as 400 "Object not found",
-- the same as a missing object, so a reader cannot probe what exists.

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
      or c.number <= (select s.free_chapters_at_start from public.app_settings s)
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
  'chapter''s current audio_path, and the chapter is free by access, free by '
  'position (app_settings.free_chapters_at_start) or unlocked by the caller. '
  'Used by the audio_read storage policy. A malformed path returns false, '
  'never an error. Subscribers wait for the entitlement mirror (prompt 22a).';

-- Postgres grants execute to PUBLIC by default, and this project's default
-- privileges grant it to anon by name as well, so both are revoked. The
-- policy runs as the signed-in caller, so authenticated needs it; anon has
-- no audio access at all.
revoke all on function public.can_play_audio(text) from public, anon;
grant execute on function public.can_play_audio(text) to authenticated;

alter policy audio_read on storage.objects
  using (
    bucket_id = 'audio'
    and (public.is_admin() or public.can_play_audio(name))
  );

-- Teardown (local resets only): restore the old policy, then drop the
-- function.
-- alter policy audio_read on storage.objects using (bucket_id = 'audio');
-- drop function if exists public.can_play_audio(text);
