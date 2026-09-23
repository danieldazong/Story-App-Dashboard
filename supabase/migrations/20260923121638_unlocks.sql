-- unlocks: permanent per-chapter grants for the Talebrim mobile app's
-- paywall.
--
-- PURELY ADDITIVE. Creates one table with its indexes, grants and one policy.
-- Alters no existing table, view, enum, function or policy.
--
-- Decided 2026-09-23:
--   * PERMANENT, no expiry. An expiring unlock would make "unlocked"
--     time-dependent, which the app's persisted cache cannot see. A nullable
--     expires_at can be added later.
--   * PER USER AND CHAPTER. Per user alone would unlock a whole 85-200
--     chapter serial from one rewarded ad.
--   * SERVER-WRITTEN ONLY. Readers may read their own unlocks and nothing
--     else. If the app could insert here, anyone replaying their own token
--     could grant themselves every locked chapter. Rows are written by a
--     server function (service_role) only after the ad network or the store
--     confirms the ad or purchase. Opening client inserts later is one
--     additive policy; taking them away after the app depends on them is not.

create table public.unlocks (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user id, text like activity_log.actor_id, never uuid. The default
  -- is for symmetry with the other reader tables; the server writer supplies
  -- it explicitly.
  user_id text not null default (auth.jwt() ->> 'sub'),
  -- CASCADE: a chapter the dashboard deletes takes its unlocks with it,
  -- instead of the delete failing on them.
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  source text not null check (source in ('ad', 'purchase')),
  created_at timestamptz not null default now(),
  -- One grant per reader per chapter. The leading user_id also serves the
  -- policy below.
  constraint unlocks_user_chapter_key unique (user_id, chapter_id)
);

comment on table public.unlocks is
  'Permanent per-chapter grants only: a rewarded ad watched or a one-off '
  'purchase. NEVER written for a subscription: subscription access is computed '
  'from the RevenueCat entitlement at read time, so a lapsed subscriber keeps '
  'no stale grants and nothing needs revoking. Written by the server '
  '(service_role) only; readers can select their own rows.';
comment on column public.unlocks.source is
  'What earned the grant: ad (rewarded ad) or purchase (one-off chapter purchase).';

-- The cascade above looks rows up by this.
create index unlocks_chapter_idx on public.unlocks (chapter_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.unlocks enable row level security;

-- New public tables inherit ALL rights for anon and authenticated here,
-- TRUNCATE included. anon gets nothing, and authenticated gets SELECT only:
-- with no insert, update or delete grant, those fail on privilege before RLS
-- is even consulted. service_role keeps its default rights for the writer.
revoke all on table public.unlocks from anon, authenticated;
grant select on table public.unlocks to authenticated;

-- A reader sees only their own grants; no is_admin() branch on purpose.
create policy unlocks_select on public.unlocks
  for select
  to authenticated
  using (user_id = (select auth.jwt() ->> 'sub'));

-- Teardown (local resets only)
-- drop table if exists public.unlocks;
