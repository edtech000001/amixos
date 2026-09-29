-- 083_invoice_start_number.sql
-- Configurable starting invoice number per business.
--
-- Invoice numbers are generated sequentially (FAC-/INV- + zero-padded counter).
-- This adds a per-business starting point so owners can choose where the
-- sequence begins (e.g. FAC-1000 so invoices don't look brand-new). The next
-- number is computed as: start_number + (count of existing invoices).
--
-- Default is 1000 for ALL businesses. Owners can change the value any time in
-- Ajustes → Facturas (per business). The next number is start_number + the
-- count of existing invoices, so a business that already has invoices will
-- continue from start+count rather than exactly start.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists invoice_start_number integer not null default 1000;

-- If an earlier run of this migration backfilled existing businesses to 1,
-- bring them back up to the 1000 default. (No-op on a fresh run.)
update public.businesses
  set invoice_start_number = 1000
  where invoice_start_number = 1;
