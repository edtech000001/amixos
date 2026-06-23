-- 090_payroll.sql
-- Payroll module: a per-business pay frequency + a record of payments made to
-- each worker for a pay period.
--
-- Pay frequency (weekly | biweekly | monthly) is chosen by the owner in
-- Ajustes; the Payroll page derives each period from it. A worker's hours for a
-- period come from logged timesheets + the total_hours of jobs they're crewed
-- on + any driver_hours — all × their pay_rate = gross pay. Marking a worker
-- paid inserts a payroll_payments row; un-marking deletes it (one row per
-- worker per period, enforced by the unique index).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- 1. Per-business pay frequency.
alter table public.businesses
  add column if not exists payroll_frequency text not null default 'monthly';

-- 2. Payment records.
create table if not exists public.payroll_payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  employee_id   uuid references public.employees(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  hours         numeric not null default 0,
  gross_pay     numeric not null default 0,
  method        text not null default 'cash',   -- 'cash' | 'check'
  check_number  text,
  paid_at       timestamptz not null default now(),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  -- One payment per worker per period — mark/un-mark toggles this row.
  unique (business_id, employee_id, period_start)
);

create index if not exists payroll_payments_business_period_idx
  on public.payroll_payments (business_id, period_start);

alter table public.payroll_payments enable row level security;

-- Any member reads their business's payroll records.
drop policy if exists "members read payroll_payments" on public.payroll_payments;
create policy "members read payroll_payments" on public.payroll_payments for select
  using (public.is_business_member(business_id));

-- Only owner/admin record or reverse payments.
drop policy if exists "admins insert payroll_payments" on public.payroll_payments;
create policy "admins insert payroll_payments" on public.payroll_payments for insert
  with check (public.is_business_admin(business_id));

drop policy if exists "admins update payroll_payments" on public.payroll_payments;
create policy "admins update payroll_payments" on public.payroll_payments for update
  using (public.is_business_admin(business_id));

drop policy if exists "admins delete payroll_payments" on public.payroll_payments;
create policy "admins delete payroll_payments" on public.payroll_payments for delete
  using (public.is_business_admin(business_id));
