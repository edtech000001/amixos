-- 191_invoice_payments_update_policy.sql
-- invoice_payments never had an UPDATE policy: 114 created select/insert/
-- delete, 164 recreated insert/delete — so "Edit payment" silently no-oped
-- (RLS matches zero rows and PostgREST reports success). Symptoms: edited
-- amounts/methods/dates never stuck, and attaching a photo to an existing
-- payment uploaded the file but never wrote photo_path (nor photo_rotation
-- from the new rotate button).
--
-- Same rule as its siblings (164): editing a payment is an edit of the
-- invoice's payment state → invoices.edit. Direct member_res(business_id,…)
-- matches the existing single-row write policies (the 181 initplan rewrite
-- deliberately covered read policies only).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "invoice_payments update" on public.invoice_payments;
create policy "invoice_payments update" on public.invoice_payments for update
  using (public.member_res(business_id, 'invoices', 'edit'))
  with check (public.member_res(business_id, 'invoices', 'edit'));

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'invoice_payments'
--   order by cmd;
--   -- expect: delete, insert, select, update
