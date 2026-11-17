-- 280_notifications_auto_clear.sql
-- Acting on the thing a notification is about clears it, for every recipient:
--   job archived                → its notifications marked read
--   job / invoice deleted       → its notifications deleted (they'd open nothing)
--   invoice leaves 'overdue'    → "invoice overdue" marked read (paid, voided…)
--   shift clocked out           → "missed clock-out" marked read
--   item back above low stock   → "low stock" marked read
-- Bulk actions (archive 20 jobs) fire per row, so they clear too.
-- Same rules as 269: WHEN clauses (not UPDATE OF), every body swallows its own
-- errors so a notification problem never blocks the business write, trigger
-- functions are not executable by clients.
--
-- Run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- Lookups by entity (one per archived/deleted row) need an index.
create index if not exists notifications_entity_idx
  on public.notifications (entity_id) where entity_id is not null;

create or replace function public.notif_clear(
  p_entity_type text, p_entity_id uuid, p_types text[], p_delete boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_delete then
    delete from public.notifications
     where entity_type = p_entity_type and entity_id = p_entity_id;
  else
    update public.notifications set read_at = now()
     where entity_type = p_entity_type and entity_id = p_entity_id
       and read_at is null
       and (p_types is null or type = any (p_types));
  end if;
exception when others then
  null;
end;
$$;

create or replace function public.notif_clear_jobs_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.notif_clear('job', old.id, null, true);
    return old;
  end if;
  perform public.notif_clear('job', new.id, null, false);
  return new;
exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists notif_clear_jobs_archived on public.jobs;
create trigger notif_clear_jobs_archived
  after update on public.jobs
  for each row when (old.archived_at is null and new.archived_at is not null)
  execute function public.notif_clear_jobs_trg();

drop trigger if exists notif_clear_jobs_deleted on public.jobs;
create trigger notif_clear_jobs_deleted
  after delete on public.jobs
  for each row execute function public.notif_clear_jobs_trg();

create or replace function public.notif_clear_invoices_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.notif_clear('invoice', old.id, null, true);
    return old;
  end if;
  perform public.notif_clear('invoice', new.id, array['invoice_overdue'], false);
  return new;
exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists notif_clear_invoices_not_overdue on public.invoices;
create trigger notif_clear_invoices_not_overdue
  after update on public.invoices
  for each row when (old.status = 'overdue' and new.status is distinct from 'overdue')
  execute function public.notif_clear_invoices_trg();

drop trigger if exists notif_clear_invoices_deleted on public.invoices;
create trigger notif_clear_invoices_deleted
  after delete on public.invoices
  for each row execute function public.notif_clear_invoices_trg();

create or replace function public.notif_clear_timesheets_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notif_clear('timesheet', new.id, array['clockout_missed', 'clockout_missed_self'], false);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notif_clear_timesheets_clocked_out on public.timesheets;
create trigger notif_clear_timesheets_clocked_out
  after update on public.timesheets
  for each row when (old.clock_out is null and new.clock_out is not null)
  execute function public.notif_clear_timesheets_trg();

create or replace function public.notif_clear_inventory_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notif_clear('inventory', new.id, array['low_stock'], false);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notif_clear_inventory_restocked on public.inventory_items;
create trigger notif_clear_inventory_restocked
  after update on public.inventory_items
  for each row when (old.is_low_stock and not new.is_low_stock)
  execute function public.notif_clear_inventory_trg();

revoke execute on function public.notif_clear(text, uuid, text[], boolean) from public, anon, authenticated;
revoke execute on function public.notif_clear_jobs_trg()       from public, anon, authenticated;
revoke execute on function public.notif_clear_invoices_trg()   from public, anon, authenticated;
revoke execute on function public.notif_clear_timesheets_trg() from public, anon, authenticated;
revoke execute on function public.notif_clear_inventory_trg()  from public, anon, authenticated;
