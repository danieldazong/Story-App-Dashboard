-- Backs the Book editor's chapters table.
--
-- Exists so that screen stops transferring every chapter's full prose to render
-- a word count. `/books/[bookId]` reads only `script.state` and
-- `script.wordCount` — never `script.text` — yet `getChapters` selected `*`,
-- moving megabytes for a long serial across a link where a single round trip
-- already costs ~450ms. Measured on a real book: 895ms selecting `script_text`
-- versus 501ms without it.
--
-- The saving is in TRANSFER, not in database work: Postgres still reads
-- script_text from disk to count words. That is the correct trade here — the
-- bottleneck is the wire, not the instance's ability to scan a column it has
-- already loaded.
--
-- NOT a stored aggregate. The catalog schema deliberately has no word_count
-- column, because a stored rollup is how one serial ends up reporting two
-- different counts on two different screens. A view recomputes on every read,
-- so it cannot drift from script_text the way a persisted column can. The
-- prohibition is on storing the aggregate, not on deriving it in SQL.

-- The word-count expression mirrors `countWords()` in lib/catalog.ts EXACTLY —
-- if one changes, change both. Same contract as chapters_needing_attention and
-- `chapterMissingAsset()`.
--
--   countWords(text):
--     trimmed = text.trim()
--     if trimmed === "" -> 0
--     else trimmed.split(/\s+/).length
--
-- The empty case must be handled explicitly: regexp_split_to_array('', '\s+')
-- returns {''}, whose array_length is 1, which would report one word for an
-- empty script. btrim matches JS trim() for ASCII whitespace.
create view chapters_list as
select
  c.id,
  c.book_id,
  c.number,
  c.title,
  c.script_file_name,
  c.script_path,
  -- Presence is derived from nullability, consistent with the schema:
  --   script_text is null -> script missing
  (c.script_text is not null) as has_script,
  case
    when c.script_text is null then null
    when btrim(c.script_text) = '' then 0
    else array_length(regexp_split_to_array(btrim(c.script_text), '\s+'), 1)
  end as script_word_count,
  c.audio_path,
  c.audio_file_name,
  c.audio_size_bytes,
  c.audio_duration_seconds,
  c.audio_duration_source,
  c.access,
  c.created_at,
  c.updated_at
from chapters c;

-- Runs with the privileges of the querying user, so the underlying chapters RLS
-- policies still apply — a non-admin sees only chapters of published books
-- through this view, exactly as they would querying the table directly.
--
-- Note this view does NOT widen access to anything: script_text is already
-- readable by authenticated non-admins whose parent book is published (the
-- mobile reader needs it), and this view exposes strictly less than the table.
alter view chapters_list set (security_invoker = on);

-- Teardown (local resets only)
-- drop view if exists chapters_list;
