-- 201_rentals_storage_policies.sql
-- =============================================================================
-- Rentals photo/doc uploads silently failed: migration 194 assumed the
-- business-private bucket's generic policies covered `rentals/<business_id>/…`,
-- but every existing policy is pinned to its own prefix ('jobs', 'jobdocs') —
-- so storage rejected every rentals upload (property photos, maintenance
-- photos, lease docs, payment/receipt photos).
--
-- Add the four `rentals/` prefix policies, gated by the rentals module
-- permission to match the rental_* table RLS (164-pattern):
--   read  → member_view(biz,'rentals') <> 'none'
--   write → member_res(biz,'rentals','edit')
-- Path shape: rentals/<business_id>/<kind>/…  ([2] = business id).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rentals_assets_select'
  ) then
    create policy "rentals_assets_select" on storage.objects for select
      using (
        bucket_id = 'business-private'
        and (storage.foldername(name))[1] = 'rentals'
        and public.member_view(((storage.foldername(name))[2])::uuid, 'rentals') <> 'none'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rentals_assets_insert'
  ) then
    create policy "rentals_assets_insert" on storage.objects for insert
      with check (
        bucket_id = 'business-private'
        and (storage.foldername(name))[1] = 'rentals'
        and public.member_res(((storage.foldername(name))[2])::uuid, 'rentals', 'edit')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rentals_assets_update'
  ) then
    create policy "rentals_assets_update" on storage.objects for update
      using (
        bucket_id = 'business-private'
        and (storage.foldername(name))[1] = 'rentals'
        and public.member_res(((storage.foldername(name))[2])::uuid, 'rentals', 'edit')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rentals_assets_delete'
  ) then
    create policy "rentals_assets_delete" on storage.objects for delete
      using (
        bucket_id = 'business-private'
        and (storage.foldername(name))[1] = 'rentals'
        and public.member_res(((storage.foldername(name))[2])::uuid, 'rentals', 'edit')
      );
  end if;
end$$;
