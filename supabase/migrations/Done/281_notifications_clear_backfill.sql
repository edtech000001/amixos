-- 281_notifications_clear_backfill.sql
-- One-time cleanup for notifications created before 280's auto-clear existed:
-- e.g. "Invoice overdue" still unread on an invoice that was paid later.
-- Applies the same rules 280 now applies going forward. Safe to re-run.
--
-- Run manually in the Supabase SQL Editor.

-- Invoice no longer overdue (paid, voided, …).
update public.notifications n set read_at = now()
  from public.invoices i
 where n.entity_type = 'invoice' and n.entity_id = i.id
   and n.type = 'invoice_overdue' and n.read_at is null
   and i.status is distinct from 'overdue';

-- Archived jobs.
update public.notifications n set read_at = now()
  from public.jobs j
 where n.entity_type = 'job' and n.entity_id = j.id
   and n.read_at is null and j.archived_at is not null;

-- Shift since clocked out.
update public.notifications n set read_at = now()
  from public.timesheets t
 where n.entity_type = 'timesheet' and n.entity_id = t.id
   and n.type in ('clockout_missed', 'clockout_missed_self') and n.read_at is null
   and t.clock_out is not null;

-- Item no longer low on stock.
update public.notifications n set read_at = now()
  from public.inventory_items i
 where n.entity_type = 'inventory' and n.entity_id = i.id
   and n.type = 'low_stock' and n.read_at is null
   and not i.is_low_stock;

-- Job / invoice deleted: nothing left to open.
delete from public.notifications n
 where n.entity_type = 'job' and n.entity_id is not null
   and not exists (select 1 from public.jobs j where j.id = n.entity_id);
delete from public.notifications n
 where n.entity_type = 'invoice' and n.entity_id is not null
   and not exists (select 1 from public.invoices i where i.id = n.entity_id);
