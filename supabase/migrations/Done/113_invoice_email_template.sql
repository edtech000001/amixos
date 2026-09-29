-- 113_invoice_email_template.sql
-- Customizable subject/body for the "Send invoice" email (Ajustes → Facturas
-- → Email). NULL/empty = the app's standard localized message. Templates
-- support {{token}} placeholders (number/numero, link/enlace, client/cliente,
-- business/negocio, total, due_date/vencimiento) — substituted at send time
-- in shared/src/lib/invoiceEmail.ts.
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists invoice_email_subject text,
  add column if not exists invoice_email_body text;
