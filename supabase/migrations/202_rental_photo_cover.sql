-- 202_rental_photo_cover.sql
-- =============================================================================
-- Property photo gallery upgrades: pick which photo is the property's COVER
-- (shown on the list card). Cover resolution: is_cover first, else the oldest
-- photo — so existing properties keep their current cover until one is chosen.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

alter table public.rental_property_photos
  add column if not exists is_cover boolean not null default false;
