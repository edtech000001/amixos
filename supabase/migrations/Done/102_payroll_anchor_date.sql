-- 102_payroll_anchor_date.sql
-- Optional pay-period start date (anchor) per business.
--
-- When set, the Payroll page computes every period as a fixed-length window
-- stepping from this date: weekly = 7-day, biweekly = 14-day windows aligned to
-- the anchor's weekday; monthly = the anchor's day-of-month each month (clamped
-- for short months / leap years). When NULL the legacy defaults apply (weeks
-- run Sunday→Saturday, monthly = calendar month, biweekly = a fixed Sunday).
-- The owner sets it on the Payroll screen next to the frequency selector.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists payroll_anchor_date date;
