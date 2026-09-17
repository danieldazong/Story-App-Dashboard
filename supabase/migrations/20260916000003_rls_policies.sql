-- Row Level Security for the catalog.
--
-- RLS IS THE ENFORCEMENT BOUNDARY. The Next.js proxy (src/proxy.ts) and the
-- requireAdmin() check in the (dashboard) layout are UX, not security. Assume an
-- attacker holds a valid non-admin token and is calling the PostgREST API
-- directly. Every policy below must hold under that assumption.

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

-- The Clerk user id. Stored and compared as text throughout — Clerk ids are not
-- uuids and must never be cast to one.
create or replace function clerk_user_id()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'sub';
$$;

-- Admin check.
--
-- Roles live in Clerk publicMetadata and reach the token via the session-token
-- claim configured in the Clerk Dashboard:
--   {"metadata": "{{user.public_metadata}}"}
-- which produces a token containing: { "metadata": { "role": "admin" }, ... }
--
-- !! UNVERIFIED AGAINST A LIVE TOKEN !!
-- Prompt 12 requires decoding a real session token and confirming this path
-- before trusting it. That could not be done at authoring time (no linked
-- Supabase project). If the path is wrong this function returns false for
-- everyone and every policy below denies everything — which fails closed, not
-- open, but will look like a total outage. Verify with:
--   select auth.jwt();
-- while authenticated as a known admin, and correct the path here if it differs.
create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'metadata' ->> 'role', '') = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- books
-- ---------------------------------------------------------------------------

alter table books enable row level security;

-- Admins see every book, including drafts. Everyone else authenticated sees
-- published books only — this is what the mobile reader consumes.
create policy books_select on books
  for select
  to authenticated
  using (is_admin() or status = 'published');

create policy books_insert on books
  for insert
  to authenticated
  with check (is_admin());

create policy books_update on books
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy books_delete on books
  for delete
  to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- chapters
-- ---------------------------------------------------------------------------

alter table chapters enable row level security;

-- IMPORTANT: script_text is readable by any authenticated non-admin whose parent
-- book is published — the mobile reader needs it to render chapter prose.
--
-- LOCKED CHAPTERS ARE NOT PROTECTED AT THE ROW LEVEL. `access = 'locked'` is a
-- paywall state the mobile app enforces through its entitlement flow; it is NOT
-- a row-level secret. Do not later assume a locked chapter's text is unreadable
-- by an authenticated reader — it is readable, by design, and any real
-- entitlement gate must live in the app or in a separate signed-URL path.
create policy chapters_select on chapters
  for select
  to authenticated
  using (
    is_admin()
    or exists (
      select 1
      from books b
      where b.id = chapters.book_id
        and b.status = 'published'
    )
  );

create policy chapters_insert on chapters
  for insert
  to authenticated
  with check (is_admin());

create policy chapters_update on chapters
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy chapters_delete on chapters
  for delete
  to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- activity_log — admin read, admin insert, append-only
-- ---------------------------------------------------------------------------

alter table activity_log enable row level security;

create policy activity_log_select on activity_log
  for select
  to authenticated
  using (is_admin());

create policy activity_log_insert on activity_log
  for insert
  to authenticated
  with check (is_admin());

-- Deliberately no update or delete policy, for anyone. An audit trail that can
-- be rewritten is not an audit trail. With RLS enabled and no policy, both
-- operations are denied to every caller including admins.

-- ---------------------------------------------------------------------------
-- app_settings — admin only, read and write
-- ---------------------------------------------------------------------------

alter table app_settings enable row level security;

create policy app_settings_select on app_settings
  for select
  to authenticated
  using (is_admin());

create policy app_settings_insert on app_settings
  for insert
  to authenticated
  with check (is_admin());

create policy app_settings_update on app_settings
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

-- No delete policy: the single settings row is not deletable.

-- ---------------------------------------------------------------------------
-- Teardown (local resets only)
-- ---------------------------------------------------------------------------
-- drop policy if exists app_settings_update on app_settings;
-- drop policy if exists app_settings_insert on app_settings;
-- drop policy if exists app_settings_select on app_settings;
-- drop policy if exists activity_log_insert on activity_log;
-- drop policy if exists activity_log_select on activity_log;
-- drop policy if exists chapters_delete on chapters;
-- drop policy if exists chapters_update on chapters;
-- drop policy if exists chapters_insert on chapters;
-- drop policy if exists chapters_select on chapters;
-- drop policy if exists books_delete on books;
-- drop policy if exists books_update on books;
-- drop policy if exists books_insert on books;
-- drop policy if exists books_select on books;
-- drop function if exists is_admin();
-- drop function if exists clerk_user_id();
