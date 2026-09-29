-- 073_photo_delete_resilient_trigger.sql
-- FIX: deleting a job photo (or file / equipment photo) silently did nothing.
--
-- The AFTER DELETE orphan-cleanup triggers (057 / 053 / 058, repointed in 066)
-- delete the storage.objects row when a photo/file row is deleted. If that
-- storage delete raises — e.g. a privilege/ownership edge after the storage
-- lockdown (065) + private-bucket move (066), or any future change to
-- storage.objects — the exception propagates and ABORTS the whole transaction,
-- rolling back the row delete. The client (web + mobile) didn't check the
-- error, so the photo just reappeared on reload: "delete does nothing."
--
-- Orphan cleanup is best-effort housekeeping; it must never block the user's
-- delete. Wrap the storage delete in an exception handler so the row delete
-- always commits. A failed storage delete leaves an orphaned object (harmless,
-- reclaimable later) instead of blocking the user.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run. CREATE OR REPLACE keeps the existing triggers wired to these
-- functions — no trigger changes needed.

-- ── Job photos ──────────────────────────────────────────────────────────────
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
      and name = old.storage_path;
  exception when others then
    -- Best-effort cleanup; never block the row delete.
    raise warning 'delete_job_photo_object: storage cleanup failed for %: %', old.storage_path, sqlerrm;
  end;
  return old;
end;
$$;

-- ── Files module ──────────────────────────────────────────────────────────────
create or replace function public.delete_file_entry_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.storage_path is not null then
    begin
      delete from storage.objects
      where bucket_id in ('business-private', 'business-assets')
        and name = old.storage_path;
    exception when others then
      raise warning 'delete_file_entry_object: storage cleanup failed for %: %', old.storage_path, sqlerrm;
    end;
  end if;
  return old;
end;
$$;

-- ── Equipment photos ──────────────────────────────────────────────────────────
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
      and name = old.storage_path;
  exception when others then
    raise warning 'delete_equipment_photo_object: storage cleanup failed for %: %', old.storage_path, sqlerrm;
  end;
  return old;
end;
$$;
