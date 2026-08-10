-- 190_payment_photo_rotation.sql
-- Display-only rotation for payment photos (check pictures), same model as
-- job_photos.rotation (059): the stored file is untouched; the app renders the
-- photo rotated by this many degrees (0/90/180/270). Set from the new rotate
-- button in the payment-photo viewer.
--
-- IMPORTANT: run manually in the Supabase SQL Editor BEFORE updating the app —
-- the payments list now selects this column. Idempotent / safe to re-run.

alter table public.invoice_payments
  add column if not exists photo_rotation int not null default 0;
