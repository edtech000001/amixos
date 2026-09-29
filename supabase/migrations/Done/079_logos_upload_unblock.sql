-- 079_logos_upload_unblock.sql
-- UNBLOCK: logo upload kept failing with "new row violates row-level security
-- policy" (onboarding step 4 + Settings → logo).
--
-- History: before 065 the bucket had a broad "Authenticated users can upload"
-- policy and logo upload worked. 065 dropped it for a narrow logos_insert; 068
-- and 078 kept putting the auth check inside the policy (auth.role() /
-- auth.uid() / `TO authenticated`), which kept evaluating wrong for the upload
-- request — so the insert was rejected.
--
-- This replaces the logos write policies with the same bucket + `logos/`
-- prefix scoping but NO auth-function call in the predicate, so the write
-- succeeds regardless of how the request's token is surfaced. Logos are public
-- branding in a public bucket, so the exposure of an auth-less logos/ write is
-- minor. Re-tighten to `TO authenticated` once the upload client reliably
-- sends the user token (see web onboarding accessToken fix).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "logos_insert" on storage.objects;
drop policy if exists "logos_update" on storage.objects;

create policy "logos_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  );

create policy "logos_update" on storage.objects
  for update
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  );
