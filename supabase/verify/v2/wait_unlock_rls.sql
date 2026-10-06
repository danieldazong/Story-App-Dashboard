-- VERSION 2. NOT RUN IN VERSION 1.
--
-- Version 1 is subscription-only, so the database holds none of what this
-- script tests: claim_wait_unlock() and wait_unlock_status() were dropped by
-- 20261006120000_remove_wait_unlock.sql, and run against the live database it
-- fails every check. It is kept for the day wait-for-free comes back (the
-- mobile app's prompt 23, deferred by the owner on 2026-10-06): add a NEW
-- migration with the SQL of 20261003120000_wait_unlock.sql, then run this file.
--
-- Rehearsed on 2026-10-06: that migration's SQL, then this script, inside a
-- transaction that rolls back, passed 58 of 58.
--
-- Verification for wait-for-free (migration 20261003120000, the mobile app's
-- prompt 23, Part A): public.claim_wait_unlock(), public.wait_unlock_status()
-- and the widened unlocks_source_check.
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/verify/wait_unlock_rls.sql
--
-- LEAVES NOTHING BEHIND. The rows it seeds (entitlements and unlocks for fake
-- readers, and every unlock the claims themselves write) are created inside a
-- subtransaction that ends by raising on purpose, which rolls them back
-- whatever client runs the file. Only the pass/fail report survives, in a
-- temp table that disappears with the session. Nothing is written to books or
-- chapters.
--
-- Callers are impersonated the way PostgREST does it: SET ROLE plus
-- request.jwt.claims, which is what auth.jwt() reads. The fake Clerk ids
-- (user_rlstestWait*) match the entitlements table's user id check, and no
-- real account can have them:
--   A      a reader with no plan and no unlock: the main flow
--   B      a second reader: isolation, and a free chapter spends nothing
--   U      a reader who already holds an AD unlock for one locked chapter
--   S      a Talebrim Unlimited subscriber (an entitlement that ends in an hour)
--   E      a reader whose plan ended an hour ago
--   Z      only a constraint probe
--   admin  metadata.role = admin: just a reader here
--   anon, service (service_role: no caller at all), and setup (the table
--   owner, which seeds, ages rows and inspects)
--
-- The clock: everything runs in ONE transaction, where now() stands still.
-- A claim's row is created at exactly now(), so its cooldown is exactly 86400
-- seconds, and the script ages rows by updating created_at as the owner to
-- test the edges (23 h 59 min 59.5 s left, which rounds up to 1, and exactly
-- 24 hours, which is over).
--
-- It tests the live catalog, so it picks its chapters by what they are. A
-- check whose kind of row doesn't exist live (a chapter of a draft book)
-- reports "none live" and passes, so the report says what it could not test.
--
-- Expected outcomes: a plain value for a select (a status word, a number,
-- "true"), "rows=N" for a statement that runs, or "error NNNNN" (42501
-- insufficient privilege; 23514 a check constraint) for one that must be
-- refused. Real concurrency (two claims at once) can't be made in one
-- session: the advisory lock is checked here, and the HTTP proof fires
-- simultaneous claims.

create temp table wait_unlock_results (
  n int,
  caller text,
  check_name text,
  expected text,
  actual text,
  pass boolean
);

do $test$
declare
  reader_a constant text := 'user_rlstestWaitA';
  reader_b constant text := 'user_rlstestWaitB';
  reader_u constant text := 'user_rlstestWaitU';
  subscriber constant text := 'user_rlstestWaitS';
  lapsed constant text := 'user_rlstestWaitE';
  probe constant text := 'user_rlstestWaitZ';
  book_a uuid;
  book_b uuid;
  locked_ids uuid[];
  l1 uuid;
  l2 uuid;
  l3 uuid;
  m1 uuid;
  free_id uuid;
  free_book uuid;
  draft_id uuid;
  subs jsonb;
  sub_key text;
  sub_value text;
  t record;
  stmt text;
  n bigint;
  actual text;
  results jsonb := '[]';
  i int := 0;
begin
  begin
    -- Test data and checks. Everything in this block is rolled back.

    -- A published book with at least three locked chapters.
    select c.book_id into book_a
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published' and c.access = 'locked'
    group by c.book_id
    having count(*) >= 3
    order by c.book_id
    limit 1;

    if book_a is null then
      raise exception using errcode = 'VF001', message = 'needs a published book with three locked chapters';
    end if;

    select array_agg(s.id order by s.number) into locked_ids
    from (
      select c.id, c.number from public.chapters c
      where c.book_id = book_a and c.access = 'locked'
      order by c.number limit 3
    ) s;
    l1 := locked_ids[1];
    l2 := locked_ids[2];
    l3 := locked_ids[3];

    -- A locked chapter of another published book.
    select c.book_id, c.id into book_b, m1
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published' and c.access = 'locked' and c.book_id <> book_a
    order by c.id
    limit 1;

    if book_b is null then
      raise exception using errcode = 'VF001', message = 'needs a second published book with a locked chapter';
    end if;

    -- A free chapter of a published book.
    select c.id, c.book_id into free_id, free_book
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published' and c.access = 'free'
    order by c.id
    limit 1;

    if free_id is null then
      raise exception using errcode = 'VF001', message = 'needs a free chapter in a published book';
    end if;

    -- A chapter of a draft book, if the dashboard holds one right now.
    select c.id into draft_id
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status <> 'published'
    order by c.id
    limit 1;

    -- Seeded as the table owner, which RLS does not restrict.
    insert into public.entitlements (user_id, entitlement, expires_at, store, environment) values
      (subscriber, 'ad_free', now() + interval '1 hour', 'test_store', 'sandbox'),
      (lapsed, 'ad_free', now() - interval '1 hour', 'test_store', 'sandbox');
    insert into public.unlocks (user_id, chapter_id, source) values (reader_u, l1, 'ad');

    subs := jsonb_build_object(
      '{A}', quote_literal(reader_a),
      '{B}', quote_literal(reader_b),
      '{U}', quote_literal(reader_u),
      '{S}', quote_literal(subscriber),
      '{Z}', quote_literal(probe),
      '{L1}', quote_literal(l1::text),
      '{L2}', quote_literal(l2::text),
      '{L3}', quote_literal(l3::text),
      '{M1}', quote_literal(m1::text),
      '{FREE}', quote_literal(free_id::text),
      '{FREEBOOK}', quote_literal(free_book::text),
      '{BOOKA}', quote_literal(book_a::text),
      '{BOOKB}', quote_literal(book_b::text),
      '{DRAFT}', coalesce(quote_literal(draft_id::text), 'null')
    );

    for t in
      select * from (
        select row_number() over () as ord, v.*
        from (values
          -- unlocks_source_check
          ('setup', 'unlocks_source_check accepts wait', $q$insert into public.unlocks (user_id, chapter_id, source) values ({Z}, {L3}, 'wait')$q$, 'rows=1'),
          ('setup', 'unlocks_source_check still refuses any other word', $q$insert into public.unlocks (user_id, chapter_id, source) values ({Z}, {L2}, 'gift')$q$, 'error 23514'),
          ('setup', 'unlocks_source_check still accepts ad and purchase', $q$insert into public.unlocks (user_id, chapter_id, source) values ({Z}, {L1}, 'ad'), ({Z}, {L2}, 'purchase')$q$, 'rows=2'),
          ('setup', 'clears the probe rows', $q$delete from public.unlocks where user_id = {Z}$q$, 'rows=3'),

          -- Readers still write nothing to unlocks themselves
          ('A', 'cannot insert an unlock itself', $q$insert into public.unlocks (user_id, chapter_id, source) values ({A}, {L1}, 'wait')$q$, 'error 42501'),
          ('A', 'cannot update an unlock', $q$update public.unlocks set source = 'wait'$q$, 'error 42501'),
          ('A', 'cannot delete an unlock', $q$delete from public.unlocks$q$, 'error 42501'),
          ('A', 'cannot truncate unlocks', $q$truncate public.unlocks$q$, 'error 42501'),
          ('anon', 'cannot read unlocks', $q$select count(*) from public.unlocks$q$, 'error 42501'),

          -- The first claim
          ('A', 'has no wait before any claim', $q$select public.wait_unlock_status({BOOKA})$q$, '0'),
          ('A', 'claims a locked chapter', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'claimed'),
          ('setup', 'wrote exactly one wait row for that reader and chapter', $q$select count(*) from public.unlocks where user_id = {A} and chapter_id = {L1} and source = 'wait'$q$, '1'),
          ('setup', 'took the advisory lock for that reader and story', $q$select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted and ((classid::bigint << 32) | objid::bigint) = hashtextextended({A} || ':' || {BOOKA}, 0)$q$, '1'),
          ('A', 'sees that row through its own policy', $q$select count(*) from public.unlocks where chapter_id = {L1}$q$, '1'),
          ('A', 'has exactly 24 hours to wait in that story', $q$select public.wait_unlock_status({BOOKA})$q$, '86400'),

          -- The cooldown
          ('A', 'a second chapter of the same story is a cooldown', $q$select public.claim_wait_unlock({L2})->>'status'$q$, 'cooldown'),
          ('A', 'whose seconds_left is the status function''s, in range', $q$select (public.claim_wait_unlock({L2})->>'seconds_left')::int = public.wait_unlock_status({BOOKA}) and public.wait_unlock_status({BOOKA}) between 1 and 86400$q$, 'true'),
          ('setup', 'wrote no new row for it', $q$select count(*) from public.unlocks where user_id = {A}$q$, '1'),
          ('A', 'a chapter of another story is claimed', $q$select public.claim_wait_unlock({M1})->>'status'$q$, 'claimed'),
          ('A', 'and that story has its own 24 hours', $q$select public.wait_unlock_status({BOOKB})$q$, '86400'),
          ('A', 'the same chapter again is not_locked', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'not_locked'),
          ('A', 'and spends nothing: the story''s wait is unchanged', $q$select public.wait_unlock_status({BOOKA})$q$, '86400'),
          ('setup', 'two rows so far, one per story', $q$select count(*) from public.unlocks where user_id = {A}$q$, '2'),

          -- The edges, by ageing the row as the owner
          ('setup', 'ages the first claim by 23 h 59 min 59.5 s', $q$update public.unlocks set created_at = created_at - interval '23 hours 59 minutes 59.5 seconds' where user_id = {A} and chapter_id = {L1}$q$, 'rows=1'),
          ('A', 'half a second left rounds up to 1 second', $q$select public.wait_unlock_status({BOOKA})$q$, '1'),
          ('A', 'and a claim then is a cooldown of 1 second', $q$select public.claim_wait_unlock({L2})->>'seconds_left'$q$, '1'),
          ('setup', 'ages it by the last half second: exactly 24 hours', $q$update public.unlocks set created_at = created_at - interval '0.5 seconds' where user_id = {A} and chapter_id = {L1}$q$, 'rows=1'),
          ('A', 'exactly 24 hours is over: no wait', $q$select public.wait_unlock_status({BOOKA})$q$, '0'),
          ('A', 'and the next claim is claimed', $q$select public.claim_wait_unlock({L2})->>'status'$q$, 'claimed'),
          ('A', 'the newest wait row governs, the older one is ignored', $q$select public.wait_unlock_status({BOOKA})$q$, '86400'),
          ('A', 'sees only its own three rows', $q$select count(*) from public.unlocks$q$, '3'),
          ('setup', 'fingerprints A''s rows', $q$select count(*) from (select set_config('wait_test.fp_a', md5(coalesce(string_agg(id::text || created_at::text || source, ',' order by id), '')), true) from public.unlocks where user_id = {A}) s$q$, '1'),

          -- Nothing to unlock, or nothing to spend
          ('B', 'a free chapter is not_locked', $q$select public.claim_wait_unlock({FREE})->>'status'$q$, 'not_locked'),
          ('B', 'and spends no cooldown', $q$select public.wait_unlock_status({FREEBOOK})$q$, '0'),
          ('B', 'so a locked chapter of that story is still claimed', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'claimed'),
          ('B', 'sees only its own row', $q$select count(*) from public.unlocks$q$, '1'),
          ('A', 'cannot see another reader''s rows', $q$select count(*) from public.unlocks where user_id = {B}$q$, '0'),
          ('U', 'a chapter it unlocked by an ad is not_locked', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'not_locked'),
          ('U', 'an ad unlock never starts the cooldown', $q$select public.wait_unlock_status({BOOKA})$q$, '0'),
          ('U', 'so it can still claim another chapter', $q$select public.claim_wait_unlock({L2})->>'status'$q$, 'claimed'),

          -- Subscribers and lapsed plans
          ('S', 'a subscriber is subscribed, and spends nothing', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'subscribed'),
          ('setup', 'wrote no row for the subscriber', $q$select count(*) from public.unlocks where user_id = {S}$q$, '0'),
          ('S', 'has no wait', $q$select public.wait_unlock_status({BOOKA})$q$, '0'),
          ('E', 'a reader whose plan ended is a free reader: claimed', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'claimed'),
          ('admin', 'an admin is just a reader here: claimed', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'claimed'),

          -- Unavailable
          ('A', 'a chapter that does not exist is unavailable', $q$select public.claim_wait_unlock(gen_random_uuid())->>'status'$q$, 'unavailable'),
          ('A', 'a null chapter is unavailable', $q$select public.claim_wait_unlock(null)->>'status'$q$, 'unavailable'),
          ('A', 'a chapter of a draft book is unavailable', case when draft_id is null then 'none live' else $q$select public.claim_wait_unlock({DRAFT})->>'status'$q$ end, case when draft_id is null then 'none live' else 'unavailable' end),
          ('A', 'a story that does not exist has no wait', $q$select public.wait_unlock_status(gen_random_uuid())$q$, '0'),
          ('service', 'no caller at all is unavailable', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'unavailable'),

          -- Who may call them
          ('anon', 'cannot claim', $q$select public.claim_wait_unlock({L1})->>'status'$q$, 'error 42501'),
          ('anon', 'cannot read the status', $q$select public.wait_unlock_status({BOOKA})$q$, 'error 42501'),
          ('setup', 'anon holds no EXECUTE on either', $q$select not has_function_privilege('anon', 'public.claim_wait_unlock(uuid)', 'execute') and not has_function_privilege('anon', 'public.wait_unlock_status(uuid)', 'execute')$q$, 'true'),
          ('setup', 'PUBLIC holds no EXECUTE on either', $q$select not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid in ('public.claim_wait_unlock(uuid)'::regprocedure, 'public.wait_unlock_status(uuid)'::regprocedure) and a.grantee = 0)$q$, 'true'),
          ('setup', 'signed-in readers hold EXECUTE on both', $q$select has_function_privilege('authenticated', 'public.claim_wait_unlock(uuid)', 'execute') and has_function_privilege('authenticated', 'public.wait_unlock_status(uuid)', 'execute')$q$, 'true'),
          ('setup', 'both are security definer with an empty search_path', $q$select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p where p.oid in ('public.claim_wait_unlock(uuid)'::regprocedure, 'public.wait_unlock_status(uuid)'::regprocedure)$q$, 'true'),

          -- Everyone else's claims left A's rows alone
          ('setup', 'A''s rows are exactly as they were', $q$select md5(coalesce(string_agg(id::text || created_at::text || source, ',' order by id), '')) = current_setting('wait_test.fp_a') from public.unlocks where user_id = {A}$q$, 'true'),
          ('A', 'and A still sees three', $q$select count(*) from public.unlocks$q$, '3')
        ) as v(caller, check_name, sql, expected)
      ) numbered
      order by ord
    loop
      if t.sql = 'none live' then
        actual := 'none live';
      else
        stmt := t.sql;
        for sub_key, sub_value in select * from jsonb_each_text(subs) loop
          stmt := replace(stmt, sub_key, sub_value);
        end loop;

        perform set_config('request.jwt.claims', case t.caller
          when 'A' then json_build_object('sub', reader_a, 'role', 'authenticated')::text
          when 'B' then json_build_object('sub', reader_b, 'role', 'authenticated')::text
          when 'U' then json_build_object('sub', reader_u, 'role', 'authenticated')::text
          when 'S' then json_build_object('sub', subscriber, 'role', 'authenticated')::text
          when 'E' then json_build_object('sub', lapsed, 'role', 'authenticated')::text
          when 'admin' then '{"sub":"user_rlstestWaitAdmin","role":"authenticated","metadata":{"role":"admin"}}'
          when 'service' then '{"role":"service_role"}'
          when 'setup' then '{}'
          else '{"role":"anon"}'
        end, true);
        if t.caller = 'anon' then
          set local role anon;
        elsif t.caller = 'service' then
          set local role service_role;
        elsif t.caller = 'setup' then
          set local role postgres;
        else
          set local role authenticated;
        end if;

        begin
          if stmt ~* '^\s*select' then
            execute stmt into actual;
            actual := coalesce(actual, 'null');
          else
            execute stmt;
            get diagnostics n = row_count;
            actual := 'rows=' || n;
          end if;
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

  insert into wait_unlock_results
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
from wait_unlock_results
order by n;
