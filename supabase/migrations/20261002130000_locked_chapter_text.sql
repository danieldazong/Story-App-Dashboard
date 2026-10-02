-- Locked chapter text on the server (the mobile app's prompt 22a, Part C).
--
-- ONE CHANGE TO A DASHBOARD-OWNED OBJECT, sanctioned by the owner on
-- 2026-10-02: the third, after the catalog broadcast triggers and the audio
-- policy. It rewrites the using clause of chapters_select and nothing else on
-- chapters: the insert, update and delete policies, the columns, the
-- triggers and every other table are untouched. 20260916000003's comment
-- ("LOCKED CHAPTERS ARE NOT PROTECTED AT THE ROW LEVEL") describes the policy
-- as it was.
--
-- BEFORE: any signed-in reader could select every chapter of a published
-- book, a locked chapter's script_text and audio_path included. The mobile
-- app never asked for one, but nothing on the server stopped a reader
-- replaying their own token against the API.
--
-- AFTER: an admin reads every chapter, exactly as before (is_admin()), so
-- the dashboard sees no change. A reader gets a published book's chapter
-- only when it is free by its own access, unlocked by them (an unlocks
-- row), or they hold Talebrim Unlimited (has_active_plan(), from
-- 20261002120000). Any other chapter returns no row at all: the same rule as
-- the audio policy's can_play_audio(), and the mobile app's lock rule
-- (resolveChapterState() in talebrim-app/src/types/states.ts).
--
-- THE CATALOG VIEWS keep listing every published chapter, the locked ones
-- included, as the app's chapter lists, lock icons and paywall need. Until
-- now they ran with the caller's RLS (security_invoker = on), which would
-- now hide locked chapters from them and change books_catalog's counts. They
-- run as their owner instead (security_invoker = off), which is safe because:
--   - neither holds text: chapters_catalog has has_text and text_bytes, never
--     script_text, and neither has audio_path;
--   - both select only published books by construction (their own where
--     clause), so drafts stay invisible without RLS;
--   - security_barrier = on keeps a caller's own filter from running before
--     that where clause, so it can never see a draft row's values;
--   - their grants narrow from Supabase's default ALL, for anon and
--     authenticated, to SELECT for authenticated. No signed-out screen of the
--     app reads either view (checked 2026-10-02: the sign-in screens read only
--     reader_settings()).
-- Supabase's security advisor flags a view without security_invoker
-- (security_definer_view). Expected here, for the reasons above.
--
-- WHY ALTER POLICY: it swaps the expression in one statement, so there is no
-- moment with no select policy, and the policy keeps its name, command and
-- role.

alter policy chapters_select on public.chapters
  using (
    public.is_admin()
    or (
      exists (
        select 1
        from public.books b
        where b.id = chapters.book_id
          and b.status = 'published'
      )
      and (
        chapters.access = 'free'
        or exists (
          select 1
          from public.unlocks u
          where u.user_id = (select auth.jwt() ->> 'sub')
            and u.chapter_id = chapters.id
        )
        -- Once per query (an InitPlan), not once per row.
        or (select public.has_active_plan())
      )
    )
  );

-- A later `create or replace view` of either must restate both options:
-- leaving one out resets it.
alter view public.books_catalog set (security_invoker = off, security_barrier = on);
alter view public.chapters_catalog set (security_invoker = off, security_barrier = on);

revoke all on table public.books_catalog from anon, authenticated;
revoke all on table public.chapters_catalog from anon, authenticated;
grant select on table public.books_catalog to authenticated;
grant select on table public.chapters_catalog to authenticated;

comment on view public.books_catalog is
  'Published books with computed chapter/audio/free counts, for the mobile '
  'reader. Excludes drafts by construction. Runs as its owner since '
  '20261002130000 (security_invoker off, security_barrier on), so its counts '
  'include the chapters a reader may not open; SELECT for authenticated '
  'only. The admin dashboard does NOT use this view - it needs drafts and '
  'uses books directly.';

comment on view public.chapters_catalog is
  'Chapter metadata for mobile list screens, locked chapters included. Omits '
  'script_text and audio_path deliberately: prose is read per chapter from '
  'chapters, whose policy returns it only to a reader who may open the '
  'chapter. Excludes chapters of unpublished books by construction. Runs as '
  'its owner since 20261002130000 (security_invoker off, security_barrier '
  'on); SELECT for authenticated only. audio_size_bytes and text_bytes size '
  'the offline downloads.';

-- Teardown (local resets only): restore the old policy and the views'
-- options and grants.
-- alter policy chapters_select on public.chapters using (
--   is_admin() or exists (select 1 from books b where b.id = chapters.book_id and b.status = 'published'));
-- alter view public.books_catalog set (security_invoker = on, security_barrier = off);
-- alter view public.chapters_catalog set (security_invoker = on, security_barrier = off);
-- grant all on table public.books_catalog to anon, authenticated;
-- grant all on table public.chapters_catalog to anon, authenticated;
