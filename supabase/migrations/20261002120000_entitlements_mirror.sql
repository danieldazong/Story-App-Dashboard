-- The entitlement mirror: which readers hold Talebrim Unlimited, so the
-- server's own checks can honour the plan (the mobile app's prompt 22a).
--
-- WHY: the mobile app knows who subscribes (RevenueCat's SDK on the phone);
-- the server didn't. So a subscriber's locked narration was refused by the
-- audio policy, and couldn't be downloaded either.
--
-- ADDITIVE, plus one function body. Creates one table and one function, and
-- replaces the -- TODO(paywall) in public.can_play_audio() with the
-- subscriber branch (only the body changes: same signature, security and
-- grants, as on 2026-09-30). Nothing on books, chapters, app_settings or
-- activity_log, and no policy changes.
--
-- WHO WRITES IT: two Edge Functions, with the project's secret key, both
-- through supabase/functions/_shared/entitlements.ts: revenuecat-webhook
-- (RevenueCat calls it on every purchase, renewal, cancellation and expiry)
-- and sync-entitlement (the app calls it after a purchase or restore). Each
-- reads the customer's active entitlements from RevenueCat's REST API and
-- writes what RevenueCat says, never what the phone or a webhook's own
-- fields say. delete-account deletes the reader's row with their account.

-- ---------------------------------------------------------------------------
-- entitlements: one row per reader while RevenueCat says their plan is active
-- ---------------------------------------------------------------------------

create table public.entitlements (
  -- Clerk user id, text like every reader table, never uuid. It is also the
  -- reader's RevenueCat App User ID: the app logs in with it.
  user_id text not null check (user_id ~ '^user_[A-Za-z0-9]+$'),
  -- The entitlement's identifier in the app: 'ad_free', Talebrim Unlimited.
  entitlement text not null,
  -- When RevenueCat says it ends: through a billing grace period, the grace
  -- period's end. Null for no end date.
  expires_at timestamptz,
  -- From the subscription that gives the access, when one does (a
  -- promotional grant has none): RevenueCat's product id, its store
  -- ('play_store', 'test_store', ...) and its environment ('production' or
  -- 'sandbox'). Sandbox and Test Store plans count, as they do in the app.
  product_id text,
  store text,
  environment text,
  -- When RevenueCat was last asked. sync-entitlement answers from the row
  -- for 10 seconds after it, rather than spend RevenueCat's rate limit.
  synced_at timestamptz not null default now(),
  primary key (user_id, entitlement)
);

comment on table public.entitlements is
  'Mobile app: readers whose RevenueCat entitlement is active (Talebrim '
  'Unlimited), mirrored for the server''s own checks. Written only by the '
  'revenuecat-webhook and sync-entitlement Edge Functions from RevenueCat''s '
  'REST API. Server only: readers ask through has_active_plan().';

-- Server only: RLS on with no policy, and no grants to anon or
-- authenticated, which new public tables would otherwise inherit (ALL,
-- TRUNCATE included). service_role, which bypasses RLS, keeps its default
-- rights: the functions write with the project's secret key.
alter table public.entitlements enable row level security;
revoke all on table public.entitlements from anon, authenticated;

-- ---------------------------------------------------------------------------
-- has_active_plan(): does the caller hold Talebrim Unlimited right now?
-- ---------------------------------------------------------------------------

-- The server's clock decides when a plan ends: a row past its expires_at
-- counts for nothing, so a lapse takes effect on time even if no webhook
-- arrives to delete the row.
create or replace function public.has_active_plan()
returns boolean
language sql
stable
security definer
-- Empty search_path so a definer-rights function cannot be steered to an
-- object planted earlier on the path. Every name below is schema-qualified.
set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.user_id = (auth.jwt() ->> 'sub')
      and e.entitlement = 'ad_free'
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

comment on function public.has_active_plan() is
  'True when the caller holds an active ad_free entitlement (Talebrim '
  'Unlimited) in the mirror: a row whose expires_at is null or later than '
  'now. Used by can_play_audio().';

-- Postgres grants EXECUTE to PUBLIC, and this project's default privileges
-- to anon by name as well. Signed-in readers only.
revoke all on function public.has_active_plan() from public, anon;
grant execute on function public.has_active_plan() to authenticated;

-- ---------------------------------------------------------------------------
-- can_play_audio(): the subscriber branch
-- ---------------------------------------------------------------------------

-- As 20260930120000's body, with -- TODO(paywall) replaced by the plan.
-- Subscribers can then play, and download, a chapter the dashboard locked;
-- nobody else can. CREATE OR REPLACE keeps the owner and the grants
-- (authenticated only). The audio_read policy that calls it is untouched.
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
      -- Talebrim Unlimited opens every chapter, the locked ones included.
      or public.has_active_plan()
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
  'chapter''s current audio_path, and the chapter is free by its own access, '
  'unlocked by the caller, or the caller holds Talebrim Unlimited '
  '(has_active_plan()). Used by the audio_read storage policy. A malformed '
  'path returns false, never an error.';

-- Teardown (local resets only): re-apply 20260930120000's function body,
-- then drop the function and the table.
-- drop function if exists public.has_active_plan();
-- drop table if exists public.entitlements;
