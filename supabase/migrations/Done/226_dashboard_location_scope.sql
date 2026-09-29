-- 226 — Branch-scope the dashboard RPCs
--
-- The dashboard shows a branch switcher but every number ignored it, because
-- dashboard_stats and dashboard_top_clients only ever took a business id. A
-- control sitting directly above numbers it doesn't affect is worse than no
-- control.
--
-- p_location_id null = every branch (unchanged behaviour, and what
-- single-location businesses always pass).
--
-- How each table scopes, following 104/158:
--   invoices / jobs   own location_id — filtered directly.
--   timesheets        NO link to a job (only a free-text job_description) and
--                     no location of their own, so the only branch they can be
--                     attributed to is the WORKER's — employee_locations, the
--                     same basis payroll uses. Migration 104's comment about
--                     inheriting the job's branch describes a link that was
--                     never built.
--   clients           client_locations is many-to-many and "no link = shared
--                     everywhere" (158). A branch's client count is therefore
--                     the clients linked to it PLUS the unlinked ones, or the
--                     shared-by-default rule would report zero for every
--                     business that has never linked a client.
--
-- Rows with a NULL location_id are deliberately EXCLUDED from a branch view:
-- they belong to no branch, and counting them everywhere would make the
-- branch totals sum to more than the business total.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

create or replace function public.dashboard_stats(
  p_business_id uuid,
  p_start_month timestamptz,
  p_start_year timestamptz,
  p_tz text default 'UTC',
  p_location_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with paid as (
    select total_amount, paid_at
    from public.invoices
    where business_id = p_business_id and status = 'paid' and paid_at >= p_start_year
      and (p_location_id is null or location_id = p_location_id)
  ), monthly as (
    select extract(month from (paid_at at time zone p_tz))::int as m,
           sum(coalesce(total_amount, 0)) as amt
    from paid
    group by 1
  )
  select jsonb_build_object(
    'earnings_month', coalesce((select sum(coalesce(total_amount,0)) from paid where paid_at >= p_start_month), 0),
    'earnings_year',  coalesce((select sum(coalesce(total_amount,0)) from paid), 0),
    'monthly', (select jsonb_agg(coalesce(mm.amt, 0) order by gs.m)
                from generate_series(1, 12) gs(m)
                left join monthly mm on mm.m = gs.m),
    'invoices_pending', (select count(*) from public.invoices
                         where business_id = p_business_id and status = 'sent'
                           and (p_location_id is null or location_id = p_location_id)),
    'invoices_overdue', (select count(*) from public.invoices
                         where business_id = p_business_id and status = 'overdue'
                           and (p_location_id is null or location_id = p_location_id)),
    'invoices_pending_amount', coalesce((select sum(coalesce(total_amount,0)) from public.invoices
                                         where business_id = p_business_id and status = 'sent'
                                           and (p_location_id is null or location_id = p_location_id)), 0),
    'invoices_overdue_amount', coalesce((select sum(coalesce(total_amount,0)) from public.invoices
                                         where business_id = p_business_id and status = 'overdue'
                                           and (p_location_id is null or location_id = p_location_id)), 0),
    'clients_total',    (select count(*) from public.clients c
                         where c.business_id = p_business_id
                           and (p_location_id is null
                                or exists (select 1 from public.client_locations cl
                                           where cl.client_id = c.id and cl.location_id = p_location_id)
                                or not exists (select 1 from public.client_locations cl
                                               where cl.client_id = c.id))),
    'clocked_in_now',   (select count(*) from public.timesheets ts
                         where ts.business_id = p_business_id and ts.clock_out is null
                           and (p_location_id is null
                                or exists (select 1 from public.employee_locations el
                                           where el.employee_id = ts.employee_id
                                             and el.location_id = p_location_id))),
    'jobs_active',      (select count(*) from public.jobs
                         where business_id = p_business_id and status in ('scheduled','in_progress')
                           and (p_location_id is null or location_id = p_location_id)),
    'jobs_scheduled',   (select count(*) from public.jobs
                         where business_id = p_business_id and status = 'scheduled'
                           and (p_location_id is null or location_id = p_location_id)),
    'jobs_in_progress', (select count(*) from public.jobs
                         where business_id = p_business_id and status = 'in_progress'
                           and (p_location_id is null or location_id = p_location_id)),
    'jobs_today',       (select count(*) from public.jobs
                         where business_id = p_business_id
                           and status in ('scheduled','in_progress')
                           and scheduled_date = (now() at time zone p_tz)::date
                           and (p_location_id is null or location_id = p_location_id))
  );
$$;

comment on function public.dashboard_stats(uuid, timestamptz, timestamptz, text, uuid) is
  'Dashboard home metrics in one round trip, optionally scoped to one branch. '
  'Superset of the 225 version: adds p_location_id.';

create or replace function public.dashboard_top_clients(
  p_business_id uuid,
  p_start timestamptz,
  p_limit int default 8,
  p_location_id uuid default null
) returns table (
  client_id uuid,
  first_name text,
  last_name text,
  company text,
  total numeric,
  invoice_count bigint
)
language sql stable security invoker set search_path = public as $$
  select
    c.id,
    c.first_name,
    c.last_name,
    c.company,
    coalesce(sum(i.total_amount), 0) as total,
    count(i.id) as invoice_count
  from public.invoices i
  join public.clients c on c.id = i.client_id
  where i.business_id = p_business_id
    and i.status = 'paid'
    and i.paid_at >= p_start
    -- Scoped by the INVOICE's branch, not the client's: the question is which
    -- clients this branch earned from, and a shared client can bill work at
    -- several branches.
    and (p_location_id is null or i.location_id = p_location_id)
  group by c.id, c.first_name, c.last_name, c.company
  having coalesce(sum(i.total_amount), 0) > 0
  order by total desc
  limit greatest(p_limit, 0);
$$;

comment on function public.dashboard_top_clients(uuid, timestamptz, int, uuid) is
  'Highest-revenue clients since p_start, by PAID invoice total, optionally '
  'scoped to one branch.';
