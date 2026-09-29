-- 057_job_photos.sql
-- Job photos: attach before/after / documentation photos to a job.
-- Mirrors the equipment_photos design (045) — one row per photo, files
-- live in the existing `business-assets` bucket.
--
-- Storage path convention:
--   jobs/<business_id>/<job_id>/<uuid>.<ext>
-- job_photos.storage_path tracks the key inside the bucket. The first
-- segment after `jobs/` is the business_id, which the storage RLS
-- policies parse to gate access.
--
-- ORPHAN CLEANUP: an AFTER DELETE trigger removes the matching
-- storage.objects row whenever a job_photos row is deleted — directly
-- OR via cascade when the parent job (or business) is deleted. This is
-- what guarantees no files are left taking up storage after a delete.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Add-if-not-
-- exists, safe to re-run.

-- ─── 1. job_photos table ──────────────────────────────────────────────────
create table if not exists public.job_photos (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,

  storage_path  text not null,
  -- Optional one-line caption (e.g. "Antes", "Después", "Daño en techo").
  caption       text,
  sort_order    integer not null default 0,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists job_photos_job_id_idx
  on public.job_photos (job_id, sort_order);

-- ─── 2. RLS ───────────────────────────────────────────────────────────────
alter table public.job_photos enable row level security;

-- Same read access as the parent job (any member), writes limited to
-- writers. Cascade delete from jobs cleans up rows; the storage objects
-- are removed by the trigger in section 4.
-- `create policy` has no IF NOT EXISTS, so drop-then-create keeps this
-- migration re-runnable.
drop policy if exists "members read job photos" on public.job_photos;
create policy "members read job photos" on public.job_photos for select
  using (public.is_business_member(business_id));

drop policy if exists "writers insert job photos" on public.job_photos;
create policy "writers insert job photos" on public.job_photos for insert
  with check (public.can_write_business(business_id));

drop policy if exists "writers update job photos" on public.job_photos;
create policy "writers update job photos" on public.job_photos for update
  using (public.can_write_business(business_id));

drop policy if exists "writers delete job photos" on public.job_photos;
create policy "writers delete job photos" on public.job_photos for delete
  using (public.can_write_business(business_id));

-- ─── 3. Storage bucket policies for jobs/ subpath ─────────────────────────
-- The `business-assets` bucket already exists (logos + equipment use it).
-- Gate the jobs/ subpath the same way: (foldername)[2] is the business_id.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'business-assets') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'job_photos_select'
    ) then
      create policy "job_photos_select" on storage.objects for select
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'job_photos_insert'
    ) then
      create policy "job_photos_insert" on storage.objects for insert
        with check (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'job_photos_update'
    ) then
      create policy "job_photos_update" on storage.objects for update
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'job_photos_delete'
    ) then
      create policy "job_photos_delete" on storage.objects for delete
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;
  end if;
end$$;

-- ─── 4. Orphan cleanup: delete the storage object with the photo row ──────
-- Fires on every job_photos delete — single-photo delete from the UI AND
-- cascade deletes when a job or business is removed. SECURITY DEFINER so
-- the function can delete from storage.objects (owned by the storage
-- admin role) regardless of which user triggered the cascade.
create or replace function public.delete_job_photo_object()
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

drop trigger if exists job_photos_delete_object on public.job_photos;
create trigger job_photos_delete_object
  after delete on public.job_photos
  for each row execute function public.delete_job_photo_object();
