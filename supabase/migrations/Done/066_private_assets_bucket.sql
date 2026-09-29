-- 066_private_assets_bucket.sql
-- OPTION B (full confidentiality for sensitive uploads): move files, job
-- photos, and equipment photos out of the PUBLIC `business-assets` bucket into
-- a new PRIVATE bucket `business-private`, served only via short-lived signed
-- URLs to authenticated members. Logos stay in `business-assets` (public) so
-- they keep rendering on the public invoice/proposal pages.
--
-- After 065 closed enumeration + cross-tenant writes, the remaining residual
-- was that file/photo objects in the public bucket are still readable by their
-- direct URL if that URL ever leaks. A private bucket removes that: every read
-- goes through createSignedUrl, which checks RLS membership and expires.
--
-- ROLLOUT ORDER (no downtime):
--   1. Run THIS migration (creates the bucket + policies + repoints triggers).
--   2. Run the relocation script in COPY mode (api/scripts/migrate-assets-to-private.mjs copy)
--      — objects now exist in BOTH buckets.
--   3. Deploy the app build that reads sensitive assets via signed URLs from
--      `business-private` (shared bucket constants flipped).
--   4. Run the script in CLEANUP mode (… cleanup) to delete the originals from
--      the public `business-assets` bucket — this is what actually removes the
--      public exposure.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run. Assumes is_business_member()/can_write_business() exist (002/045/053).

-- ── 1. Create the private bucket ────────────────────────────────────────────
-- public = false → no public URLs; objects are only reachable via the
-- authenticated/sign endpoints, which enforce the RLS policies below.
insert into storage.buckets (id, name, public)
values ('business-private', 'business-private', false)
on conflict (id) do update set public = false;

-- ── 2. Scoped RLS policies on the private bucket ────────────────────────────
-- Path layout is `<prefix>/<business_id>/…` for all three content types
-- (files/, jobs/, equipment/), so segment [2] is the owning business. Members
-- read; writers (owner/admin/manager/office) write. Mirrors 045/053/057 but
-- bound to the new bucket.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='private_assets_select') then
    create policy "private_assets_select" on storage.objects for select
      using (
        bucket_id = 'business-private'
        and public.is_business_member(((storage.foldername(name))[2])::uuid)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='private_assets_insert') then
    create policy "private_assets_insert" on storage.objects for insert
      with check (
        bucket_id = 'business-private'
        and public.can_write_business(((storage.foldername(name))[2])::uuid)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='private_assets_update') then
    create policy "private_assets_update" on storage.objects for update
      using (
        bucket_id = 'business-private'
        and public.can_write_business(((storage.foldername(name))[2])::uuid)
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='private_assets_delete') then
    create policy "private_assets_delete" on storage.objects for delete
      using (
        bucket_id = 'business-private'
        and public.can_write_business(((storage.foldername(name))[2])::uuid)
      );
  end if;
end$$;

-- ── 3. Repoint the orphan-cleanup triggers to the private bucket ────────────
-- These AFTER DELETE triggers remove the storage object when a file/photo row
-- is deleted (single delete + cascade). They previously deleted only from
-- `business-assets`; now they clear the object from EITHER bucket so cleanup
-- works during the migration window and after. (053 / 057 / 058 originals.)
create or replace function public.delete_file_entry_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.storage_path is not null then
    delete from storage.objects
    where bucket_id in ('business-private', 'business-assets')
      and name = old.storage_path;
  end if;
  return old;
end;
$$;

create or replace function public.delete_job_photo_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id in ('business-private', 'business-assets')
    and name = old.storage_path;
  return old;
end;
$$;

create or replace function public.delete_equipment_photo_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id in ('business-private', 'business-assets')
    and name = old.storage_path;
  return old;
end;
$$;

-- ── 4. Verify (optional) ────────────────────────────────────────────────────
--   select id, public from storage.buckets where id = 'business-private';   -- public = false
--   select policyname, cmd from pg_policies
--   where schemaname='storage' and tablename='objects' and policyname like 'private_assets_%';
