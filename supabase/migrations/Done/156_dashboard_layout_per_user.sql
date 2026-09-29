-- 156_dashboard_layout_per_user.sql
-- Move the dashboard widget layout from a shared business setting to a
-- per-user preference — fixes: one admin customizing their home screen changed
-- it for the owner and every other member (businesses.dashboard_layout is a
-- single shared row that any admin could overwrite).
--
-- Mirrors the existing per-user pattern profiles.dock_apps (071). No new RLS:
-- the profiles row policies already scope a user to their own row.
--
-- Backfill: give each business OWNER their business's current layout so their
-- view doesn't reset (non-owners start on the role default and re-customize
-- independently). businesses.dashboard_layout is left in place but unused —
-- reads/writes now target profiles.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.profiles
  add column if not exists dashboard_layout jsonb;

update public.profiles p
   set dashboard_layout = b.dashboard_layout
  from public.businesses b
 where b.owner_id = p.id
   and b.dashboard_layout is not null
   and p.dashboard_layout is null;
