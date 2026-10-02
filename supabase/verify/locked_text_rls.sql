-- Verification for locked chapter text (migration 20261002130000, the mobile
-- app's prompt 22a Part C): the chapters_select policy, and the two catalog
-- views that keep listing every published chapter.
--
-- Run against the linked project:
--   npx supabase db query --linked -f supabase/verify/locked_text_rls.sql
--
-- LEAVES NOTHING BEHIND. The rows it seeds (an unlock and two entitlements
-- for fake readers) are created inside a subtransaction that ends by raising
-- on purpose, which rolls them back whatever client runs the file. Only the
-- pass/fail report survives, in a temp table that disappears with the
-- session. Nothing is written to books or chapters.
--
-- Callers are impersonated the way PostgREST does it: SET ROLE plus
-- request.jwt.claims, which is what auth.jwt() reads. The fake Clerk ids
-- (user_rlstestText*) match the entitlements table's user id check:
--   A  a reader with no unlock and no plan
--   U  a reader who unlocked one locked chapter
--   S  a Talebrim Unlimited subscriber (an entitlement that ends in an hour)
--   E  a subscriber whose plan ended an hour ago
--   anon, and an admin (metadata.role = admin)
--
-- It tests the live catalog, so it picks its chapters by what they are. A
-- check whose kind of row doesn't exist live (a draft book) reports
-- "none live" and passes, so the report says what it could not test.
--
-- Expected outcomes: "rows=N" for a statement that runs, or "error 42501"
-- (insufficient privilege) for one that must be refused.

create temp table locked_text_results (
  n int,
  caller text,
  check_name text,
  expected text,
  actual text,
  pass boolean
);

do $test$
declare
  reader_a constant text := 'user_rlstestTextA';
  reader_u constant text := 'user_rlstestTextU';
  subscriber constant text := 'user_rlstestTextS';
  lapsed constant text := 'user_rlstestTextE';
  free_id uuid;
  locked_id uuid;
  other_locked_id uuid;
  draft_book uuid;
  all_chapters int;
  published_chapters int;
  free_published int;
  published_books int;
  counts_fingerprint text;
  t record;
  stmt text;
  n bigint;
  actual text;
  results jsonb := '[]';
  i int := 0;
begin
  begin
    -- Test data and checks. Everything in this block is rolled back.

    select c.id into free_id
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published' and c.access = 'free' and c.script_text is not null
    order by c.id limit 1;

    -- Two locked chapters with text: U unlocks the first.
    select c.id into locked_id
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published' and c.access = 'locked' and c.script_text is not null
    order by c.id limit 1;

    select c.id into other_locked_id
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published' and c.access = 'locked' and c.script_text is not null
    order by c.id offset 1 limit 1;

    select b.id into draft_book from public.books b where b.status <> 'published' order by b.id limit 1;

    -- Its own code, not P0001, which the handler below swallows as the
    -- planned rollback: a missing precondition must fail loudly.
    if free_id is null or locked_id is null or other_locked_id is null then
      raise exception using errcode = 'VF001',
        message = 'needs a free chapter with text and two locked ones, in published books';
    end if;

    -- What each caller should see, counted without the policies.
    select count(*) into all_chapters from public.chapters;
    select count(*), count(*) filter (where c.access = 'free')
      into published_chapters, free_published
    from public.chapters c join public.books b on b.id = c.book_id
    where b.status = 'published';
    select count(*) into published_books from public.books where status = 'published';

    -- books_catalog's counts, computed from the tables: what every reader
    -- must still see, the chapters they may not open included.
    select string_agg(x.id || ':' || x.chapter_count || ':' || x.audio_count || ':' || x.free_count, ',' order by x.id)
      into counts_fingerprint
    from (
      select
        b.id,
        count(c.id) as chapter_count,
        count(c.audio_path) as audio_count,
        count(c.id) filter (where c.access = 'free') as free_count
      from public.books b
      left join public.chapters c on c.book_id = b.id
      where b.status = 'published'
      group by b.id
    ) x;

    -- Seeded as the tables' owner, which RLS does not restrict.
    insert into public.unlocks (user_id, chapter_id, source) values (reader_u, locked_id, 'ad');
    insert into public.entitlements (user_id, entitlement, expires_at)
      values (subscriber, 'ad_free', now() + interval '1 hour'),
             (lapsed, 'ad_free', now() - interval '1 hour');

    for t in
      select * from (values
        -- chapters: the text, only for a chapter the reader may open
        ('A', 'reads a free chapter''s text', 'select count(*) from public.chapters where id = :free and script_text is not null', 'rows=1'),
        ('A', 'gets no row for a locked chapter', 'select count(*) from public.chapters where id = :locked', 'rows=0'),
        ('A', 'sees exactly the free chapters of published books', 'select count(*) from public.chapters', 'rows=' || free_published),
        ('U', 'reads the locked chapter it unlocked', 'select count(*) from public.chapters where id = :locked and script_text is not null', 'rows=1'),
        ('U', 'gets no row for a locked chapter it didn''t unlock', 'select count(*) from public.chapters where id = :other', 'rows=0'),
        ('S', 'reads a locked chapter with Talebrim Unlimited', 'select count(*) from public.chapters where id = :other and script_text is not null', 'rows=1'),
        ('S', 'sees every chapter of every published book', 'select count(*) from public.chapters', 'rows=' || published_chapters),
        ('E', 'gets no row for a locked chapter once its plan ended', 'select count(*) from public.chapters where id = :locked', 'rows=0'),
        ('E', 'still reads a free chapter', 'select count(*) from public.chapters where id = :free', 'rows=1'),
        ('A', 'gets no chapter of a draft book', case when draft_book is null then 'none live' else 'select count(*) from public.chapters where book_id = :draft' end, case when draft_book is null then 'none live' else 'rows=0' end),
        ('S', 'gets no chapter of a draft book, plan or not', case when draft_book is null then 'none live' else 'select count(*) from public.chapters where book_id = :draft' end, case when draft_book is null then 'none live' else 'rows=0' end),
        ('anon', 'reads no chapter', 'select count(*) from public.chapters', 'rows=0'),
        ('admin', 'is really an admin (is_admin() true)', 'select count(*) from (select 1 where public.is_admin()) s', 'rows=1'),
        ('admin', 'reads every chapter, drafts included, as before', 'select count(*) from public.chapters', 'rows=' || all_chapters),
        ('admin', 'reads a locked chapter''s text', 'select count(*) from public.chapters where id = :locked and script_text is not null', 'rows=1'),
        ('admin', 'still reads the dashboard''s chapter list view in full', 'select count(*) from public.chapters_list', 'rows=' || all_chapters),

        -- chapters_catalog: every published chapter, locked ones included, never text
        ('A', 'still lists the locked chapter', 'select count(*) from public.chapters_catalog where id = :locked', 'rows=1'),
        ('A', 'lists every chapter of every published book', 'select count(*) from public.chapters_catalog', 'rows=' || published_chapters),
        ('A', 'still sees that the locked chapter has text, without the text', 'select count(*) from public.chapters_catalog where id = :locked and has_text and text_bytes > 0', 'rows=1'),
        ('A', 'lists no chapter of a draft book', case when draft_book is null then 'none live' else 'select count(*) from public.chapters_catalog where book_id = :draft' end, case when draft_book is null then 'none live' else 'rows=0' end),
        ('A', 'finds no text or audio path column in either view', 'select count(*) from information_schema.columns where table_schema = ''public'' and table_name in (''chapters_catalog'', ''books_catalog'') and column_name in (''script_text'', ''audio_path'')', 'rows=0'),

        -- books_catalog: the same counts as before
        ('A', 'sees every published book', 'select count(*) from public.books_catalog', 'rows=' || published_books),
        ('A', 'sees each book''s counts computed from every chapter', 'select count(*) from (select string_agg(id || '':'' || chapter_count || '':'' || audio_count || '':'' || free_chapter_count, '','' order by id) s from public.books_catalog) x where x.s = :fingerprint', 'rows=1'),
        ('A', 'sees no draft book', case when draft_book is null then 'none live' else 'select count(*) from public.books_catalog where id = :draft' end, case when draft_book is null then 'none live' else 'rows=0' end),

        -- The views' grants: SELECT for signed-in readers, nothing else
        ('anon', 'cannot read books_catalog', 'select count(*) from public.books_catalog', 'error 42501'),
        ('anon', 'cannot read chapters_catalog', 'select count(*) from public.chapters_catalog', 'error 42501'),
        -- Neither view can be written through anyway (a join makes it not
        -- updatable, error 55000, which Postgres raises before it checks a
        -- grant), so the grants are read directly.
        ('A', 'holds SELECT on both views', 'select count(*) from unnest(array[''public.books_catalog'', ''public.chapters_catalog'']) v where has_table_privilege(v, ''SELECT'')', 'rows=2'),
        ('A', 'holds nothing else on either view', 'select count(*) from unnest(array[''public.books_catalog'', ''public.chapters_catalog'']) v, unnest(array[''INSERT'', ''UPDATE'', ''DELETE'', ''TRUNCATE'', ''REFERENCES'', ''TRIGGER'']) p where has_table_privilege(v, p)', 'rows=0'),
        ('anon', 'holds nothing on either view', 'select count(*) from unnest(array[''public.books_catalog'', ''public.chapters_catalog'']) v, unnest(array[''SELECT'', ''INSERT'', ''UPDATE'', ''DELETE'', ''TRUNCATE'', ''REFERENCES'', ''TRIGGER'']) p where has_table_privilege(v, p)', 'rows=0')
      ) as v(caller, check_name, sql, expected)
    loop
      if t.sql = 'none live' then
        actual := 'none live';
      else
        stmt := replace(replace(replace(replace(replace(t.sql,
          ':free', quote_literal(free_id)), ':locked', quote_literal(locked_id)),
          ':other', quote_literal(other_locked_id)), ':draft', coalesce(quote_literal(draft_book), 'null')),
          ':fingerprint', quote_literal(counts_fingerprint));

        perform set_config('request.jwt.claims', case t.caller
          when 'A' then json_build_object('sub', reader_a, 'role', 'authenticated')::text
          when 'U' then json_build_object('sub', reader_u, 'role', 'authenticated')::text
          when 'S' then json_build_object('sub', subscriber, 'role', 'authenticated')::text
          when 'E' then json_build_object('sub', lapsed, 'role', 'authenticated')::text
          when 'admin' then '{"sub":"user_rlstestTextAdmin","role":"authenticated","metadata":{"role":"admin"}}'
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

  insert into locked_text_results
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
from locked_text_results
order by n;
