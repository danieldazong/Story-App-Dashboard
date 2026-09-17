-- Storage buckets for cover art, narration audio and source manuscripts.
--
-- Paths embed the owning row id (covers/<bookId>/..., audio/<bookId>/<chapterId>/...,
-- scripts/<bookId>/<chapterId>/...), which is why a file upload requires a saved
-- parent row — see AGENTS.md, Project Rules.
--
-- x-upsert is NOT enabled anywhere and must not be. Replacing an asset writes a
-- new immutable path; overwriting one serves stale content through the CDN until
-- propagation catches up.

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'covers',
    'covers',
    true,                       -- public read: cover art is served to every reader client
    2097152,                    -- 2 MB
    array['image/jpeg', 'image/webp']
  ),
  (
    'audio',
    'audio',
    false,                      -- authenticated read (policy below)
    104857600,                  -- 100 MB, matching app_settings.max_audio_size_mb
    array['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav']
  ),
  (
    'scripts',
    'scripts',
    false,                      -- admin only, both directions
    5242880,                    -- 5 MB
    array[
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- covers — public read, admin write
-- ---------------------------------------------------------------------------

create policy covers_read on storage.objects
  for select
  to public
  using (bucket_id = 'covers');

create policy covers_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'covers' and is_admin());

create policy covers_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'covers' and is_admin())
  with check (bucket_id = 'covers' and is_admin());

create policy covers_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'covers' and is_admin());

-- ---------------------------------------------------------------------------
-- audio — authenticated read, admin write
-- ---------------------------------------------------------------------------

-- Any authenticated user can read narration audio. Entitlement gating for
-- locked chapters happens in the mobile app, NOT here — consistent with the
-- chapters table policy, where a locked chapter's script_text is likewise
-- readable. Do not assume this bucket enforces a paywall.
create policy audio_read on storage.objects
  for select
  to authenticated
  using (bucket_id = 'audio');

create policy audio_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'audio' and is_admin());

create policy audio_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'audio' and is_admin())
  with check (bucket_id = 'audio' and is_admin());

create policy audio_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'audio' and is_admin());

-- ---------------------------------------------------------------------------
-- scripts — admin read and write only
-- ---------------------------------------------------------------------------

-- Source manuscripts never reach a reader client.
create policy scripts_read on storage.objects
  for select
  to authenticated
  using (bucket_id = 'scripts' and is_admin());

create policy scripts_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'scripts' and is_admin());

create policy scripts_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'scripts' and is_admin())
  with check (bucket_id = 'scripts' and is_admin());

create policy scripts_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'scripts' and is_admin());

-- ---------------------------------------------------------------------------
-- Teardown (local resets only)
-- ---------------------------------------------------------------------------
-- drop policy if exists scripts_delete on storage.objects;
-- drop policy if exists scripts_update on storage.objects;
-- drop policy if exists scripts_insert on storage.objects;
-- drop policy if exists scripts_read on storage.objects;
-- drop policy if exists audio_delete on storage.objects;
-- drop policy if exists audio_update on storage.objects;
-- drop policy if exists audio_insert on storage.objects;
-- drop policy if exists audio_read on storage.objects;
-- drop policy if exists covers_delete on storage.objects;
-- drop policy if exists covers_update on storage.objects;
-- drop policy if exists covers_insert on storage.objects;
-- drop policy if exists covers_read on storage.objects;
-- delete from storage.buckets where id in ('covers', 'audio', 'scripts');
