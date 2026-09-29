-- 058_equipment_photos_orphan_cleanup.sql
-- Backfill the same storage orphan-cleanup that job_photos got in 057 onto
-- equipment_photos (045). Without this, deleting a piece of equipment (or
-- a whole business) cascade-deletes the equipment_photos rows but leaves
-- the actual image files sitting in the `business-assets` bucket forever.
--
-- The AFTER DELETE trigger removes the matching storage.objects row on
-- every equipment_photos delete — single-photo delete from the UI AND
-- cascade deletes. SECURITY DEFINER so it can delete from storage.objects
-- (owned by the storage admin role) regardless of who triggered it.
--
-- NOTE: the app's single-photo delete also calls storage.remove() directly;
-- with this trigger that becomes redundant (harmless no-op) — the trigger is
-- what makes the CASCADE path clean up too.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

create or replace function public.delete_equipment_photo_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id = 'business-assets'
    and name = old.storage_path;
  return old;
end;
$$;

drop trigger if exists equipment_photos_delete_object on public.equipment_photos;
create trigger equipment_photos_delete_object
  after delete on public.equipment_photos
  for each row execute function public.delete_equipment_photo_object();
