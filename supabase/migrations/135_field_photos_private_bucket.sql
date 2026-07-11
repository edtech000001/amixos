-- 135_field_photos_private_bucket.sql
-- The REAL fix for field photo uploads (133/134 targeted the wrong bucket):
-- job photos moved to the `business-private` bucket (066, signed URLs), whose
-- insert/update policies are can_write_business (office+) — so a field tech's
-- storage upload was rejected there. Grant business MEMBERS insert + update
-- (upsert retries) on the jobs/ subpath of business-private. The job_photos
-- ROW policies (133) stay the real gate: assigned to the job or its creator.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

do $$
begin
  if exists (select 1 from storage.buckets where id = 'business-private') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'private_job_photos_insert_member'
    ) then
      create policy "private_job_photos_insert_member" on storage.objects for insert
        with check (
          bucket_id = 'business-private'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'private_job_photos_update_member'
    ) then
      create policy "private_job_photos_update_member" on storage.objects for update
        using (
          bucket_id = 'business-private'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        )
        with check (
          bucket_id = 'business-private'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;
  end if;
end $$;
