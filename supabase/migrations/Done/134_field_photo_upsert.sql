-- 134_field_photo_upsert.sql
-- Follow-up to 133: the mobile app uploads photos with upsert:true (so an
-- offline-outbox RETRY of the same path is idempotent), and a storage upsert
-- exercises the UPDATE policy path — 133 only granted members INSERT, so the
-- field tech's upload still failed. Grant members UPDATE on the jobs/ subpath
-- too. Harmless in practice: filenames are per-upload UUIDs, and the
-- job_photos ROW policies remain the real gate.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

do $$
begin
  if exists (select 1 from storage.buckets where id = 'business-assets') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'job_photos_update_member'
    ) then
      create policy "job_photos_update_member" on storage.objects for update
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        )
        with check (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;
  end if;
end $$;
