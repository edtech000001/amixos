-- 269_notifications.sql
-- Notification system v1: in-app inbox + push queue.
--
-- One pipeline: an event (trigger below, or notifications_hourly() for
-- time-based checks) calls notify_users(), which inserts one row per
-- recipient with the title/body already rendered in that user's language.
-- The bell reads these rows; the API dispatcher cron sends a push for every
-- row with push_sent_at null and stamps it.
--
-- Triggers are the source of truth because most writes come straight from the
-- web/mobile apps (audit_log is client-written and best-effort).

-- ─── 1. Tables ────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null,
  category      text not null check (category in ('jobs','invoices','team','inventory','account')),
  title         text not null,
  body          text not null default '',
  entity_type   text,          -- 'job' | 'invoice' | 'inventory' | 'equipment' | 'timesheet' | 'member' | 'billing'
  entity_id     uuid,
  dedupe_key    text not null,
  read_at       timestamptz,
  push_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, type, dedupe_key)
);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;
create index if not exists notifications_push_queue_idx
  on public.notifications (created_at) where push_sent_at is null;

create table if not exists public.push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'ios',
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create table if not exists public.notification_prefs (
  user_id           uuid not null references auth.users(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  push_enabled      boolean not null default true,
  muted_categories  text[] not null default '{}',
  updated_at        timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- Business-local clock for server-side "overdue" / "tomorrow" checks. Filled
-- by the owner's device when null; null falls back to America/Chicago.
alter table public.businesses add column if not exists timezone text;

-- ─── 2. RLS ───────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_prefs enable row level security;

drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own notifications mark read" on public.notifications;
create policy "own notifications mark read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Clients may only flip read_at; rows are inserted by definer functions only.
revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own notification prefs" on public.notification_prefs;
create policy "own notification prefs" on public.notification_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and business_id in (select bm.business_id from public.business_members bm
                                  where bm.user_id = (select auth.uid())));

-- A device token moves between accounts when someone signs out and another
-- signs in on the same phone. The upsert must be able to take it over, which
-- RLS can't express (the old row belongs to someone else) → a definer RPC.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'ios'), now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
  where auth.uid() is not null;
$$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- ─── 3. Recipient helpers ─────────────────────────────────────────────────────
-- Members whose effective permission on <res> passes, mirroring member_res /
-- member_view (181) but for every member rather than auth.uid().
--   act = 'view'  → view scope must be 'all'
--   act = other   → the boolean flag (create/edit/delete) must be true
-- loc: the row's branch. Location-locked members (159) only get rows of their
-- own branches; unfiled rows (null) go to everyone allowed.
create or replace function public.notif_members(b_id uuid, res text, act text, loc uuid default null)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(bm.user_id), '{}')
  from public.business_members bm
  left join public.business_roles br on br.business_id = bm.business_id and br.key = bm.role
  where bm.business_id = b_id
    and (
      bm.role = 'owner'
      or (act = 'view' and coalesce(
            br.permissions #>> array['resources', res, 'view'],
            public.default_role_permissions(bm.role) #>> array['resources', res, 'view'],
            'none') = 'all')
      or (act <> 'view' and coalesce((coalesce(
            br.permissions #>> array['resources', res, act],
            public.default_role_permissions(bm.role) #>> array['resources', res, act]))::boolean,
            false))
    )
    and (
      loc is null
      or bm.role = 'owner'
      or not (case
                when br.permissions #>> array['caps','switchLocations'] is null then bm.role = 'field'
                else (br.permissions #>> array['caps','switchLocations']) = 'false'
              end)
      or loc in (select el.location_id
                 from public.employee_locations el
                 join public.employees e on e.id = el.employee_id
                 where el.business_id = b_id and e.user_id = bm.user_id)
    );
$$;

-- App users on a job's crew (employees linked to a login).
create or replace function public.notif_job_crew(p_job uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct e.user_id), '{}')
  from public.job_assignments ja
  join public.employees e on e.id = ja.employee_id
  where ja.job_id = p_job and e.user_id is not null;
$$;

create or replace function public.notif_client_name(p_client uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(c.company_name), ''),
                  nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
                  '—')
  from public.clients c where c.id = p_client;
$$;

create or replace function public.notif_person_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    (select u.email from auth.users u where u.id = p_user),
    '—')
  from (select p_user as id) x
  left join public.profiles p on p.id = x.id;
$$;

create or replace function public.notif_tz(b_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(b.timezone, ''), 'America/Chicago') from public.businesses b where b.id = b_id;
$$;

-- ─── 4. notify_users ──────────────────────────────────────────────────────────
-- Inserts one row per recipient (deduped), in the recipient's language
-- (user_metadata.locale = 'en' → English, anything else → Spanish).
-- Skips: non-members, the user who caused the event (p_skip_actor), and users
-- who muted the category ('account' can't be muted).
create or replace function public.notify_users(
  p_business    uuid,
  p_users       uuid[],
  p_type        text,
  p_category    text,
  p_entity_type text,
  p_entity_id   uuid,
  p_dedupe      text,
  p_title_es    text,
  p_body_es     text,
  p_title_en    text,
  p_body_en     text,
  p_skip_actor  boolean default true
) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_business is null or p_users is null or cardinality(p_users) = 0 then return 0; end if;

  insert into public.notifications
    (business_id, user_id, type, category, title, body, entity_type, entity_id, dedupe_key)
  select p_business, r.uid, p_type, p_category,
         case when u.raw_user_meta_data->>'locale' = 'en' then p_title_en else p_title_es end,
         coalesce(case when u.raw_user_meta_data->>'locale' = 'en' then p_body_en else p_body_es end, ''),
         p_entity_type, p_entity_id, p_dedupe
  from (select distinct x as uid from unnest(p_users) x where x is not null) r
  join public.business_members bm on bm.business_id = p_business and bm.user_id = r.uid
  join auth.users u on u.id = r.uid
  left join public.notification_prefs np on np.user_id = r.uid and np.business_id = p_business
  where (not p_skip_actor or r.uid is distinct from auth.uid())
    and (p_category = 'account' or np.muted_categories is null or not (p_category = any (np.muted_categories)))
  on conflict (user_id, type, dedupe_key) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ─── 5. Event triggers ────────────────────────────────────────────────────────
-- Notification failures must never block the business write → every trigger
-- body swallows its own errors (warning only).

-- Jobs: proposal response, reschedule, cancel, completed by crew, published.
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
          'Trabajo completado', public.notif_person_name(auth.uid()) || ' completó ' || new.title,
          'Job completed', public.notif_person_name(auth.uid()) || ' completed ' || new.title);
      end if;
    end if;
  exception when others then
    raise warning 'notif_jobs_trg: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notif_jobs on public.jobs;
drop trigger if exists notif_jobs_ins on public.jobs;
-- No `update OF cols`: column lists ignore changes made by BEFORE triggers
-- (e.g. 117 flips published_to_crew), so filter with WHEN instead.
create trigger notif_jobs_ins
  after insert on public.jobs
  for each row when (new.client_response is not null or new.status = 'completed')
  execute function public.notif_jobs_trg();
create trigger notif_jobs
  after update on public.jobs
  for each row when (old.client_response is distinct from new.client_response
                  or old.scheduled_date is distinct from new.scheduled_date
                  or old.status is distinct from new.status
                  or old.published_to_crew is distinct from new.published_to_crew)
  execute function public.notif_jobs_trg();

-- Crew assignment. The job form re-inserts the whole crew on every save; the
-- dedupe key (job id) keeps that to one notification per worker per job.
create or replace function public.notif_job_assignments_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare j record; uid uuid;
begin
  begin
    select e.user_id into uid from public.employees e where e.id = new.employee_id;
    if uid is null then return null; end if;
    select id, business_id, title, scheduled_date, status, published_to_crew
      into j from public.jobs where id = new.job_id;
    if not found or not j.published_to_crew or j.status in ('completed', 'invoiced', 'cancelled') then
      return null;
    end if;
    perform public.notify_users(
      j.business_id, array[uid],
      'job_assigned', 'jobs', 'job', j.id, j.id::text,
      'Nuevo trabajo asignado',
      j.title || coalesce(' · ' || to_char(j.scheduled_date, 'DD/MM/YYYY'), ''),
      'New job assigned',
      j.title || coalesce(' · ' || to_char(j.scheduled_date, 'MM/DD/YYYY'), ''));
  exception when others then
    raise warning 'notif_job_assignments_trg: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notif_job_assignments on public.job_assignments;
create trigger notif_job_assignments
  after insert on public.job_assignments
  for each row execute function public.notif_job_assignments_trg();

-- Invoices: paid (status set by the 264 trigger) and overdue (flipped by the
-- apps or by notifications_hourly()).
create or replace function public.notif_invoices_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare client text; recips uuid[];
begin
  begin
    if new.status is not distinct from old.status or new.status not in ('paid', 'overdue') then
      return null;
    end if;
    client := coalesce(public.notif_client_name(new.client_id), '—');
    recips := public.notif_members(new.business_id, 'invoices', 'view', new.location_id);

    if new.status = 'paid' then
      perform public.notify_users(
        new.business_id, recips,
        'invoice_paid', 'invoices', 'invoice', new.id,
        new.id::text || ':' || coalesce(new.paid_at::text, now()::text),
        'Factura pagada',
        'Factura #' || new.invoice_number || ' de ' || client || ' — ' || to_char(new.total_amount, 'FM$999,999,990.00'),
        'Invoice paid',
        'Invoice #' || new.invoice_number || ' from ' || client || ' — ' || to_char(new.total_amount, 'FM$999,999,990.00'));
    else
      -- Automatic flip → don't skip the "actor" (whoever's device flipped it).
      perform public.notify_users(
        new.business_id, recips,
        'invoice_overdue', 'invoices', 'invoice', new.id,
        new.id::text || ':' || coalesce(new.due_date::text, ''),
        'Factura vencida',
        'La factura #' || new.invoice_number || ' de ' || client
          || coalesce(' venció el ' || to_char(new.due_date, 'DD/MM/YYYY'), ' está vencida'),
        'Invoice overdue',
        'Invoice #' || new.invoice_number || ' for ' || client
          || coalesce(' was due ' || to_char(new.due_date, 'MM/DD/YYYY'), ' is overdue'),
        false);
    end if;
  exception when others then
    raise warning 'notif_invoices_trg: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notif_invoices on public.invoices;
-- WHEN, not `update OF status`: the 264 BEFORE trigger sets status when a
-- payment lands, and column-list triggers don't see BEFORE-trigger changes.
create trigger notif_invoices
  after update on public.invoices
  for each row when (old.status is distinct from new.status and new.status in ('paid', 'overdue'))
  execute function public.notif_invoices_trg();

-- New team member (accept_invite inserts business_members).
create or replace function public.notif_members_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; admins uuid[];
begin
  begin
    if new.role = 'owner' then return null; end if;   -- business creation
    select coalesce(array_agg(user_id), '{}') into admins
      from public.business_members
      where business_id = new.business_id and role in ('owner', 'admin') and user_id <> new.user_id;
    who := public.notif_person_name(new.user_id);
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

drop trigger if exists notif_business_members on public.business_members;
create trigger notif_business_members
  after insert on public.business_members
  for each row execute function public.notif_members_trg();

-- Low stock: is_low_stock (stored generated, 166) turned true.
create or replace function public.notif_inventory_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.is_low_stock and not coalesce(old.is_low_stock, false) then
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

drop trigger if exists notif_inventory on public.inventory_items;
create trigger notif_inventory
  after update on public.inventory_items
  for each row when (new.is_low_stock and not coalesce(old.is_low_stock, false))
  execute function public.notif_inventory_trg();

-- ─── 6. Time-based checks (API cron calls this hourly) ────────────────────────
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
                    public.notif_person_name(t.user_id)) as worker
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

-- Billing problems (Stripe webhook, service role). Owner only; can't be muted.
create or replace function public.notify_billing(p_business uuid, p_kind text, p_date date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare owners uuid[];
begin
  select coalesce(array_agg(user_id), '{}') into owners
    from public.business_members where business_id = p_business and role = 'owner';
  if p_kind = 'payment_failed' then
    return public.notify_users(p_business, owners, 'billing_payment_failed', 'account', 'billing', null,
      current_date::text,
      'Pago de suscripción fallido',
      'No pudimos cobrar tu suscripción de Amixos. Actualiza tu método de pago.',
      'Subscription payment failed',
      'We couldn''t charge your Amixos subscription. Update your payment method.',
      false);
  elsif p_kind = 'trial_ending' then
    return public.notify_users(p_business, owners, 'billing_trial_ending', 'account', 'billing', null,
      coalesce(p_date::text, current_date::text),
      'Tu prueba termina pronto',
      'Tu prueba gratis de Amixos termina' || coalesce(' el ' || to_char(p_date, 'DD/MM/YYYY'), ' pronto') || '.',
      'Your trial ends soon',
      'Your Amixos free trial ends' || coalesce(' ' || to_char(p_date, 'MM/DD/YYYY'), ' soon') || '.',
      false);
  end if;
  return 0;
end;
$$;

-- ─── 7. Grants ────────────────────────────────────────────────────────────────
-- Trigger functions and internal helpers are never callable by clients
-- (security baseline: never grant trigger fns to authenticated).
revoke execute on function public.notif_members(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.notif_job_crew(uuid) from public, anon, authenticated;
revoke execute on function public.notif_client_name(uuid) from public, anon, authenticated;
revoke execute on function public.notif_person_name(uuid) from public, anon, authenticated;
revoke execute on function public.notif_tz(uuid) from public, anon, authenticated;
revoke execute on function public.notify_users(uuid, uuid[], text, text, text, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notif_jobs_trg() from public, anon, authenticated;
revoke execute on function public.notif_job_assignments_trg() from public, anon, authenticated;
revoke execute on function public.notif_invoices_trg() from public, anon, authenticated;
revoke execute on function public.notif_members_trg() from public, anon, authenticated;
revoke execute on function public.notif_inventory_trg() from public, anon, authenticated;
revoke execute on function public.notifications_hourly() from public, anon, authenticated;
revoke execute on function public.notify_billing(uuid, text, date) from public, anon, authenticated;
grant execute on function public.notifications_hourly() to service_role;
grant execute on function public.notify_billing(uuid, text, date) to service_role;

-- Verify after running:
--   select public.notifications_hourly();            -- returns counts, no error
--   select type, title, body from public.notifications order by created_at desc limit 20;
