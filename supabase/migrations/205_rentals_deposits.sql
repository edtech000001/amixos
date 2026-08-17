-- 205_rentals_deposits.sql
-- =============================================================================
-- Rentals v2, part 2 — security deposits become tracked money instead of a
-- number typed once on the lease form.
--
--   deposit_amount (194)  = what was collected
--   deposit_returned_on   = null while HELD; a date once returned
--   deposit_withheld      = amount kept for damages at return time
--   deposit_note          = why (damage description, deduction breakdown)
--
-- "Deposits held" on the Overview = Σ deposit_amount of leases with
-- deposit_returned_on is null.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

alter table public.rental_leases
  add column if not exists deposit_returned_on date,
  add column if not exists deposit_withheld    numeric(12,2),
  add column if not exists deposit_note        text;

comment on column public.rental_leases.deposit_returned_on is
  'Null = deposit still held by the landlord; a date = returned to the tenant.';
