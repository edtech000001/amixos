-- 043_invoice_field_required.sql
-- Per-business required-field flags for the standard invoice fields, mirroring
-- businesses.client_field_required / employee_field_required / job_field_required.
--
--   - businesses.invoice_field_required: JSONB map of standard invoice field
--     key -> boolean. e.g. { "client": true, "due_date": true }. When a key is
--     true, the new/edit invoice form blocks saving until that field is filled.
--
-- Standard invoice field keys: invoice_number, client, issue_date, due_date, notes.
-- (Per-invoice custom fields keep their own `required` flag on
--  invoice_field_templates — see migration 042.)
--
--   - businesses.invoice_field_order: JSONB array giving the display order of
--     the unified invoice-fields list in Settings. Each entry is either a
--     standard field key ("client") or a custom-template ref ("custom:<uuid>"),
--     mirroring client_field_order / job_field_order.
--
-- Add-if-not-exists, safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists invoice_field_required jsonb not null default '{}'::jsonb;

alter table public.businesses
  add column if not exists invoice_field_order jsonb;
