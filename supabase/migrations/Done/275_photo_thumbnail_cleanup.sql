-- 275_photo_thumbnail_cleanup.sql
-- Gallery thumbnails: every job / equipment photo upload now also writes
-- `<path minus extension>_thumb.jpg` next to the full file
-- (shared/src/lib/photoThumbs.ts). Deleting a photo row must remove BOTH
-- objects, so the AFTER DELETE cleanup functions (057/058, hardened in 073)
-- now delete the thumbnail too. A missing thumbnail (photos uploaded before
-- this change) simply matches nothing.
--
-- Rental property photos are cleaned up by the apps directly (they remove
-- both paths), so no trigger change is needed for them.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run. CREATE OR REPLACE keeps the existing triggers wired — no trigger
-- changes needed.

create or replace function public.delete_job_photo_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  begin
    delete from storage.objects
    where bucket_id in ('business-private', 'business-assets')
      and name in (
        old.storage_path,
        regexp_replace(old.storage_path, '\.[^./]+$', '') || '_thumb.jpg'
      );
  exception when others then
    -- Best-effort cleanup; never block the row delete.
    raise warning 'delete_job_photo_object: storage cleanup failed for %: %', old.storage_path, sqlerrm;
  end;
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
  begin
    delete from storage.objects
    where bucket_id in ('business-private', 'business-assets')
      and name in (
        old.storage_path,
        regexp_replace(old.storage_path, '\.[^./]+$', '') || '_thumb.jpg'
      );
  exception when others then
    raise warning 'delete_equipment_photo_object: storage cleanup failed for %: %', old.storage_path, sqlerrm;
  end;
  return old;
end;
$$;
