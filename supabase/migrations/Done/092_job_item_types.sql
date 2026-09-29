-- 092_job_item_types.sql
-- Per-business toggle for the Labor / Material / Equipment / Other categories on
-- job line items. Some industries (e.g. pivot/irrigation billed by ft × rate)
-- don't itemize by category — the chips are just noise. When this is false the
-- type selector is hidden on job line items and the "Tipo:" prefix is dropped
-- from generated invoice lines. Default true preserves existing behavior.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists job_item_types_enabled boolean not null default true;

comment on column public.businesses.job_item_types_enabled is
  'When false, hides Labor/Material/Equipment/Other categories on job line items and drops the type prefix on invoice lines.';
