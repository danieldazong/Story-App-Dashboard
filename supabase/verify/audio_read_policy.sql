-- Verification for the audio_read storage policy and public.can_play_audio()
-- (migrations 20260928140000, 20260930120000 and 20261002120000). Since
-- 20260930120000 a chapter is free by its own access only, never by its
-- number: a chapter the owner locks inside app_settings.free_chapters_at_start
-- stays locked. Since 20261002120000 a Talebrim Unlimited subscriber (an
-- active row in public.entitlements, has_active_plan()) plays every
-- published chapter, the locked ones included; once the plan has ended, only
-- the free ones and their own unlocks.
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/verify/audio_read_policy.sql
--
-- LEAVES NOTHING BEHIND. The rows it seeds (an unlock and two entitlements
-- for fake readers) are created inside a subtransaction that ends by raising
-- on purpose, which
-- rolls it back whatever client runs the file. Only the pass/fail report
-- survives, in a temp table that disappears with the session. Nothing is
-- written to books, chapters or storage.
--
-- Callers are impersonated the way the Storage API does it: SET ROLE plus
-- request.jwt.claims, which is what auth.jwt() reads. This proves the rule;
-- the real HTTP requests recorded in AGENTS.md prove the Storage API applies
-- it. Readers A and B and the admin use fake Clerk ids (user_rlstest_*); the
-- subscriber S and the lapsed subscriber E use ids the entitlements table's
-- user id check accepts (user_rlstestSubscriber, user_rlstestLapsed).
--
-- It tests the live catalog, so it picks its chapters by what they are, not
-- by id: a narrated chapter free by access, and two narrated chapters locked
-- past the free run. A check whose kind of chapter doesn't exist live (a
-- narrated chapter locked inside the free run, or narration in a draft book)
-- reports "none live" and passes, so the report says what it could not test.
--
-- Expected outcomes: "rows=N" for a statement that runs, or "error 42501"
-- (insufficient privilege) for one that must be refused.

create temp table audio_results (
  n int,
  caller text,
  check_name text,
  expected text,
  actual text,
  pass boolean
);

do $test$
declare
  reader_a constant text := 'user_rlstest_a';
  reader_b constant text := 'user_rlstest_b';
  subscriber constant text := 'user_rlstestSubscriber';
  lapsed constant text := 'user_rlstestLapsed';
  free_run int;
  free_path text;
  unlocked_path text;
  unlocked_id uuid;
  locked_path text;
  position_path text;
  draft_path text;
  wrong_file text;
  visible_to_a int;
  all_audio int;
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

    select s.free_chapters_at_start into free_run from public.app_settings s;

    select c.audio_path into free_path
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status = 'published' and c.access = 'free'
    order by c.id limit 1;

    -- Two narrated chapters locked past the free run: A is granted the first.
    select c.audio_path, c.id into unlocked_path, unlocked_id
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status = 'published'
      and c.access = 'locked' and c.number > free_run
    order by c.id limit 1;

    select c.audio_path into locked_path
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status = 'published'
      and c.access = 'locked' and c.number > free_run
    order by c.id offset 1 limit 1;

    select c.audio_path into position_path
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status = 'published'
      and c.access = 'locked' and c.number <= free_run
    order by c.id limit 1;

    select c.audio_path into draft_path
    from public.chapters c join public.books b on b.id = c.book_id
    where c.audio_path is not null and b.status <> 'published'
    order by c.id limit 1;

    -- Its own code, not P0001, which the handler below swallows as the
    -- planned rollback: a missing precondition must fail loudly.
    if free_path is null or unlocked_path is null or locked_path is null then
      raise exception using errcode = 'VF001',
        message = 'needs a free narrated chapter and two locked ones past the free run';
    end if;

    -- The free chapter's own folder, with a file that isn't its current one:
    -- what a replaced upload leaves behind.
    wrong_file := split_part(free_path, '/', 1) || '/' || split_part(free_path, '/', 2) || '/not-the-current-file.m4a';

    -- Seeded as the table owner, which RLS does not restrict.
    insert into public.unlocks (user_id, chapter_id, source)
      values (reader_a, unlocked_id, 'ad');
    -- S holds Talebrim Unlimited for another hour; E's plan ended an hour
    -- ago, its row not yet deleted (has_active_plan() reads the expiry).
    insert into public.entitlements (user_id, entitlement, expires_at)
      values (subscriber, 'ad_free', now() + interval '1 hour'),
             (lapsed, 'ad_free', now() - interval '1 hour');

    -- What A should see in the bucket, counted without the policy: narrated
    -- chapters of published books, free by access, plus the one A unlocked. Compared against what the policy lets A see, it proves no
    -- other object leaks.
    select count(*) into visible_to_a
    from storage.objects o
    join public.chapters c on c.audio_path = o.name
    join public.books b on b.id = c.book_id
    where o.bucket_id = 'audio' and b.status = 'published'
      and (c.access = 'free' or c.id = unlocked_id);

    select count(*) into all_audio from storage.objects o where o.bucket_id = 'audio';

    -- What S should see: every published chapter's current narration.
    select count(*) into published_audio
    from storage.objects o
    join public.chapters c on c.audio_path = o.name
    join public.books b on b.id = c.book_id
    where o.bucket_id = 'audio' and b.status = 'published';

    for t in
      select * from (values
        -- The rule, called directly
        ('A', 'may play a chapter free by access', 'select count(*) where public.can_play_audio(:free)', 'rows=1'),
        ('A', 'may play the locked chapter it unlocked', 'select count(*) where public.can_play_audio(:unlocked)', 'rows=1'),
        ('A', 'may not play a locked chapter it didn''t unlock', 'select count(*) where public.can_play_audio(:locked)', 'rows=0'),
        ('B', 'may not play the chapter A unlocked', 'select count(*) where public.can_play_audio(:unlocked)', 'rows=0'),
        ('A', 'may not play a file that isn''t the chapter''s current one', 'select count(*) where public.can_play_audio(:wrong)', 'rows=0'),
        ('A', 'malformed paths return false, never an error', 'select count(*) from (values (''''), (''x''), (''a/not-a-uuid/c.m4a''), (''a/b''), (''../../x''), (null)) v(p) where public.can_play_audio(v.p)', 'rows=0'),
        ('anon', 'cannot call the rule', 'select count(*) where public.can_play_audio(:free)', 'error 42501'),

        -- The policy, through storage.objects, as the Storage API reads it
        ('A', 'sees the free chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :free', 'rows=1'),
        ('A', 'sees the unlocked chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :unlocked', 'rows=1'),
        ('A', 'does not see a locked chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :locked', 'rows=0'),
        ('A', 'sees exactly the objects it may play, no others', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=' || visible_to_a),
        ('B', 'sees the free chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :free', 'rows=1'),
        ('B', 'does not see the object A unlocked', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :unlocked', 'rows=0'),
        ('B', 'sees one object fewer than A', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=' || (visible_to_a - 1)),
        ('anon', 'sees no audio object', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=0'),
        ('admin', 'is really an admin (is_admin() true)', 'select count(*) from (select 1 where public.is_admin()) s', 'rows=1'),
        ('admin', 'sees a locked chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :locked', 'rows=1'),
        ('admin', 'sees every audio object', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=' || all_audio),

        -- Talebrim Unlimited (20261002120000)
        ('S', 'may play a locked chapter it didn''t unlock', 'select count(*) where public.can_play_audio(:locked)', 'rows=1'),
        ('S', 'sees the locked chapter''s object', 'select count(*) from storage.objects where bucket_id = ''audio'' and name = :locked', 'rows=1'),
        ('S', 'sees every published chapter''s narration, no more', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=' || published_audio),
        ('S', 'may not play a file that isn''t the chapter''s current one', 'select count(*) where public.can_play_audio(:wrong)', 'rows=0'),
        ('E', 'may not play a locked chapter once its plan ended', 'select count(*) where public.can_play_audio(:locked)', 'rows=0'),
        ('E', 'sees only the free chapters'' objects, as B does', 'select count(*) from storage.objects where bucket_id = ''audio''', 'rows=' || (visible_to_a - 1)),

        -- Kinds of chapter that may not exist live
        ('A', 'may not play a chapter locked inside the free run (its number never frees it)', case when position_path is null then 'none live' else 'select count(*) where public.can_play_audio(:position)' end, case when position_path is null then 'none live' else 'rows=0' end),
        ('A', 'may not play a chapter of a draft book', case when draft_path is null then 'none live' else 'select count(*) where public.can_play_audio(:draft)' end, case when draft_path is null then 'none live' else 'rows=0' end),
        ('S', 'may not play a chapter of a draft book, plan or not', case when draft_path is null then 'none live' else 'select count(*) where public.can_play_audio(:draft)' end, case when draft_path is null then 'none live' else 'rows=0' end)
      ) as v(caller, check_name, sql, expected)
    loop
      if t.sql = 'none live' then
        actual := 'none live';
      else
        stmt := replace(replace(replace(replace(replace(replace(t.sql,
          ':free', quote_literal(free_path)), ':unlocked', quote_literal(unlocked_path)),
          ':locked', quote_literal(locked_path)), ':wrong', quote_literal(wrong_file)),
          ':position', coalesce(quote_literal(position_path), 'null')),
          ':draft', coalesce(quote_literal(draft_path), 'null'));

        perform set_config('request.jwt.claims', case t.caller
          when 'A' then json_build_object('sub', reader_a, 'role', 'authenticated')::text
          when 'B' then json_build_object('sub', reader_b, 'role', 'authenticated')::text
          when 'S' then json_build_object('sub', subscriber, 'role', 'authenticated')::text
          when 'E' then json_build_object('sub', lapsed, 'role', 'authenticated')::text
          when 'admin' then '{"sub":"user_rlstest_admin","role":"authenticated","metadata":{"role":"admin"}}'
          else '{"role":"anon"}'
        end, true);
        if t.caller = 'anon' then
          set local role anon;
        else
          set local role authenticated;
        end if;

        begin
          execute stmt into n;
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

  insert into audio_results
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
from audio_results
order by n;
