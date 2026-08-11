-- 192_backfill_legacy_payments.sql
-- Unify the two payment representations. Invoices marked paid before the
-- payments LEDGER existed (or via legacy import) carry only payment_method /
-- paid_at on the invoice row — the app showed them as a bare summary card,
-- while ledger-backed invoices show the itemized list with edit/delete/photo.
--
-- Backfill: every paid invoice with NO ledger rows gets one synthetic
-- invoice_payments row (full amount, the rolled-up method, the paid date).
-- After this, ALL paid invoices render the same full-featured payments card,
-- and the legacy summary never appears again. Editing/deleting the synthetic
-- row works like any other payment (Mark-unpaid clears it, etc.).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent — re-running
-- inserts nothing (the not-exists guard sees the first run's rows).

insert into public.invoice_payments (business_id, invoice_id, amount, method, paid_on)
select
  i.business_id,
  i.id,
  i.total_amount,
  nullif(trim(coalesce(i.payment_method, '')), ''),
  coalesce(i.paid_at::date, i.updated_at::date, current_date)
from public.invoices i
where i.status = 'paid'
  and (i.paid_at is not null or nullif(trim(coalesce(i.payment_method, '')), '') is not null)
  and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id);

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select count(*) from public.invoices i
--   where i.status = 'paid'
--     and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id);
--   -- expect: 0 (every paid invoice now has at least one ledger row)
