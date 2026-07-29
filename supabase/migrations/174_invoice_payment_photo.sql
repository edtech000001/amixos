-- 174_invoice_payment_photo.sql
-- Let a recorded payment carry a photo (e.g. a picture of the check) so the
-- office has proof of payment attached to the ledger row. Stored as a path in
-- the private 'business-private' bucket, signed on read like every other photo.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.invoice_payments
  add column if not exists photo_path text;

comment on column public.invoice_payments.photo_path is
  'Storage path (business-private bucket) of an optional payment photo — e.g. a check picture. Null when none.';
