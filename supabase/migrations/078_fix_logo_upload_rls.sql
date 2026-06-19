-- 078_fix_logo_upload_rls.sql
-- FIX: "new row violates row-level security policy" when uploading a logo
-- (onboarding step 4 + Settings → logo), web and mobile.
--
-- Background: 065 dropped the bucket-wide "Authenticated users can upload"
-- policy and added narrow logos_insert/logos_update gated on
-- auth.role()='authenticated'; 068 tried auth.uid() is not null. Both put the
-- auth check inside the policy PREDICATE, which can evaluate false/NULL in the
-- storage RLS context depending on how the request's JWT is surfaced — so the
-- insert gets rejected.
--
-- Robust fix: scope the policies to the `authenticated` ROLE (the canonical
-- Supabase pattern — Postgres applies the policy based on the request role, no
-- JWT-function call needed) and check only the bucket + `logos/` prefix. Any
-- signed-in user can write a logo; anon cannot. Logos are public branding, so
-- read stays via the public bucket.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run.

drop policy if exists "logos_insert" on storage.objects;
drop policy if exists "logos_update" on storage.objects;

create policy "logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  );

create policy "logos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  )
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
  );

-- ── Diagnostic (optional) ───────────────────────────────────────────────────
-- See exactly what's applied to the bucket after running:
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname='storage' and tablename='objects'
--   order by policyname;
