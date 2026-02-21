-- Migration 007: Add missing invoice columns
alter table public.invoices
  add column if not exists issue_date date default current_date,
  add column if not exists tax_rate numeric(5,2) default 0,
  add column if not exists subtotal_amount numeric(10,2) default 0,
  add column if not exists tax_amount numeric(10,2) default 0,
  add column if not exists total_amount numeric(10,2) default 0;

-- Copy existing data to new columns for consistency
update public.invoices set
  subtotal_amount = subtotal,
  tax_amount = tax,
  total_amount = total
where total_amount = 0;
