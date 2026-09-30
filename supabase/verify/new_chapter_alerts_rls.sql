-- Verification for the mobile app's new-chapter alerts (migrations
-- 20260928120000 and 20260930130000): push_tokens and set_push_token(), the
-- three server-only tables, and the notify-new-chapters job's SQL steps.
-- Since 20260930130000 a book is due as soon as it has an unannounced
-- chapter: no quiet wait, no 24-hour cap.
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/verify/new_chapter_alerts_rls.sql
--
-- LEAVES NOTHING BEHIND, as reader_tables_rls.sql: everything runs inside a
-- subtransaction that ends by raising on purpose, and only the report
-- survives, in a temp table that goes with the session. Nothing is written to
-- books or chapters; real ids are used only to satisfy foreign keys.
--
-- Callers are impersonated the way PostgREST does it: SET ROLE plus
-- request.jwt.claims. Readers A, B and C and the admin use fake Clerk ids
-- (user_rlstest_*). "service" is the Edge Function (service_role); "owner"
-- runs as the migration owner, to set up a state for the next check.
--
-- Expected outcomes: "rows=N" for a statement that runs, or "error <sqlstate>"
-- for one that must be refused: 42501 (insufficient privilege or RLS) or
-- 22023 (set_push_token refusing something that isn't an Expo push token).

create temp table alerts_results (
  n int,
  tbl text,
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
  reader_c constant text := 'user_rlstest_c';
  phone constant text := 'ExponentPushToken[rlstest-phone]';
  phone_b constant text := 'ExponentPushToken[rlstest-phone-b]';
  phone_c constant text := 'ExponentPushToken[rlstest-phone-c]';
  -- A readable chapter of a published book, and that book.
  cp uuid;
  bp uuid;
  -- A chapter with text in a draft book, if there is one.
  dc uuid;
  t record;
  stmt text;
  n bigint;
  actual text;
  results jsonb := '[]';
  i int := 0;
begin
  begin
    select c.id, c.book_id into cp, bp
      from public.chapters_catalog c
      where c.has_text or c.has_audio
      order by c.id
      limit 1;
    select c.id into dc
      from public.chapters c
      join public.books b on b.id = c.book_id
      where b.status = 'draft' and c.script_text is not null
      order by c.id
      limit 1;

    -- The live job may have alerted this book already (a real alert: first
    -- seen 2026-09-30). Its row is set aside here, and comes back with the
    -- rollback, so the checks below start from a book never alerted.
    delete from public.book_alerts where book_id = bp;

    -- Seeded as the table owner, which RLS does not restrict. B has a phone of
    -- its own; C has the published book on My List and a phone, for the job.
    insert into public.push_tokens (user_id, token)
      values (reader_b, phone_b), (reader_c, phone_c);
    insert into public.library_items (user_id, book_id)
      values (reader_c, bp);

    for t in
      select * from (values
        -- push_tokens and set_push_token(): readers see their own rows, and
        -- write only through the function
        ('push_tokens', 'A', 'sees none of B''s or C''s rows', 'select count(*) from public.push_tokens', 'rows=0'),
        ('push_tokens', 'A', 'registers the phone through set_push_token', 'select count(*) from (select public.set_push_token({phone}, true)) s', 'rows=1'),
        ('push_tokens', 'A', 'then sees exactly its own row', 'select count(*) from public.push_tokens', 'rows=1'),
        ('push_tokens', 'A', 'registers the same phone again', 'select count(*) from (select public.set_push_token({phone}, true)) s', 'rows=1'),
        ('push_tokens', 'A', 'still one row', 'select count(*) from public.push_tokens where token = {phone}', 'rows=1'),
        ('push_tokens', 'A', 'is refused a token that isn''t an Expo push token', 'select count(*) from (select public.set_push_token(''not-a-token'', true)) s', 'error 22023'),
        ('push_tokens', 'A', 'is refused a null answer', 'select count(*) from (select public.set_push_token({phone}, null)) s', 'error 22023'),
        ('push_tokens', 'A', 'cannot insert directly', 'insert into public.push_tokens (token) values (''ExponentPushToken[rlstest-direct]'')', 'error 42501'),
        ('push_tokens', 'A', 'cannot update directly', 'update public.push_tokens set user_id = {b}', 'error 42501'),
        ('push_tokens', 'A', 'cannot delete directly', 'delete from public.push_tokens', 'error 42501'),
        ('push_tokens', 'A', 'cannot truncate', 'truncate public.push_tokens', 'error 42501'),
        ('push_tokens', 'B', 'sees only its own phone', 'select count(*) from public.push_tokens', 'rows=1'),
        ('push_tokens', 'B', 'signs in on A''s phone and takes its token', 'select count(*) from (select public.set_push_token({phone}, true)) s', 'rows=1'),
        ('push_tokens', 'B', 'now holds both phones', 'select count(*) from public.push_tokens', 'rows=2'),
        ('push_tokens', 'A', 'no longer holds the phone', 'select count(*) from public.push_tokens', 'rows=0'),
        ('push_tokens', 'owner', 'the phone has one row, B''s', 'select count(*) from public.push_tokens where token = {phone} and user_id = {b}', 'rows=1'),
        ('push_tokens', 'A', 'releases the phone, whoever holds it', 'select count(*) from (select public.set_push_token({phone}, false)) s', 'rows=1'),
        ('push_tokens', 'owner', 'the phone has no row', 'select count(*) from public.push_tokens where token = {phone}', 'rows=0'),
        ('push_tokens', 'B', 'keeps its own phone', 'select count(*) from public.push_tokens', 'rows=1'),
        ('push_tokens', 'anon', 'reads nothing', 'select count(*) from public.push_tokens', 'error 42501'),
        ('push_tokens', 'anon', 'cannot call set_push_token', 'select count(*) from (select public.set_push_token({phone}, true)) s', 'error 42501'),
        ('push_tokens', 'admin', 'is really an admin (is_admin() true)', 'select count(*) from (select 1 where public.is_admin()) s', 'rows=1'),
        ('push_tokens', 'admin', 'sees no reader''s phones', 'select count(*) from public.push_tokens', 'rows=0'),

        -- The job's tables and functions: server only
        ('chapter_alerts', 'A', 'reads nothing', 'select count(*) from public.chapter_alerts', 'error 42501'),
        ('chapter_alerts', 'A', 'writes nothing', 'insert into public.chapter_alerts (chapter_id, book_id) values ({cp}, {bp})', 'error 42501'),
        ('chapter_alerts', 'admin', 'reads nothing', 'select count(*) from public.chapter_alerts', 'error 42501'),
        ('chapter_alerts', 'anon', 'reads nothing', 'select count(*) from public.chapter_alerts', 'error 42501'),
        ('book_alerts', 'A', 'reads nothing', 'select count(*) from public.book_alerts', 'error 42501'),
        ('book_alerts', 'A', 'writes nothing', 'insert into public.book_alerts (book_id, last_sent_at) values ({bp}, now())', 'error 42501'),
        ('book_alerts', 'anon', 'reads nothing', 'select count(*) from public.book_alerts', 'error 42501'),
        ('push_tickets', 'A', 'reads nothing', 'select count(*) from public.push_tickets', 'error 42501'),
        ('push_tickets', 'A', 'writes nothing', 'insert into public.push_tickets (id, token) values (''x'', {phone})', 'error 42501'),
        ('push_tickets', 'anon', 'reads nothing', 'select count(*) from public.push_tickets', 'error 42501'),
        ('job', 'A', 'cannot run notify_find_new_chapters', 'select count(*) from (select public.notify_find_new_chapters()) s', 'error 42501'),
        ('job', 'A', 'cannot run notify_due_books', 'select count(*) from public.notify_due_books()', 'error 42501'),
        ('job', 'A', 'cannot run notify_mark_sent', 'select count(*) from (select public.notify_mark_sent({bp}, array[{cp}]::uuid[], true)) s', 'error 42501'),
        ('job', 'anon', 'cannot run notify_due_books', 'select count(*) from public.notify_due_books()', 'error 42501'),
        ('job', 'admin', 'cannot run notify_due_books', 'select count(*) from public.notify_due_books()', 'error 42501'),

        -- The job's steps, as the Edge Function runs them
        ('job', 'service', 'the backfill left nothing unsent', 'select count(*) from public.chapter_alerts where sent_at is null', 'rows=0'),
        ('job', 'service', 'finds nothing new straight after the backfill', 'select public.notify_find_new_chapters()', 'rows=0'),
        ('job', 'owner', 'a chapter is forgotten, as if just published', 'delete from public.chapter_alerts where chapter_id = {cp}', 'rows=1'),
        ('job', 'service', 'finds it', 'select public.notify_find_new_chapters()', 'rows=1'),
        ('job', 'service', 'records it unsent', 'select count(*) from public.chapter_alerts where chapter_id = {cp} and sent_at is null', 'rows=1'),
        -- Among the phones: real readers with the book on My List are named too.
        ('job', 'service', 'due at once, naming one chapter and C''s phone', 'select count(*) from public.notify_due_books() where book_id = {bp} and jsonb_array_length(chapters) = 1 and {phone_c} = any (tokens)', 'rows=1'),
        ('job', 'service', 'never names a phone without the book on My List', 'select count(*) from public.notify_due_books() where book_id = {bp} and {phone_b} = any (tokens)', 'rows=0'),
        ('job', 'owner', 'the book alerted a minute ago', 'insert into public.book_alerts (book_id, last_sent_at) values ({bp}, now() - interval ''1 minute'')', 'rows=1'),
        ('job', 'service', 'still due: no daily cap', 'select count(*) from public.notify_due_books() where book_id = {bp}', 'rows=1'),
        ('job', 'service', 'marks it sent', 'select count(*) from (select public.notify_mark_sent({bp}, array[{cp}]::uuid[], true)) s', 'rows=1'),
        ('job', 'service', 'the chapter is sent', 'select count(*) from public.chapter_alerts where chapter_id = {cp} and sent_at is not null', 'rows=1'),
        ('job', 'service', 'records when the book last alerted', 'select count(*) from public.book_alerts where book_id = {bp} and last_sent_at = now()', 'rows=1'),
        ('job', 'service', 'not due once sent', 'select count(*) from public.notify_due_books() where book_id = {bp}', 'rows=0'),
        ('job', 'owner', 'a draft book''s chapter is forgotten (none if no draft has text)', 'delete from public.chapter_alerts where chapter_id = {dc}', 'rows=0'),
        ('job', 'service', 'a draft book''s chapter is never found', 'select count(*) from (select public.notify_find_new_chapters()) s cross join public.chapter_alerts a where a.chapter_id = {dc}', 'rows=0')
      ) as v(tbl, caller, check_name, sql, expected)
    loop
      -- Braces, so no placeholder is a prefix of another.
      stmt := t.sql;
      stmt := replace(stmt, '{phone_b}', quote_literal(phone_b));
      stmt := replace(stmt, '{phone_c}', quote_literal(phone_c));
      stmt := replace(stmt, '{phone}', quote_literal(phone));
      stmt := replace(stmt, '{cp}', quote_literal(cp));
      stmt := replace(stmt, '{bp}', quote_literal(bp));
      stmt := replace(stmt, '{dc}', coalesce(quote_literal(dc), 'null'));
      stmt := replace(stmt, '{b}', quote_literal(reader_b));

      perform set_config('request.jwt.claims', case t.caller
        when 'A' then json_build_object('sub', reader_a, 'role', 'authenticated')::text
        when 'B' then json_build_object('sub', reader_b, 'role', 'authenticated')::text
        when 'admin' then '{"sub":"user_rlstest_admin","role":"authenticated","metadata":{"role":"admin"}}'
        when 'service' then '{"role":"service_role"}'
        when 'owner' then '{}'
        else '{"role":"anon"}'
      end, true);
      if t.caller = 'anon' then
        set local role anon;
      elsif t.caller = 'service' then
        set local role service_role;
      elsif t.caller = 'owner' then
        set local role postgres;
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
      i := i + 1;
      results := results || jsonb_build_object(
        'n', i, 'tbl', t.tbl, 'caller', t.caller, 'check_name', t.check_name,
        'expected', t.expected, 'actual', actual, 'pass', actual = t.expected);
    end loop;

    raise exception using errcode = 'P0001', message = 'roll back all test data';
  exception when sqlstate 'P0001' then
    null; -- every seeded row is gone; the results live on in `results`
  end;

  insert into alerts_results
    select * from jsonb_to_recordset(results)
      as x(n int, tbl text, caller text, check_name text, expected text, actual text, pass boolean);
end
$test$;

select
  n,
  tbl,
  caller,
  check_name,
  expected,
  actual,
  case when pass then 'PASS' else 'FAIL' end as result
from alerts_results
order by n;
