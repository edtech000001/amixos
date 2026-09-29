-- 225 — Job status breakdown on the dashboard stats
--
-- dashboard_stats returns one number for active jobs (scheduled + in progress
-- combined). At a glance that can't distinguish "twelve crews are out right
-- now" from "twelve jobs are booked for next month", which are different days.
--
-- Counted here rather than derived from the upcoming-jobs list the dashboard
-- already loads: that list is capped at 8 rows and only covers future dates,
-- so any count taken from it would undercount silently — and a job in progress
-- whose scheduled date has passed isn't in it at all.
--
-- Replaces the function from 223; every existing key is unchanged, so an app
-- running the older bundle keeps working and simply ignores the new ones.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

create or replace function public.dashboard_stats(
  p_business_id uuid,
  p_start_month timestamptz,
  p_start_year timestamptz,
  p_tz text default 'UTC'
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with paid as (
    select total_amount, paid_at
    from public.invoices
    where business_id = p_business_id and status = 'paid' and paid_at >= p_start_year
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
                         where business_id = p_business_id and status = 'sent'),
    'invoices_overdue', (select count(*) from public.invoices
                         where business_id = p_business_id and status = 'overdue'),
    'invoices_pending_amount', coalesce((select sum(coalesce(total_amount,0)) from public.invoices
                                         where business_id = p_business_id and status = 'sent'), 0),
    'invoices_overdue_amount', coalesce((select sum(coalesce(total_amount,0)) from public.invoices
                                         where business_id = p_business_id and status = 'overdue'), 0),
    'clients_total',    (select count(*) from public.clients
                         where business_id = p_business_id),
    'clocked_in_now',   (select count(*) from public.timesheets
                         where business_id = p_business_id and clock_out is null),
    'jobs_active',      (select count(*) from public.jobs
                         where business_id = p_business_id and status in ('scheduled','in_progress')),
    -- NEW: the split behind that total, plus what is happening today.
    'jobs_scheduled',   (select count(*) from public.jobs
                         where business_id = p_business_id and status = 'scheduled'),
    'jobs_in_progress', (select count(*) from public.jobs
                         where business_id = p_business_id and status = 'in_progress'),
    -- "Today" in the VIEWER's timezone, not the server's: scheduled_date is a
    -- plain date, so comparing it against a UTC now() puts the business a day
    -- out for most of the US evening.
    'jobs_today',       (select count(*) from public.jobs
                         where business_id = p_business_id
                           and status in ('scheduled','in_progress')
                           and scheduled_date = (now() at time zone p_tz)::date)
  );
$$;

comment on function public.dashboard_stats(uuid, timestamptz, timestamptz, text) is
  'Dashboard home metrics in one round trip. Superset of the 223 version: adds '
  'jobs_scheduled / jobs_in_progress / jobs_today.';
