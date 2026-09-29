-- 112_business_default_tax_rate.sql
-- Default tax rate (%) for NEW invoices, configurable in Ajustes → Facturas.
-- Applied when generating an invoice from a job, batch-invoicing, and the
-- new-invoice form; each invoice still stores its own tax_rate so changing
-- the default never touches existing invoices.
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists invoice_tax_rate numeric(5,2) not null default 0;

comment on column public.businesses.invoice_tax_rate is
  'Default tax percentage applied to new invoices (0 = no tax). Per-invoice tax_rate is frozen at creation.';
