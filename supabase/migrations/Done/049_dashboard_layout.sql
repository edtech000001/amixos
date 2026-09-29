-- Migration 049: customizable dashboard widgets
-- Run in Supabase SQL Editor.
--
-- Stores the per-business dashboard widget layout chosen in the new
-- "Personalizar" mode on the home screen (web + mobile, synced):
--   { "order": ["quickActions", "earningsMonth", ...], "hidden": ["jobsActive"] }
-- NULL means "use the default layout". Widget ids not present in `order`
-- (e.g. added by a future module) are appended at the end automatically
-- by the client, so this column never needs backfilling.

alter table public.businesses
  add column if not exists dashboard_layout jsonb;
