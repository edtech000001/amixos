-- 068_logos_policy_harden.sql
-- FIX (1): logo uploads during onboarding fail ("Upload error. Try again.").
-- ADD (2): a DELETE policy so "Remove logo" in Settings → Negocio can actually
--          delete the object from the bucket (065 only added insert/update, so
--          storage.remove() silently no-ops under RLS today).
--
-- Migration 065 re-added narrow write policies for the `logos/` prefix of the
-- public `business-assets` bucket, but gated them on `auth.role() =
-- 'authenticated'`. That predicate is the odd one out: every other scoped
-- storage policy (045/053/057/066) authorizes via the auth.uid()-based helpers
-- (is_business_member / can_write_business). `auth.role()` can evaluate to NULL
-- in the storage RLS context (depending on how the JWT role claim is surfaced),
-- which silently denies the INSERT and surfaces as a generic upload error.
--
-- This migration redefines logos_insert / logos_update and adds logos_delete,
-- all authorizing on `auth.uid() is not null` (a signed-in user), keeping the
-- same bucket + `logos/` prefix scoping. Logo paths aren't consistently
-- business-scoped (onboarding writes `logos/<timestamp>.ext` before a business
-- exists), so we authorize on "is authenticated", matching the existing
-- insert/update posture for low-sensitivity public branding.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run.

drop policy if exists "logos_insert" on storage.objects;
create policy "logos_insert" on storage.objects for insert
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
    and auth.uid() is not null
  );

drop policy if exists "logos_update" on storage.objects;
create policy "logos_update" on storage.objects for update
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
    and auth.uid() is not null
  );

drop policy if exists "logos_delete" on storage.objects;
create policy "logos_delete" on storage.objects for delete
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
    and auth.uid() is not null
  );

-- ── Verify (optional) ───────────────────────────────────────────────────────
--   select policyname, cmd, with_check, qual from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname in ('logos_insert','logos_update','logos_delete');
