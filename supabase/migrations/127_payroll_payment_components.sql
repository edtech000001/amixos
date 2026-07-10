-- 127_payroll_payment_components.sql
-- Per-payment formula-component snapshot: when a business's pay formula reads
-- job custom fields (e.g. overnight-stay counts), each check records how much
-- of each component it paid for — historical record, independent of later job
-- edits. Shape: { "<display label>": <number> }, e.g. { "Regresaron el mismo
-- día?: No": 2 }. Null for businesses without a formula.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.payroll_payments
  add column if not exists components jsonb;

comment on column public.payroll_payments.components is
  'Formula job-field counts covered by this payment (label → number). Null = no formula components.';
