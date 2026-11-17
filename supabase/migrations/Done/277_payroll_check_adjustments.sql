-- 277_payroll_check_adjustments.sql
-- Quick deduct / add on a paycheck (Payroll → Mark paid / Record payment).
-- gross_pay stays the worker's actual pay for the period; these only explain
-- why the check itself was smaller or bigger:
--   check_deducted  — taken out of this check (cash advance, loan repayment)
--   check_added     — added to this check (e.g. the owner paid a worker $200
--                     out of pocket and is reimbursed on his own check)
--   check_adjust_note — the reasons, as typed
-- Check amount = gross_pay - check_deducted + check_added.
--
-- Run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.payroll_payments
  add column if not exists check_deducted    numeric(12,2) not null default 0,
  add column if not exists check_added       numeric(12,2) not null default 0,
  add column if not exists check_adjust_note text;
