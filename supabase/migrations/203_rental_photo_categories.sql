-- 203_rental_photo_categories.sql
-- =============================================================================
-- Property photo categories for damage documentation: a photo can belong to a
-- LEASE (= one tenant's stay) with a phase — 'before' (move-in condition) or
-- 'after' (move-out) — or stay general (both null). Lease deletion keeps the
-- photos (set null → they fall back to the general group).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

alter table public.rental_property_photos
  add column if not exists lease_id uuid references public.rental_leases(id) on delete set null,
  add column if not exists phase text check (phase in ('before', 'after'));
