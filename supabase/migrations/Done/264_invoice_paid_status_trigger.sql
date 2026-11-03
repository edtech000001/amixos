-- 264_invoice_paid_status_trigger.sql
-- Paid status follows the ledger in the database, not on the device.
--
-- The apps decided "paid" from the payments list they loaded earlier, so two
-- people each recording $500 on a $1,000 invoice both saw half-paid and the
-- invoice stayed 'sent' forever. Changing the total of a paid invoice (adding
-- a job, editing a line) never re-checked it either.
--
-- Whenever amount_paid (kept by invoices_sync_amount_paid, 251/263) or
-- total_amount changes:
--   * draft/sent/overdue and now covered        → paid (paid_at kept or now)
--   * paid, payments involved, no longer covered → sent
-- A 'paid' invoice with no payment rows at all (imported, marked by hand) is
-- left alone. The apps' own status updates stay — they agree with this.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.invoices_status_from_payments()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.amount_paid is not distinct from old.amount_paid
     and new.total_amount is not distinct from old.total_amount then
    return new;
  end if;

  -- Half-cent tolerance, same as the apps (split payments drift in floats).
  if new.status in ('draft', 'sent', 'overdue')
     and coalesce(new.total_amount, 0) > 0
     and coalesce(new.amount_paid, 0) >= new.total_amount - 0.005 then
    new.status  := 'paid';
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.status = 'paid'
     and (coalesce(old.amount_paid, 0) > 0 or coalesce(new.amount_paid, 0) > 0)
     and coalesce(new.amount_paid, 0) < coalesce(new.total_amount, 0) - 0.005 then
    new.status  := 'sent';
    new.paid_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.invoices_status_from_payments() from public, anon, authenticated;

drop trigger if exists invoices_status_from_payments on public.invoices;
create trigger invoices_status_from_payments
  before update of amount_paid, total_amount on public.invoices
  for each row execute function public.invoices_status_from_payments();
