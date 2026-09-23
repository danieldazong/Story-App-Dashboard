-- Reader-safe subset of app_settings, for the Talebrim mobile app.
--
-- PURELY ADDITIVE. Creates one function. Alters no table, view or policy, so
-- the dashboard's queries, generated types and RLS behaviour are unchanged.
--
-- WHY: app_settings is admin-only (app_settings_select uses is_admin()), which
-- is right for the dashboard. But the mobile app needs three of its values:
-- public_cdn_domain to build cover URLs, and free_chapters_at_start plus
-- default_chapter_access to show which chapters are locked. Verified
-- 2026-09-23 by impersonating a non-admin reader: 0 rows from app_settings,
-- so every cover rendered as a blank box for anyone but the operator.
--
-- WHY A FUNCTION, NOT A POLICY OR A VIEW: a new select policy would hand
-- readers the whole row — bucket names, upload limits, and updated_by, an
-- admin's Clerk user id — and it alters a table the dashboard owns. A view
-- without security_invoker would do the same job, but Supabase flags those as
-- errors. A security definer function returns these three columns and nothing
-- else.
--
-- WHY anon AS WELL: the onboarding screen says "Start with N free chapters"
-- before anyone signs in. None of the three values is secret — the CDN domain
-- appears in every cover URL and the free-chapter count is marketing copy.

create or replace function public.reader_settings()
returns table (
  public_cdn_domain text,
  free_chapters_at_start integer,
  default_chapter_access public.chapter_access
)
language sql
stable
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
  select s.public_cdn_domain, s.free_chapters_at_start, s.default_chapter_access
  from public.app_settings s;
$$;

comment on function public.reader_settings() is
  'The three app_settings values the mobile reader needs (CDN domain, free '
  'chapter count, default access). Runs with definer rights so readers and '
  'signed-out visitors can call it; app_settings itself stays admin-only. '
  'Returns no row when app_settings is empty - callers must treat that as an '
  'error, not invent defaults.';

-- Postgres grants execute to PUBLIC by default; name the audience explicitly.
revoke all on function public.reader_settings() from public;
grant execute on function public.reader_settings() to anon, authenticated;

-- Teardown (local resets only)
-- drop function if exists public.reader_settings();
