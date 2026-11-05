-- 271_notification_names.sql
-- Notifications named people by their ACCOUNT (profile name, else email) —
-- e.g. "antoniojacome1991@gmail.com completed Pivot de 7 tower". Names must be
-- what the OWNER entered on the employee record, same as jobs/memberNameMap:
--   employee name in this business → account display name → prettified email
--   local part ("antoniojacome1991"), never the raw address.

create or replace function public.notif_person_name(p_user uuid, p_business uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), '')
       from public.employees e
      where e.business_id = p_business and e.user_id = p_user
      order by e.created_at nulls last
      limit 1),
    (select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
       from public.profiles p where p.id = p_user),
    (select initcap(regexp_replace(split_part(u.email, '@', 1), '[._+-]+', ' ', 'g'))
       from auth.users u where u.id = p_user),
    '—');
$$;
revoke execute on function public.notif_person_name(uuid, uuid) from public, anon, authenticated;

-- Callers now pass the business.
create or replace function public.notif_jobs_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  client text;
  actor_view text;
  d_es text; d_en text;
begin
  begin
    client := coalesce(public.notif_client_name(new.client_id), '—');

    -- 1. Client answered the proposal on the public page.
    if new.client_response is not null
       and (tg_op = 'INSERT' or new.client_response is distinct from old.client_response) then
      perform public.notify_users(
        new.business_id,
        public.notif_members(new.business_id, 'jobs', 'view', new.location_id) || new.created_by,
        'proposal_' || new.client_response, 'jobs', 'job', new.id,
        new.id::text || ':' || new.client_response,
        case when new.client_response = 'accepted' then 'Propuesta aceptada' else 'Propuesta rechazada' end,
        client || case when new.client_response = 'accepted' then ' aceptó «' else ' rechazó «' end || new.title || '»',
        case when new.client_response = 'accepted' then 'Proposal accepted' else 'Proposal declined' end,
        client || case when new.client_response = 'accepted' then ' accepted “' else ' declined “' end || new.title || '”',
        false);
    end if;

    if tg_op = 'UPDATE' then
      -- 2. Rescheduled (crew only cares about live, published jobs).
      if new.scheduled_date is distinct from old.scheduled_date
         and old.scheduled_date is not null and new.scheduled_date is not null
         and new.published_to_crew
         and new.status not in ('completed', 'invoiced', 'cancelled') then
        d_es := to_char(new.scheduled_date, 'DD/MM/YYYY');
        d_en := to_char(new.scheduled_date, 'MM/DD/YYYY');
        perform public.notify_users(
          new.business_id, public.notif_job_crew(new.id),
          'job_rescheduled', 'jobs', 'job', new.id,
          new.id::text || ':' || new.scheduled_date::text,
          'Trabajo reprogramado', new.title || ' ahora es el ' || d_es,
          'Job rescheduled', new.title || ' moved to ' || d_en);
      end if;

      -- 3. Cancelled.
      if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.published_to_crew then
        perform public.notify_users(
          new.business_id, public.notif_job_crew(new.id),
          'job_cancelled', 'jobs', 'job', new.id, new.id::text,
          'Trabajo cancelado', new.title,
          'Job cancelled', new.title);
      end if;

      -- 4. Newly published to crew → crew already on it hears now.
      if new.published_to_crew and not old.published_to_crew
         and new.status not in ('completed', 'invoiced', 'cancelled') then
        perform public.notify_users(
          new.business_id, public.notif_job_crew(new.id),
          'job_assigned', 'jobs', 'job', new.id, new.id::text,
          'Nuevo trabajo asignado',
          new.title || coalesce(' · ' || to_char(new.scheduled_date, 'DD/MM/YYYY'), ''),
          'New job assigned',
          new.title || coalesce(' · ' || to_char(new.scheduled_date, 'MM/DD/YYYY'), ''));
      end if;
    end if;

    -- 5. A crew member (assigned-only job view) completed or logged a job.
    if new.status = 'completed'
       and (tg_op = 'INSERT' or old.status is distinct from 'completed')
       and auth.uid() is not null then
      actor_view := public.member_view(new.business_id, 'jobs');
      if actor_view = 'assigned' then
        perform public.notify_users(
          new.business_id, public.notif_members(new.business_id, 'jobs', 'view', new.location_id),
          'job_completed', 'jobs', 'job', new.id, new.id::text,
          'Trabajo completado', public.notif_person_name(auth.uid(), new.business_id) || ' completó ' || new.title,
          'Job completed', public.notif_person_name(auth.uid(), new.business_id) || ' completed ' || new.title);
      end if;
    end if;
  exception when others then
    raise warning 'notif_jobs_trg: %', sqlerrm;
  end;
  return null;
end;
$$;


create or replace function public.notif_members_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; admins uuid[];
begin
  begin
    if new.role = 'owner' then return null; end if;   -- business creation
    select coalesce(array_agg(user_id), '{}') into admins
      from public.business_members
      where business_id = new.business_id and role in ('owner', 'admin') and user_id <> new.user_id;
    who := public.notif_person_name(new.user_id, new.business_id);
    perform public.notify_users(
      new.business_id, admins,
      'member_joined', 'team', 'member', new.user_id, new.user_id::text,
      'Nuevo miembro del equipo', who || ' se unió al equipo',
      'New team member', who || ' joined your team');
  exception when others then
    raise warning 'notif_members_trg: %', sqlerrm;
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

  -- d) Equipment plate / insurance / warranty within 30 days, and again within 7.
  for r in
    select q.*, case when q.days <= 7 then 7 else 30 end as win
    from (
      select e.id, e.business_id, e.name, f.field, f.d,
             f.d - (now() at time zone coalesce(nullif(b.timezone, ''), 'America/Chicago'))::date as days
      from public.equipment e
      join public.businesses b on b.id = e.business_id
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
      'equipment_expiring', 'inventory', 'equipment', r.id,
      r.id::text || ':' || r.field || ':' || r.d::text || ':' || r.win,
      'Vence pronto',
      r.name || ': ' || case r.field when 'plate' then 'placas' when 'insurance' then 'seguro' else 'garantía' end
        || ' vence el ' || to_char(r.d, 'DD/MM/YYYY'),
      'Expiring soon',
      r.name || ': ' || case r.field when 'plate' then 'plates' when 'insurance' then 'insurance' else 'warranty' end
        || ' expires ' || to_char(r.d, 'MM/DD/YYYY'),
      false);
  end loop;

  -- e) Retention: the inbox only needs the last 90 days.
  delete from public.notifications where created_at < now() - interval '90 days';

  return jsonb_build_object('overdue', n_overdue, 'tomorrow', n_tomorrow,
                            'clockout', n_clock, 'equipment', n_equip);
end;
$$;


drop function if exists public.notif_person_name(uuid);

-- "Joined" fires at COMMIT, not mid-statement: accept_invite links the new
-- member to their employee row (176) AFTER inserting business_members, so an
-- immediate trigger saw no employee and fell back to the email.
drop trigger if exists notif_business_members on public.business_members;
create constraint trigger notif_business_members
  after insert on public.business_members
  deferrable initially deferred
  for each row execute function public.notif_members_trg();

-- Fix rows already sent with an email in the body.
update public.notifications n
   set body = replace(n.body, u.email, trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')))
  from public.employees e
  join auth.users u on u.id = e.user_id
 where e.business_id = n.business_id
   and n.type in ('job_completed', 'member_joined', 'clockout_missed')
   and nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), '') is not null
   and position(u.email in n.body) > 0;

-- Re-assert grants on the replaced functions (create or replace keeps them,
-- but this file must be safe to read on its own).
revoke execute on function public.notif_jobs_trg() from public, anon, authenticated;
revoke execute on function public.notif_members_trg() from public, anon, authenticated;
revoke execute on function public.notifications_hourly() from public, anon, authenticated;
grant execute on function public.notifications_hourly() to service_role;
