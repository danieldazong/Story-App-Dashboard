-- Version 1 is subscription-only: wait-for-free comes out of the database
-- (the mobile app's prompt 23, deferred to version 2 by the owner on
-- 2026-10-06).
--
-- UNDOES 20261003120000_wait_unlock.sql, and nothing else. That migration is
-- applied history and stays in this folder. Version 2 brings the feature back
-- as a NEW migration, by copying its SQL (its verify script is kept in
-- supabase/verify/v2/ for that day).
--
-- WHY IT CAN'T JUST BE LEFT: claim_wait_unlock() is executable by every
-- signed-in reader, through the API, whatever the app shows. With the app's
-- "Unlock free" button gone, anyone who knew the function's name could still
-- open one chapter per story per day without a subscription.
--
-- Touches only the mobile app's own objects: two functions and one check
-- constraint on unlocks. No policy, no view, no grant on unlocks, and nothing
-- on books, chapters, app_settings or activity_log.
--
-- IT NEVER DELETES A READER'S UNLOCK. Putting the check back fails, and the
-- whole migration rolls back with it, if any 'wait' unlock exists. The table
-- held none when this was written (checked 2026-10-06).

-- Best effort: give up on the table lock after 5 seconds rather than queue
-- every reader's query behind a long one (a local setting, gone at the end of
-- this migration's transaction).
select set_config('lock_timeout', '5s', true);

drop function if exists public.claim_wait_unlock(uuid);
drop function if exists public.wait_unlock_status(uuid);

-- One ALTER with both subcommands, so there is no moment without a check.
alter table public.unlocks
  drop constraint unlocks_source_check,
  add constraint unlocks_source_check
    check (source in ('ad', 'purchase'));

-- As 20260923121638 wrote it.
comment on column public.unlocks.source is
  'What earned the grant: ad (rewarded ad) or purchase (one-off chapter purchase).';

-- Teardown (local resets only): none. To bring the feature back, add a new
-- migration with the SQL of 20261003120000_wait_unlock.sql.
