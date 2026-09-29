-- 095_job_field_hidden.sql
-- Per-business show/hide of INDIVIDUAL job-form fields (an eye toggle next to
-- each field in Ajustes → Trabajos). Lets an industry drop the specific fields
-- it doesn't use — by default every field is shown.
--
-- Shape: a JSONB object of { "<field_key>": true } for HIDDEN fields. Absent /
-- false = shown. A section heading auto-hides when all its fields are hidden.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists job_field_hidden jsonb;

comment on column public.businesses.job_field_hidden is
  'Per-field hide map for the job form: { field_key: true } = hidden. Absent = shown.';
