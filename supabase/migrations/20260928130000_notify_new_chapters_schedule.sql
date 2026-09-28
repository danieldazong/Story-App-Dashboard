-- The schedule for the mobile app's new-chapter alerts: every 5 minutes,
-- pg_cron calls the Edge Function notify-new-chapters through pg_net
-- (migration 20260928120000 enabled both extensions and created the job's
-- tables and functions).
--
-- PURELY ADDITIVE. Creates one cron job. Alters nothing.
--
-- Applied after the function is deployed and both copies of its shared
-- secret exist: Vault's `notify_new_chapters_secret`, and the function's
-- NOTIFY_CRON_SECRET. The secret is never in this file: the job reads it from
-- Vault at each run, so rotating it is two sets and no migration. Without it
-- the header is empty and the function answers 403, sending nothing.
--
-- The function's own runs take seconds, and Edge Functions stop well within
-- 5 minutes, so two runs never overlap.

select cron.schedule(
  'notify-new-chapters',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://fwjrdzzdtshbqrfkgivd.supabase.co/functions/v1/notify-new-chapters',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'notify_new_chapters_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Teardown (local resets only)
-- select cron.unschedule('notify-new-chapters');
