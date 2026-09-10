-- 223 — Pending / overdue AMOUNTS on the dashboard stats
--
-- dashboard_stats already returns how MANY invoices are pending and overdue.
-- The counts alone don't say much: seven pending invoices could be $700 or
-- $70,000, and it's the money that decides whether anyone should chase them.
--
-- Computed here rather than client-side for the reason the whole RPC exists:
-- summing on the client means downloading every pending invoice, which
-- PostgREST caps at 1000 rows — so the figure would silently go wrong for
-- exactly the businesses big enough to care about it.
--
-- Replaces the function from 181; every existing key is unchanged, so an app
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
    -- NEW: the money behind those two counts.
    'invoices_pending_amount', coalesce((select sum(coalesce(total_amount,0)) from public.invoices
                                         where business_id = p_business_id and status = 'sent'), 0),
    'invoices_overdue_amount', coalesce((select sum(coalesce(total_amount,0)) from public.invoices
                                         where business_id = p_business_id and status = 'overdue'), 0),
    'clients_total',    (select count(*) from public.clients
                         where business_id = p_business_id),
    'clocked_in_now',   (select count(*) from public.timesheets
                         where business_id = p_business_id and clock_out is null),
    'jobs_active',      (select count(*) from public.jobs
                         where business_id = p_business_id and status in ('scheduled','in_progress'))
  );
$$;

comment on function public.dashboard_stats(uuid, timestamptz, timestamptz, text) is
  'Dashboard home metrics in one round trip. Superset of the 181 version: adds '
  'invoices_pending_amount / invoices_overdue_amount.';
