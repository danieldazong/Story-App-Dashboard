-- Widen the covers bucket to accept PNG.
--
-- The Cover thumbnail card's constraint line has read "JPG, PNG or WebP" since
-- an explicit product decision earlier in the build (see AGENTS.md, Known
-- implementation defects — the "cover fixture format mismatch" entry records
-- that the allowlist was deliberately widened to include PNG at user request).
--
-- Prompt 12 created this bucket with image/jpeg + image/webp only, and prompt
-- 15 specifies "JPEG or WebP only", so the bucket and the UI copy disagreed.
-- Resolved in favour of the product decision: the copy stays, the bucket
-- widens. The rule this protects is the one in AGENTS.md — the accepted-formats
-- copy and what the system actually accepts must always agree.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'covers';

-- Teardown (local resets only)
-- update storage.buckets
-- set allowed_mime_types = array['image/jpeg', 'image/webp']
-- where id = 'covers';
