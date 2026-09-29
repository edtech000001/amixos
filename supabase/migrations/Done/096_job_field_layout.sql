-- 096_job_field_layout.sql
-- Per-business field LAYOUT for the job form: which section each field lives in
-- and the order within that section. Lets an industry reorder fields and move
-- them between the General / Location / Schedule / Workers / Notes groups.
--
-- Shape: a JSONB array of { "key": "<field_key>", "section": "general|location|
-- schedule|workers|notes" } in display order (array order = within-section
-- order). null = the built-in default layout. Missing fields fall back to their
-- default section, appended. Replaces the old cosmetic job_field_order.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists job_field_layout jsonb;

comment on column public.businesses.job_field_layout is
  'Ordered job-form field layout: [{key,section}]. Array order = within-section order. null = default.';
