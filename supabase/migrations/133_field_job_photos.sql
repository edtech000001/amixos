-- 133_field_job_photos.sql
-- "Can't upload photo, try again" for field crew: job-photo writes were gated
-- on can_write_business (owner/admin/manager/office), so a field tech taking
-- photos on their OWN job was rejected at both the job_photos row and the
-- storage object. Additive policies (they OR with 057's):
--   * field can add photos to jobs they're assigned to or created,
--   * field can delete photos THEY uploaded on those jobs,
--   * any business member can write storage objects under jobs/<business_id>/
--     (the row-level job_photos policy is the real gate — storage paths don't
--     know the job id).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "field photos on own jobs" on public.job_photos;
create policy "field photos on own jobs" on public.job_photos for insert
  with check (
    public.is_business_member(business_id)
    and (
      public.is_assigned_to_job(job_id)
      or exists (
        select 1 from public.jobs j
        where j.id = job_photos.job_id and j.created_by = auth.uid()
      )
    )
  );

drop policy if exists "field deletes own photos" on public.job_photos;
create policy "field deletes own photos" on public.job_photos for delete
  using (
    created_by = auth.uid()
    and public.is_business_member(business_id)
  );

do $$
begin
  if exists (select 1 from storage.buckets where id = 'business-assets') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'job_photos_insert_member'
    ) then
      create policy "job_photos_insert_member" on storage.objects for insert
        with check (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'jobs'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;
  end if;
end $$;
