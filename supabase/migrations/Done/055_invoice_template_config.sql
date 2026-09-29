-- Migration 054: invoice template config + public share token.
-- Run manually in the Supabase SQL Editor. Add-if-not-exists, safe to re-run.
--
-- - businesses.invoice_template: the business-wide default template config
--   (JSONB serialization of InvoiceTemplateConfig — preset id, accent color,
--   section order/visibility, text blocks, etc.). NULL → app DEFAULT preset.
-- - invoices.template_config: a per-invoice frozen copy of the resolved config,
--   snapshotted on send / first public-share so restyling the default never
--   mutates an already-delivered invoice or its live public link. NULL → fall
--   back to the business default.
-- - invoices.share_token: random unguessable token for the public /factura/<token>
--   view (mirrors jobs.share_token from migration 019).

alter table public.businesses
  add column if not exists invoice_template jsonb;

alter table public.invoices
  add column if not exists template_config jsonb,
  add column if not exists share_token text unique;
