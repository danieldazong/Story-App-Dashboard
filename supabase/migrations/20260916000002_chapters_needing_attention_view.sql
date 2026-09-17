-- Backs the Dashboard's "Needs attention" queue.
--
-- Exists so that screen reads one relation instead of pulling every chapter row
-- and deriving the missing-asset value client-side. The derived value mirrors
-- `chapterMissingAsset()` in lib/catalog.ts exactly — if one changes, change
-- both.
--
-- Asset presence is derived from nullability, consistent with the schema:
--   script_text is null -> script missing
--   audio_path  is null -> narration missing

create view chapters_needing_attention as
select
  b.id as book_id,
  b.title as book_title,
  c.id as chapter_id,
  c.number as chapter_number,
  c.title as chapter_title,
  case
    when c.script_text is null and c.audio_path is null then 'both'
    when c.script_text is null then 'script'
    else 'audio'
  end as missing
from chapters c
join books b on b.id = c.book_id
where c.script_text is null
   or c.audio_path is null
order by b.title, c.number;

-- The view runs with the privileges of the querying user (security invoker), so
-- the underlying books/chapters RLS policies still apply. A non-admin therefore
-- sees only rows from published books through this view, exactly as they would
-- querying the tables directly.
alter view chapters_needing_attention set (security_invoker = on);

-- Teardown (local resets only)
-- drop view if exists chapters_needing_attention;
