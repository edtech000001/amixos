-- 276_equipment_notification_category.sql
-- Equipment is its own module, so its alerts get their own notification
-- category instead of riding on 'inventory':
--   * notifications.category allows 'equipment'
--   * "plate / insurance / warranty expiring" alerts use it, and only fire
--     for businesses with the Equipment module turned on
--   * existing equipment alerts move to the new category
--   * anyone who had muted 'inventory' (which used to cover equipment) gets
--     'equipment' muted too, so nobody starts receiving alerts they turned off
--   * low-stock alerts only fire while the Inventory module is on
--   * new "expires today" alert on the expiration date itself (after the
--     30-day and 7-day warnings)
--
-- notifications_hourly() below is 271's version with only section d changed.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('jobs','invoices','team','inventory','equipment','account'));

update public.notifications set category = 'equipment'
where type = 'equipment_expiring' and category <> 'equipment';

update public.notification_prefs
set muted_categories = array_append(muted_categories, 'equipment')
where 'inventory' = any (muted_categories) and not ('equipment' = any (muted_categories));

-- Low stock: only while the Inventory module is on.
create or replace function public.notif_inventory_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.is_low_stock and not coalesce(old.is_low_stock, false)
       and exists (select 1 from public.business_modules bm
                   where bm.business_id = new.business_id and bm.module_key = 'inventory' and bm.is_active) then
      perform public.notify_users(
        new.business_id, public.notif_members(new.business_id, 'inventory', 'edit', new.location_id),
        'low_stock', 'inventory', 'inventory', new.id,
        new.id::text || ':' || current_date::text,
        'Inventario bajo', new.name || ': quedan ' || new.quantity,
        'Low stock', new.name || ': ' || new.quantity || ' left');
    end if;
  exception when others then
    raise warning 'notif_inventory_trg: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.notifications_hourly()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  n_overdue int := 0; n_tomorrow int := 0; n_clock int := 0; n_equip int := 0;
  admins uuid[];
begin
  -- a) Overdue: flip in each business's local date; notif_invoices_trg notifies.
  with flipped as (
    update public.invoices i set status = 'overdue'
    from public.businesses b
    where b.id = i.business_id
      and i.status = 'sent'
      and i.due_date is not null
      and i.due_date < (now() at time zone coalesce(nullif(b.timezone, ''), 'America/Chicago'))::date
    returning i.id
  ) select count(*) into n_overdue from flipped;

  -- b) Tomorrow's jobs, sent from 5 pm local (dedupe = once per job per date).
  for r in
    select j.id, j.business_id, j.title, j.scheduled_date, j.time_start, j.job_address
    from public.jobs j
    join public.businesses b on b.id = j.business_id
    where j.published_to_crew
      and j.status in ('scheduled', 'accepted', 'in_progress')
      and extract(hour from now() at time zone coalesce(nullif(b.timezone, ''), 'America/Chicago')) >= 17
      and j.scheduled_date = (now() at time zone coalesce(nullif(b.timezone, ''), 'America/Chicago'))::date + 1
  loop
    n_tomorrow := n_tomorrow + public.notify_users(
      r.business_id, public.notif_job_crew(r.id),
      'job_tomorrow', 'jobs', 'job', r.id, r.id::text || ':' || r.scheduled_date::text,
      'Trabajo mañana',
      r.title || coalesce(' · ' || to_char(r.time_start, 'HH12:MI AM'), '') || coalesce(' · ' || nullif(r.job_address, ''), ''),
      'Job tomorrow',
      r.title || coalesce(' · ' || to_char(r.time_start, 'HH12:MI AM'), '') || coalesce(' · ' || nullif(r.job_address, ''), ''),
      false);
  end loop;

  -- c) Shift still open after 12 h → the worker + whoever sees all employees.
  for r in
    select t.id, t.user_id, t.clock_in, t.business_id,
           coalesce(nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
                    public.notif_person_name(t.user_id, t.business_id)) as worker
    from public.timesheets t
    left join public.employees e on e.id = t.employee_id
    where t.clock_out is null
      and t.user_id is not null          -- a real clock-in (manual hour entries have no user)
      and t.hours_worked is null         -- manual entries store hours and never clock out
      and t.clock_in < now() - interval '12 hours'
      and t.clock_in > now() - interval '7 days'
  loop
    if r.user_id is not null then
      n_clock := n_clock + public.notify_users(
        r.business_id, array[r.user_id],
        'clockout_missed_self', 'team', 'timesheet', r.id, r.id::text,
        '¿Olvidaste marcar salida?',
        'Tu turno sigue abierto desde ' || to_char(r.clock_in at time zone public.notif_tz(r.business_id), 'DD/MM HH12:MI AM'),
        'Forgot to clock out?',
        'Your shift has been open since ' || to_char(r.clock_in at time zone public.notif_tz(r.business_id), 'MM/DD HH12:MI AM'),
        false);
    end if;
    n_clock := n_clock + public.notify_users(
      r.business_id,
      array(select x from unnest(public.notif_members(r.business_id, 'employees', 'view')) x
            where x is distinct from r.user_id),
      'clockout_missed', 'team', 'timesheet', r.id, r.id::text,
      'Salida sin marcar',
      r.worker || ' no ha marcado salida desde ' || to_char(r.clock_in at time zone public.notif_tz(r.business_id), 'DD/MM HH12:MI AM'),
      'Missed clock-out',
      r.worker || ' hasn''t clocked out since ' || to_char(r.clock_in at time zone public.notif_tz(r.business_id), 'MM/DD HH12:MI AM'),
      false);
  end loop;

  -- d) Equipment plate / insurance / warranty: 30 days out, 7 days out, and on the day
  --    (own 'equipment' category since 276; Equipment module must be on).
  for r in
    -- win = which alert: 30 / 7 days ahead, or 0 = the expiration day itself.
    select q.*, case when q.days = 0 then 0 when q.days <= 7 then 7 else 30 end as win
    from (
      select e.id, e.business_id, e.name, f.field, f.d,
             f.d - (now() at time zone coalesce(nullif(b.timezone, ''), 'America/Chicago'))::date as days
      from public.equipment e
      join public.businesses b on b.id = e.business_id
      -- Only businesses that have the Equipment module turned on.
      join public.business_modules bm
        on bm.business_id = e.business_id and bm.module_key = 'equipment' and bm.is_active
      cross join lateral (values ('plate', e.plate_expiration),
                                 ('insurance', e.insurance_expiration),
                                 ('warranty', e.warranty_expiration)) f(field, d)
      where f.d is not null
    ) q
    where q.days between 0 and 30
  loop
    select coalesce(array_agg(user_id), '{}') into admins
      from public.business_members where business_id = r.business_id and role in ('owner', 'admin');
    n_equip := n_equip + public.notify_users(
      r.business_id, admins,
      'equipment_expiring', 'equipment', 'equipment', r.id,
      r.id::text || ':' || r.field || ':' || r.d::text || ':' || r.win,
      case when r.win = 0 then 'Vence hoy' else 'Vence pronto' end,
      r.name || ': ' || case r.field when 'plate' then 'placas' when 'insurance' then 'seguro' else 'garantía' end
        -- "placas vencen", "seguro / garantía vence"
        || case when r.field = 'plate' then ' vencen' else ' vence' end
        || case when r.win = 0 then ' hoy' else ' el ' || to_char(r.d, 'DD/MM/YYYY') end,
      case when r.win = 0 then 'Expires today' else 'Expiring soon' end,
      r.name || ': ' || case r.field when 'plate' then 'plates' when 'insurance' then 'insurance' else 'warranty' end
        -- "plates expire", "insurance / warranty expires"
        || case when r.field = 'plate' then ' expire' else ' expires' end
        || case when r.win = 0 then ' today' else ' ' || to_char(r.d, 'MM/DD/YYYY') end,
      false);
  end loop;

  -- e) Retention: the inbox only needs the last 90 days.
  delete from public.notifications where created_at < now() - interval '90 days';

  return jsonb_build_object('overdue', n_overdue, 'tomorrow', n_tomorrow,
                            'clockout', n_clock, 'equipment', n_equip);
end;
$$;

revoke execute on function public.notif_inventory_trg() from public, anon, authenticated;
revoke execute on function public.notifications_hourly() from public, anon, authenticated;
grant execute on function public.notifications_hourly() to service_role;
