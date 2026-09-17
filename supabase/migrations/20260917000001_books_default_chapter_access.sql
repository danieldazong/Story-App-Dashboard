-- Adds the per-book default chapter access column.
--
-- This column is specified in AGENTS.md (Data Model Notes) but was omitted from
-- prompt 12's table definition — a gap in that prompt, not a new design
-- decision. Prompt 13 surfaced it: the Book editor's "Default chapter access"
-- Select and the Chapter composer's access pre-fill both read it, and neither
-- had a column to read from.
--
-- It is deliberately NOT the same thing as app_settings.default_chapter_access:
--   app_settings.default_chapter_access -> what a NEW BOOK defaults to
--   books.default_chapter_access        -> what THIS SERIAL defaults to
-- Collapsing the two would lose per-serial paywall shape (a romance serial
-- running 1-3 free and the rest locked versus a fully free backlist title).
--
-- Every chapter created inside a book inherits this value unless
-- app_settings.free_chapters_at_start places it inside the free run at the
-- start of the book.

alter table books
  add column default_chapter_access chapter_access not null default 'locked';

comment on column books.default_chapter_access is
  'Default access applied to chapters created in this book. Per-book override of app_settings.default_chapter_access.';

-- Teardown (local resets only)
-- alter table books drop column if exists default_chapter_access;
