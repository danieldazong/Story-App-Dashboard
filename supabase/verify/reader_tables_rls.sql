-- RLS verification for the mobile reader tables: reading_positions, unlocks
-- and library_items (migrations 20260923121634, 20260923121638,
-- 20260923121642), plus the server-set reading_positions.updated_at
-- (20260924190305).
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/verify/reader_tables_rls.sql
--
-- LEAVES NOTHING BEHIND. Every row it seeds is created inside a
-- subtransaction that ends by raising on purpose, which rolls all of it back
-- whatever client runs the file. Only the pass/fail report survives, in a
-- temp table that disappears with the session.
--
-- Callers are impersonated the way PostgREST does it: SET ROLE plus
-- request.jwt.claims, which is what auth.jwt() reads. Readers A and B and the
-- admin use fake Clerk ids (user_rlstest_*) that no real account can have.
-- The admin carries metadata.role = admin, so is_admin() is true for it; the
-- point is to prove that gives no view of another reader's rows.
--
-- Expected outcomes: "rows=N" for a statement that runs, or "error 42501"
-- (insufficient privilege, or a row-level security violation) for one that
-- must be refused.

create temp table rls_results (
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
  c1 uuid;
  c2 uuid;
  c3 uuid;
  b1 uuid;
  b2 uuid;
  t record;
  stmt text;
  n bigint;
  actual text;
  results jsonb := '[]';
  i int := 0;
begin
  begin
    -- Test data and checks. Everything in this block is rolled back.

    -- Real ids, only to satisfy the foreign keys. Nothing is written to books
    -- or chapters.
    select id into c1 from public.chapters order by id limit 1;
    select id into c2 from public.chapters order by id offset 1 limit 1;
    select id into c3 from public.chapters order by id offset 2 limit 1;
    select id into b1 from public.books order by id limit 1;
    select id into b2 from public.books order by id offset 1 limit 1;

    -- Seeded as the table owner, which RLS does not restrict.
    insert into public.reading_positions (user_id, chapter_id, book_id, text_offset, last_mode)
      values (reader_b, c1, b1, 120, 'text');
    insert into public.library_items (user_id, book_id)
      values (reader_b, b1);
    insert into public.unlocks (user_id, chapter_id, source)
      values (reader_a, c1, 'ad'), (reader_b, c2, 'ad');

    for t in
      select * from (values
        -- reading_positions: full read/write, own rows only
        ('reading_positions', 'A', 'sees none of B''s rows', 'select count(*) from public.reading_positions', 'rows=0'),
        ('reading_positions', 'A', 'inserts own row (user_id defaults to caller)', 'insert into public.reading_positions (chapter_id, book_id, audio_ms, last_mode) values (:c1, :b1, 5000, ''audio'')', 'rows=1'),
        ('reading_positions', 'A', 'then sees exactly its own row', 'select count(*) from public.reading_positions where user_id = :a', 'rows=1'),
        ('reading_positions', 'A', 'upserts its text side (the parity writer''s write)', 'insert into public.reading_positions (chapter_id, book_id, text_offset, last_mode) values (:c1, :b1, 42, ''text'') on conflict (user_id, chapter_id) do update set book_id = excluded.book_id, text_offset = excluded.text_offset, last_mode = excluded.last_mode', 'rows=1'),
        ('reading_positions', 'A', 'still one row, and the upsert kept its audio side', 'select count(*) from public.reading_positions where user_id = :a and audio_ms = 5000 and text_offset = 42', 'rows=1'),
        ('reading_positions', 'A', 'an update cannot set its own updated_at', 'update public.reading_positions set updated_at = ''2000-01-01'' where user_id = :a', 'rows=1'),
        ('reading_positions', 'A', 'the server set updated_at on that update', 'select count(*) from public.reading_positions where user_id = :a and updated_at > ''2001-01-01''', 'rows=1'),
        ('reading_positions', 'A', 'an insert cannot set its own updated_at', 'insert into public.reading_positions (chapter_id, book_id, text_offset, last_mode, updated_at) values (:c2, :b1, 1, ''text'', ''2000-01-01'')', 'rows=1'),
        ('reading_positions', 'A', 'the server set updated_at on that insert', 'select count(*) from public.reading_positions where user_id = :a and chapter_id = :c2 and updated_at > ''2001-01-01''', 'rows=1'),
        ('reading_positions', 'A', 'removes that second row', 'delete from public.reading_positions where user_id = :a and chapter_id = :c2', 'rows=1'),
        ('reading_positions', 'A', 'sees nothing when asking for B''s rows', 'select count(*) from public.reading_positions where user_id = :b', 'rows=0'),
        ('reading_positions', 'A', 'cannot insert a row as B', 'insert into public.reading_positions (user_id, chapter_id, book_id, text_offset, last_mode) values (:b, :c2, :b1, 1, ''text'')', 'error 42501'),
        ('reading_positions', 'A', 'cannot update B''s row', 'update public.reading_positions set audio_ms = 1 where user_id = :b', 'rows=0'),
        ('reading_positions', 'A', 'cannot hand its row to B', 'update public.reading_positions set user_id = :b where user_id = :a', 'error 42501'),
        ('reading_positions', 'A', 'cannot delete B''s row', 'delete from public.reading_positions where user_id = :b', 'rows=0'),
        ('reading_positions', 'A', 'deletes its own row', 'delete from public.reading_positions where user_id = :a', 'rows=1'),
        ('reading_positions', 'A', 'cannot truncate', 'truncate public.reading_positions', 'error 42501'),
        ('reading_positions', 'B', 'still has its row after all of A''s attempts', 'select count(*) from public.reading_positions', 'rows=1'),
        ('reading_positions', 'anon', 'reads nothing', 'select count(*) from public.reading_positions', 'error 42501'),
        ('reading_positions', 'anon', 'writes nothing', 'insert into public.reading_positions (user_id, chapter_id, book_id, text_offset, last_mode) values (''x'', :c1, :b1, 1, ''text'')', 'error 42501'),
        ('reading_positions', 'admin', 'is really an admin (is_admin() true)', 'select count(*) from (select 1 where public.is_admin()) s', 'rows=1'),
        ('reading_positions', 'admin', 'sees no reader''s rows', 'select count(*) from public.reading_positions', 'rows=0'),
        ('reading_positions', 'admin', 'sees nothing when asking for B''s rows', 'select count(*) from public.reading_positions where user_id = :b', 'rows=0'),

        -- library_items: full read/write, own rows only
        ('library_items', 'A', 'sees none of B''s rows', 'select count(*) from public.library_items', 'rows=0'),
        ('library_items', 'A', 'inserts own row (user_id defaults to caller)', 'insert into public.library_items (book_id) values (:b1)', 'rows=1'),
        ('library_items', 'A', 'then sees exactly its own row', 'select count(*) from public.library_items where user_id = :a', 'rows=1'),
        ('library_items', 'A', 'sees nothing when asking for B''s rows', 'select count(*) from public.library_items where user_id = :b', 'rows=0'),
        ('library_items', 'A', 'cannot insert a row as B', 'insert into public.library_items (user_id, book_id) values (:b, :b2)', 'error 42501'),
        ('library_items', 'A', 'cannot update B''s row', 'update public.library_items set book_id = :b2 where user_id = :b', 'rows=0'),
        ('library_items', 'A', 'cannot hand its row to B', 'update public.library_items set user_id = :b where user_id = :a', 'error 42501'),
        ('library_items', 'A', 'cannot delete B''s row', 'delete from public.library_items where user_id = :b', 'rows=0'),
        ('library_items', 'A', 'deletes its own row', 'delete from public.library_items where user_id = :a', 'rows=1'),
        ('library_items', 'A', 'cannot truncate', 'truncate public.library_items', 'error 42501'),
        ('library_items', 'B', 'still has its row after all of A''s attempts', 'select count(*) from public.library_items', 'rows=1'),
        ('library_items', 'anon', 'reads nothing', 'select count(*) from public.library_items', 'error 42501'),
        ('library_items', 'anon', 'writes nothing', 'insert into public.library_items (user_id, book_id) values (''x'', :b1)', 'error 42501'),
        ('library_items', 'admin', 'sees no reader''s rows', 'select count(*) from public.library_items', 'rows=0'),

        -- unlocks: readers read their own grants and cannot write at all
        ('unlocks', 'A', 'sees exactly its own grant', 'select count(*) from public.unlocks', 'rows=1'),
        ('unlocks', 'A', 'sees nothing when asking for B''s grants', 'select count(*) from public.unlocks where user_id = :b', 'rows=0'),
        ('unlocks', 'A', 'cannot grant itself a chapter', 'insert into public.unlocks (chapter_id, source) values (:c3, ''ad'')', 'error 42501'),
        ('unlocks', 'A', 'cannot insert a grant as B', 'insert into public.unlocks (user_id, chapter_id, source) values (:b, :c3, ''ad'')', 'error 42501'),
        ('unlocks', 'A', 'cannot move its grant to another chapter', 'update public.unlocks set chapter_id = :c3 where user_id = :a', 'error 42501'),
        ('unlocks', 'A', 'cannot delete a grant', 'delete from public.unlocks where user_id = :a', 'error 42501'),
        ('unlocks', 'A', 'cannot truncate', 'truncate public.unlocks', 'error 42501'),
        ('unlocks', 'B', 'sees exactly its own grant', 'select count(*) from public.unlocks', 'rows=1'),
        ('unlocks', 'anon', 'reads nothing', 'select count(*) from public.unlocks', 'error 42501'),
        ('unlocks', 'admin', 'sees no reader''s grants', 'select count(*) from public.unlocks', 'rows=0')
      ) as v(tbl, caller, check_name, sql, expected)
    loop
      stmt := replace(replace(replace(replace(replace(replace(replace(t.sql,
        ':c1', quote_literal(c1)), ':c2', quote_literal(c2)), ':c3', quote_literal(c3)),
        ':b1', quote_literal(b1)), ':b2', quote_literal(b2)),
        ':a', quote_literal(reader_a)), ':b', quote_literal(reader_b));

      perform set_config('request.jwt.claims', case t.caller
        when 'A' then json_build_object('sub', reader_a, 'role', 'authenticated')::text
        when 'B' then json_build_object('sub', reader_b, 'role', 'authenticated')::text
        when 'admin' then '{"sub":"user_rlstest_admin","role":"authenticated","metadata":{"role":"admin"}}'
        else '{"role":"anon"}'
      end, true);
      if t.caller = 'anon' then
        set local role anon;
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

  insert into rls_results
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
from rls_results
order by n;
