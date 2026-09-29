-- 141_invoice_qty_field.sql
-- Invoice setting: which JOB custom field to use as the line-item QUANTITY when
-- a job has no Materials & Labor items (e.g. a "Total ft" field). Stores the
-- job_field_templates.field_key; null = default quantity of 1.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

alter table public.businesses
  add column if not exists invoice_qty_field text;

comment on column public.businesses.invoice_qty_field is
  'Job custom-field key whose numeric value becomes the invoice line quantity for placeholder (no-items) job lines. Null = quantity 1.';
