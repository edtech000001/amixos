-- 065_storage_lockdown.sql
-- SECURITY FIX (Critical + High): remove the bucket-wide storage policies from
-- migration 003 that override every scoped per-business policy.
--
-- Migration 003 created three policies on storage.objects that match the WHOLE
-- `business-assets` bucket with no business-membership predicate:
--   • "Public read access"            (select)  → the `public` role (anon
--       included) can SELECT/LIST every object in the bucket. Because RLS
--       combines permissive policies with OR, this nullified the scoped
--       files_select / job_photos_select / equipment select policies added in
--       053 / 057 / 045. Net effect: anyone holding the public anon key (it
--       ships in the web + mobile JS bundle) could LIST and read EVERY
--       business's files, job photos, and equipment photos — cross-tenant
--       data exfiltration.
--   • "Authenticated users can upload" (insert) → ANY authenticated user could
--       write to ANY path, including another business's folder (cross-tenant
--       overwrite / storage abuse).
--   • "Authenticated users can update" (update) → same, for overwrites.
--
-- This migration DROPS those three policies. The scoped per-business policies
-- from 045 / 053 / 057 (member read, writer write, gated by is_business_member
-- / can_write_business on the <prefix>/<business_id>/… path) then actually
-- govern files, job photos, and equipment.
--
-- LOGOS: logos live at the `logos/…` prefix and MUST stay publicly readable —
-- they render on the public invoice/proposal pages (/factura/<token>,
-- /propuesta/<token>) to anonymous viewers. The `business-assets` bucket stays
-- public so those public URLs keep working. After dropping the broad insert /
-- update policies, logo UPLOADS would break, so we re-add narrow write policies
-- limited to the `logos/` prefix for authenticated users.
--
-- RESIDUAL (intentional, see the "Option B" note in the audit): because the
-- bucket remains public for logos, file/job/equipment objects are still
-- readable by anyone who has the *direct* object URL. They are no longer
-- ENUMERABLE (anon LIST returns nothing) and no longer writable cross-tenant,
-- which closes the actively-exploitable vectors. For full confidentiality of
-- the Files module, move sensitive content to a private bucket + signed URLs.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run.

-- ── 1. Drop the three bucket-wide policies from migration 003 ────────────────
drop policy if exists "Public read access"            on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Authenticated users can update" on storage.objects;

-- ── 2. Narrow logo write policies (logos/ prefix only) ──────────────────────
-- Logos are public branding (read is served by the public bucket). Writes are
-- limited to the logos/ prefix so they can no longer reach files/, jobs/, or
-- equipment/ paths. (Logo paths aren't consistently business-scoped today —
-- onboarding writes `logos/<timestamp>.ext` — so we gate on authentication
-- rather than business membership; tighten to `logos/<business_id>/…` later.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'logos_insert'
  ) then
    create policy "logos_insert" on storage.objects for insert
      with check (
        bucket_id = 'business-assets'
        and (storage.foldername(name))[1] = 'logos'
        and auth.role() = 'authenticated'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'logos_update'
  ) then
    create policy "logos_update" on storage.objects for update
      using (
        bucket_id = 'business-assets'
        and (storage.foldername(name))[1] = 'logos'
        and auth.role() = 'authenticated'
      );
  end if;
end$$;

-- ── 3. Verify (optional) ────────────────────────────────────────────────────
-- After running, these should return ZERO rows — no broad, predicate-less
-- policy left on the bucket:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname in ('Public read access',
--                        'Authenticated users can upload',
--                        'Authenticated users can update');
--
-- And the scoped policies should be present:
--   select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
