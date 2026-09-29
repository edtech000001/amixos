-- 111_invoice_payment_method.sql
-- How an invoice was paid (cash, check #, transfer, card, Zelle…). Free text
-- so businesses can record whatever their bookkeeping uses. Set by the CSV
-- import ("Método de pago" column); paid_at already stores WHEN it was paid.
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.invoices
  add column if not exists payment_method text;

comment on column public.invoices.payment_method is
  'How the invoice was paid (free text: cash, check #1024, transfer, card…). paid_at stores when.';
