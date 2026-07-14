-- 143_employee_loans.sql
-- Per-worker LOAN LEDGER. Some businesses advance loans to workers and deduct a
-- bit from each check to pay them down. Each row is a signed ledger entry:
--   amount > 0  → a loan given (increases what the worker owes)
--   amount < 0  → a repayment/deduction (decreases what they owe)
-- Outstanding balance for a worker = sum(amount). A repayment made while cutting
-- a check links back to that payroll_payments row via payroll_payment_id.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.employee_loans (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  -- + = loan given, - = repayment/deduction.
  amount              numeric(12,2) not null,
  note                text,
  -- Effective date of the entry (may be back-dated for historical loans).
  -- Distinct from created_at (the row's actual insert time).
  entry_date          date not null default current_date,
  -- Set when the entry is a repayment taken out of a specific check.
  payroll_payment_id  uuid references public.payroll_payments(id) on delete set null,
  created_by          uuid,
  created_at          timestamptz not null default now()
);

-- Back-fill for anyone who ran an earlier version of this migration.
alter table public.employee_loans
  add column if not exists entry_date date not null default current_date;

create index if not exists employee_loans_biz_emp_idx
  on public.employee_loans (business_id, employee_id);

alter table public.employee_loans enable row level security;

drop policy if exists "members read employee_loans" on public.employee_loans;
create policy "members read employee_loans" on public.employee_loans for select
  using (public.is_business_member(business_id));

drop policy if exists "writers write employee_loans" on public.employee_loans;
create policy "writers write employee_loans" on public.employee_loans for all
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));
