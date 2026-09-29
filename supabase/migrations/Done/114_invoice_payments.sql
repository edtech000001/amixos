-- 114_invoice_payments.sql
-- Payment ledger for invoices: each "Marcar pagada / Registrar pago" records
-- a row (amount + method + date), so partial payments accumulate until the
-- balance hits zero and the invoice flips to 'paid'. Deleting a payment can
-- revert a 'paid' invoice back to 'sent' (app-side logic).
--
-- invoices.payment_method (111) stays as the rolled-up summary the CSV
-- import/export uses; the app keeps it in sync with the distinct methods here.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.invoice_payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  amount       numeric not null,
  -- Free text like invoices.payment_method (cash, check #1024, Zelle…).
  method       text,
  paid_on      date not null default current_date,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id);
create index if not exists invoice_payments_business_idx
  on public.invoice_payments (business_id);

alter table public.invoice_payments enable row level security;

-- Financial data — mirror the invoices policies (field workers excluded).
drop policy if exists "non-field read invoice_payments" on public.invoice_payments;
create policy "non-field read invoice_payments" on public.invoice_payments for select
  using (
    public.has_business_role(business_id, array['owner','admin','manager','office','viewer'])
  );

drop policy if exists "office+ insert invoice_payments" on public.invoice_payments;
create policy "office+ insert invoice_payments" on public.invoice_payments for insert
  with check (public.can_write_business(business_id));

-- Deleting a payment is how a mis-entered amount gets corrected (no edit UI),
-- so the same roles that record payments can remove them.
drop policy if exists "office+ delete invoice_payments" on public.invoice_payments;
create policy "office+ delete invoice_payments" on public.invoice_payments for delete
  using (public.can_write_business(business_id));
