-- 080_logos_reharden.sql
-- Re-tighten the logo write policies to authenticated-only.
--
-- 079 had loosened logos_insert/logos_update to {public} (no auth) while we
-- were chasing the upload failure. The real cause turned out to be the upload
-- using upsert:true (INSERT ... ON CONFLICT) rather than a plain insert — fixed
-- in code (web onboarding upsert:false). A plain AUTHENTICATED insert is
-- allowed, so we can scope logo writes back to the `authenticated` role.
--
-- SAFETY: after running this, re-test a logo upload (onboarding + Settings). If
-- it fails, the upload request is arriving anonymous — re-run 079 to revert to
-- the working-but-public policy. Logos are public branding in a public bucket;
-- real data is in the private `business-private` bucket, so a public logos/
-- write is low-risk either way.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "logos_insert" on storage.objects;
create policy "logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  );

drop policy if exists "logos_update" on storage.objects;
create policy "logos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  );
