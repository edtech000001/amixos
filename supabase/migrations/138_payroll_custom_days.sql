-- 138_payroll_custom_days.sql
-- Custom pay-period length: businesses that pay every N days (3, 10, …)
-- instead of weekly/biweekly/monthly. payroll_frequency gains the value
-- 'custom' (text column — no constraint change needed) and this column holds
-- the N. Periods step from the pay anchor date in fixed N-day windows.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists payroll_custom_days integer;

comment on column public.businesses.payroll_custom_days is
  'Days per pay period when payroll_frequency = ''custom'' (e.g. 3). Null otherwise.';
