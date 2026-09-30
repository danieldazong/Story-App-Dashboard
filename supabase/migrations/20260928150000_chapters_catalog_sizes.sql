-- Two size columns on the mobile app's chapter view, for offline downloads.
--
-- PURELY ADDITIVE. chapters_catalog is the mobile app's own view (migration
-- 20260920000001); this appends two columns at its end and changes nothing
-- else: no table, no policy, no other view, and nothing on books or chapters.
-- `create or replace view` may only append columns, which keeps every
-- existing column, its position and its type, and the view's grants.
--
-- WHY: the app's downloads (its prompt 24) confirm "12 chapters, 48 MB"
-- before Download all starts, and check the phone's free space before each
-- chapter. Both need the real size of what is about to be written:
--
-- - audio_size_bytes: the size the dashboard records at upload. It equalled
--   the stored object for all 8 narrated chapters on 2026-09-28. Estimating
--   from the duration instead would be off by up to six times, because
--   narration runs 64 to 384 kbps today.
-- - text_bytes: octet_length(script_text), the size of the text file the app
--   writes (UTF-8, as Postgres stores it). The prose itself stays out of the
--   view, as before: this is a number, never the text.
--
-- security_invoker is restated: `create or replace view` without the option
-- would reset it, and the view would then run as its owner and hand a reader
-- rows the policies deny.

create or replace view chapters_catalog
with (security_invoker = on)
as
select
  c.id,
  c.book_id,
  c.number,
  c.title,
  c.access,
  c.audio_duration_seconds,
  c.audio_duration_source,
  (c.audio_path is not null)  as has_audio,
  (c.script_text is not null) as has_text,
  c.created_at,
  c.updated_at,
  -- Appended 2026-09-28. Null when the chapter has no narration, or its
  -- size was never recorded; the app then estimates from the duration.
  c.audio_size_bytes,
  -- Null when the chapter has no text.
  octet_length(c.script_text) as text_bytes
from chapters c
join books b on b.id = c.book_id
where b.status = 'published';

comment on view chapters_catalog is
  'Chapter metadata for mobile list screens. Omits script_text deliberately - '
  'fetch prose per chapter from chapters.script_text when the reader opens '
  'one. Excludes chapters of unpublished books by construction. '
  'audio_size_bytes and text_bytes size the offline downloads.';
