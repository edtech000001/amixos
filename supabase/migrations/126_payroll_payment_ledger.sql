-- 126_payroll_payment_ledger.sql
-- Partial payroll payments: a worker can be paid in several checks within one
-- pay period ("$800 for 25 h mid-period, the rest at period end"), each its
-- own record with the amount AND the hours it covers. The old design forced
-- exactly one payment per (worker, period) via a unique constraint — drop it
-- so payments become a ledger. The Payroll screen now sums them per period.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.payroll_payments
  drop constraint if exists payroll_payments_business_id_employee_id_period_start_key;

-- Lookups go per worker per period now that several rows can exist.
create index if not exists payroll_payments_business_emp_period_idx
  on public.payroll_payments (business_id, employee_id, period_start);
