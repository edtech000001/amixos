-- 076_equipment_value_loan.sql
-- Add monetary fields to equipment: `value` (what the asset is worth) and
-- `loan_amount` (outstanding balance when not paid off). The equipment form
-- always shows Value; Loan amount + lender show only when paid_off = false.
--
-- Both nullable — older rows and "value unknown" stay null. Stored as
-- numeric(12,2) so the UI can format them as currency.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.equipment
  add column if not exists value       numeric(12,2),
  add column if not exists loan_amount numeric(12,2);
