-- Verification for the entitlement mirror (migration 20261002120000, the
-- mobile app's prompt 22a): public.entitlements, public.has_active_plan()
-- and the subscriber branch of public.can_play_audio().
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/verify/entitlements_rls.sql
--
-- LEAVES NOTHING BEHIND. The rows it seeds (entitlements for fake readers)
-- are created inside a subtransaction that ends by raising on purpose, which
-- rolls them back whatever client runs the file. Only the pass/fail report
-- survives, in a temp table that disappears with the session. Nothing is
-- written to books, chapters or storage.
--
-- Callers are impersonated the way PostgREST and the Storage API do it: SET
-- ROLE plus request.jwt.claims, which is what auth.jwt() reads. The fake
-- Clerk ids (user_rlstestPlan*) match the table's user id check, and no real
-- account can have them:
--   A  an active plan (ends in an hour)
--   B  a plan that ended an hour ago, its row not yet deleted
--   C  no row at all
--   L  a plan with no end date
--   O  an active row for another entitlement only
--   admin  metadata.role = admin, no row
--   service  service_role, as the Edge Functions write
--
-- Expected outcomes: "rows=N" for a statement that runs, or "error NNNNN"
-- (42501 insufficient privilege; 23514 a check constraint) for one that must
-- be refused.

create temp table entitlement_results (
  n int,
  caller text,
  check_name text,
  expected text,
  actual text,
  pass boolean
);

do $test$
declare
  reader_a constant text := 'user_rlstestPlanA';
  reader_b constant text := 'user_rlstestPlanB';
  reader_c constant text := 'user_rlstestPlanC';
  reader_l constant text := 'user_rlstestPlanL';
  reader_o constant text := 'user_rlstestPlanO';
  locked_path text;
  draft_path text;
  wrong_file text;
  published_audio int;
  t record;
  stmt text;
  n bigint;
  actual text;
  results jsonb := '[]';
  i int := 0;
begin
  begin
    -- Test data and checks. Everything in this block is rolled back.

    -- A narrated chapter the dashboard locked, in a published book.
    select c.audio_path into locked_path
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status = 'published' and c.access = 'locked'
    order by c.id limit 1;

    select c.audio_path into draft_path
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status <> 'published'
    order by c.id limit 1;

    -- Its own code, not P0001, which the handler below swallows as the
    -- planned rollback: a missing precondition must fail loudly.
    if locked_path is null then
      raise exception using errcode = 'VF001', message = 'needs a locked narrated chapter in a published book';
    end if;

    -- The locked chapter's own folder, with a file that isn't its current
    -- one: what a replaced upload leaves behind.
    wrong_file := split_part(locked_path, '/', 1) || '/' || split_part(locked_path, '/', 2) || '/not-the-current-file.m4a';

    -- Every object a subscriber may play: each published chapter's current
    -- narration, whatever its access.
    select count(*) into published_audio
    from storage.objects o
    join public.chapters c on c.audio_path = o.name
    join public.books b on b.id = c.book_id
    where o.bucket_id = 'audio' and b.status = 'published';

    -- Seeded as the table owner, which RLS does not restrict.
    insert into public.entitlements (user_id, entitlement, expires_at, store, environment) values
      (reader_a, 'ad_free', now() + interval '1 hour', 'test_store', 'sandbox'),
      (reader_b, 'ad_free', now() - interval '1 hour', 'test_store', 'sandbox'),
      (reader_l, 'ad_free', null, 'promotional', null),
      (reader_o, 'talebrim_pro', now() + interval '1 hour', 'test_store', 'sandbox');

    for t in
      select * from (values
        -- The table: no reader, signed in or not, reads or writes it
        ('A', 'cannot read the table, even its own row', 'select count(*) from public.entitlements', 'error 42501'),
        ('C', 'cannot give itself a plan', 'insert into public.entitlements (user_id, entitlement) values (:c, ''ad_free'')', 'error 42501'),
        ('B', 'cannot extend its ended plan', 'update public.entitlements set expires_at = null where user_id = :b', 'error 42501'),
        ('A', 'cannot delete a row', 'delete from public.entitlements where user_id = :a', 'error 42501'),
        ('A', 'cannot truncate', 'truncate public.entitlements', 'error 42501'),
        ('anon', 'cannot read the table', 'select count(*) from public.entitlements', 'error 42501'),
        ('anon', 'cannot write the table', 'insert into public.entitlements (user_id, entitlement) values (:c, ''ad_free'')', 'error 42501'),
        ('admin', 'cannot read the table either (is_admin() opens nothing here)', 'select count(*) from public.entitlements', 'error 42501'),

        -- The Edge Functions' role writes it
        ('service', 'reads the seeded rows', 'select count(*) from public.entitlements where user_id like ''user_rlstestPlan%''', 'rows=4'),
        ('service', 'writes a row, as a sync does', 'insert into public.entitlements (user_id, entitlement, expires_at) values (:c, ''ad_free'', now() + interval ''1 day'') on conflict (user_id, entitlement) do update set expires_at = excluded.expires_at, synced_at = now()', 'rows=1'),
        ('service', 'deletes it, as a sync of an ended plan does', 'delete from public.entitlements where user_id = :c', 'rows=1'),
        ('service', 'cannot store an id that isn''t a Clerk user id', 'insert into public.entitlements (user_id, entitlement) values (''$RCAnonymousID:0123'', ''ad_free'')', 'error 23514'),

        -- has_active_plan(): the server's clock decides
        ('A', 'has a plan while its row has not ended', 'select count(*) where public.has_active_plan()', 'rows=1'),
        ('B', 'has none once its row has ended, deleted or not', 'select count(*) where public.has_active_plan()', 'rows=0'),
        ('C', 'has none with no row', 'select count(*) where public.has_active_plan()', 'rows=0'),
        ('L', 'has a plan with no end date', 'select count(*) where public.has_active_plan()', 'rows=1'),
        ('O', 'has none from another entitlement', 'select count(*) where public.has_active_plan()', 'rows=0'),
        ('admin', 'is really an admin (is_admin() true)', 'select count(*) from (select 1 where public.is_admin()) s', 'rows=1'),
        ('admin', 'has no plan without a row', 'select count(*) where public.has_active_plan()', 'rows=0'),
        ('anon', 'cannot call it', 'select count(*) where public.has_active_plan()', 'error 42501'),

        -- The audio policy: a subscriber plays, and so downloads, a locked chapter
        ('A', 'may play a locked chapter', 'select count(*) where public.can_play_audio(:locked)', 'rows=1'),
        ('A', 'sees the locked chapter''s object through the policy', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :locked', 'rows=1'),
        ('A', 'sees every published chapter''s narration, no more', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=' || published_audio),
        ('A', 'may not play a file that isn''t the chapter''s current one', 'select count(*) where public.can_play_audio(:wrong)', 'rows=0'),
        ('L', 'may play a locked chapter', 'select count(*) where public.can_play_audio(:locked)', 'rows=1'),
        ('B', 'may not play a locked chapter once its plan ended', 'select count(*) where public.can_play_audio(:locked)', 'rows=0'),
        ('B', 'does not see the locked chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :locked', 'rows=0'),
        ('C', 'may not play a locked chapter', 'select count(*) where public.can_play_audio(:locked)', 'rows=0'),
        ('O', 'may not play a locked chapter', 'select count(*) where public.can_play_audio(:locked)', 'rows=0'),
        ('admin', 'still sees the locked chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :locked', 'rows=1'),
        ('A', 'may not play a chapter of a draft book', case when draft_path is null then 'none live' else 'select count(*) where public.can_play_audio(:draft)' end, case when draft_path is null then 'none live' else 'rows=0' end)
      ) as v(caller, check_name, sql, expected)
    loop
      if t.sql = 'none live' then
        actual := 'none live';
      else
        stmt := replace(replace(replace(replace(replace(replace(t.sql,
          ':locked', quote_literal(locked_path)), ':wrong', quote_literal(wrong_file)),
          ':draft', coalesce(quote_literal(draft_path), 'null')),
          ':a', quote_literal(reader_a)), ':b', quote_literal(reader_b)),
          ':c', quote_literal(reader_c));

        perform set_config('request.jwt.claims', case t.caller
          when 'A' then json_build_object('sub', reader_a, 'role', 'authenticated')::text
          when 'B' then json_build_object('sub', reader_b, 'role', 'authenticated')::text
          when 'C' then json_build_object('sub', reader_c, 'role', 'authenticated')::text
          when 'L' then json_build_object('sub', reader_l, 'role', 'authenticated')::text
          when 'O' then json_build_object('sub', reader_o, 'role', 'authenticated')::text
          when 'admin' then '{"sub":"user_rlstestPlanAdmin","role":"authenticated","metadata":{"role":"admin"}}'
          when 'service' then '{"role":"service_role"}'
          else '{"role":"anon"}'
        end, true);
        if t.caller = 'anon' then
          set local role anon;
        elsif t.caller = 'service' then
          set local role service_role;
        else
          set local role authenticated;
        end if;

        begin
          if stmt ~* '^\s*select' then
            execute stmt into n;
          else
            execute stmt;
            get diagnostics n = row_count;
          end if;
          actual := 'rows=' || n;
        exception when others then
          actual := 'error ' || sqlstate;
        end;

        set local role postgres;
      end if;

      i := i + 1;
      results := results || jsonb_build_object(
        'n', i, 'caller', t.caller, 'check_name', t.check_name,
        'expected', t.expected, 'actual', actual, 'pass', actual = t.expected);
    end loop;

    raise exception using errcode = 'P0001', message = 'roll back all test data';
  exception when sqlstate 'P0001' then
    null; -- the seeded rows are gone; the results live on in `results`
  end;

  insert into entitlement_results
    select * from jsonb_to_recordset(results)
      as x(n int, caller text, check_name text, expected text, actual text, pass boolean);
end
$test$;

select
  n,
  caller,
  check_name,
  expected,
  actual,
  case when pass then 'PASS' else 'FAIL' end as result
from entitlement_results
order by n;
