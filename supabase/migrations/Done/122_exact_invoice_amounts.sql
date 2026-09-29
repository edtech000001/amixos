-- 122_exact_invoice_amounts.sql
-- THE definitive invoice-amounts fix, verified against the owner's previous
-- invoicing system: that system stores EXACT sums of qty × unit price (no
-- rounding anywhere) and rounds only on display. Its paid total
-- 1,847,223.64 equals our exact-decimal recompute to the digit.
--
-- Two things prevented matching it:
--   1. subtotal/tax/total columns were numeric(10,2) — Postgres rounded
--      every stored total to cents on write, so raw sums could not exist.
--   2. The app computed totals in JS floats (….125 arrives as .124999…),
--      so the column's rounding sometimes went the wrong way (the 3¢ drift).
--
-- Fix: widen the columns to unconstrained numeric, then recompute every
-- invoice from its line items in exact decimal. The apps round once, at
-- display time.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.invoices
  alter column subtotal_amount type numeric using subtotal_amount::numeric,
  alter column tax_amount      type numeric using tax_amount::numeric,
  alter column total_amount    type numeric using total_amount::numeric;

with line_sums as (
  select i.id,
         sum(coalesce((item->>'qty')::numeric, 0) * coalesce((item->>'rate')::numeric, 0)) as sub
  from public.invoices i
  cross join lateral jsonb_array_elements(coalesce(i.line_items, '[]'::jsonb)) as item
  group by i.id
),
recomputed as (
  select ls.id,
         ls.sub,
         ls.sub * coalesce(i.tax_rate, 0)::numeric / 100 as tax,
         ls.sub
           + ls.sub * coalesce(i.tax_rate, 0)::numeric / 100
           - coalesce(i.discount, 0)::numeric as tot
  from line_sums ls
  join public.invoices i on i.id = ls.id
)
update public.invoices i set
  subtotal_amount = r.sub,
  tax_amount      = r.tax,
  total_amount    = r.tot
from recomputed r
where r.id = i.id
  and (i.subtotal_amount is distinct from r.sub
    or i.tax_amount      is distinct from r.tax
    or i.total_amount    is distinct from r.tot);

-- Sanity — should print paid = 1847223.64, sent = 108040.03 (grand 1955263.67):
--   select status, sum(total_amount) from public.invoices
--   where business_id = '27e313fa-fd2f-44e8-b47d-31041a16b09f'
--   group by status;
