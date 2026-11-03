-- 265_report_dates_local_tz.sql
-- Audit fix: report + invoice-badge dates used UTC.
--   * reports_overview cast issue_date (a DATE) to timestamptz = UTC midnight,
--     then bucketed it in p_tz: in Chicago an Oct 1 invoice landed in September
--     and fell outside an October range. issue_date is now local midnight in p_tz.
--   * invoice_tab_counts used current_date / paid_at::date (UTC): after ~5-7pm
--     in the US "due soon" dropped today's invoices and the paid-date filter
--     counted evening payments on the next day. New p_tz argument (the apps send
--     the device time zone); default 'UTC' keeps the old behavior.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.reports_overview(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_start date,
  p_bucket_months int,
  p_tz text default 'UTC',
  p_include_inventory boolean default false,
  p_location_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with inv as (
    -- Own share only: lines billed for another business (240) are excluded.
    select i.id, i.status,
           coalesce(i.total_amount, 0) - coalesce(i.passthrough_amount, 0) as total_amount,
           i.line_items,
           coalesce((i.issue_date::timestamp at time zone p_tz), i.created_at) as eff_date,
           coalesce((i.issue_date::timestamp at time zone p_tz), i.paid_at, i.created_at) as bucket_date
    from public.invoices i
    where i.business_id = p_business_id
      and (p_from is null or coalesce((i.issue_date::timestamp at time zone p_tz), i.created_at) >= p_from)
      and coalesce((i.issue_date::timestamp at time zone p_tz), i.created_at) <= p_to
      and (p_location_id is null or i.location_id = p_location_id)
  ),
  jb as (
    select j.id, j.status, coalesce(j.total_amount, 0) as total_amount,
           j.location_id, j.created_at
    from public.jobs j
    where j.business_id = p_business_id
      and (p_from is null or j.created_at >= p_from)
      and j.created_at <= p_to
      and (p_location_id is null or j.location_id = p_location_id)
  ),
  per_job_rev as (
    select li ->> 'job_id' as job_id,
           sum(
             (case when li ->> 'qty' is null then 1
                   when li ->> 'qty' ~ '^-?[0-9]+(\.[0-9]+)?$' then (li ->> 'qty')::double precision
                   else 0 end)
             * (case when li ->> 'rate' ~ '^-?[0-9]+(\.[0-9]+)?$' then (li ->> 'rate')::double precision
                     else 0 end)
           ) as amt
    from inv, jsonb_array_elements(coalesce(inv.line_items, '[]'::jsonb)) as li
    where li ->> 'job_id' is not null
    group by 1
  ),
  buckets as (
    select gs.i,
           to_char(p_bucket_start + (gs.i || ' months')::interval, 'YYYY-MM') as ym,
           date_trunc('month', (p_bucket_start + (gs.i || ' months')::interval))::date as m_start
    from generate_series(0, greatest(p_bucket_months, 1) - 1) as gs(i)
  ),
  monthly as (
    select b.ym,
           coalesce((select sum(total_amount) from inv
                     where inv.status = 'paid'
                       and to_char(inv.bucket_date at time zone p_tz, 'YYYY-MM') = b.ym), 0) as revenue,
           coalesce((select count(*) from jb
                     where to_char(jb.created_at at time zone p_tz, 'YYYY-MM') = b.ym), 0) as jobs
    from buckets b
    order by b.i
  ),
  completed as (select * from jb where status in ('completed', 'invoiced'))
  select jsonb_build_object(
    'totalRevenue',    coalesce((select sum(total_amount) from inv where status = 'paid'), 0),
    'pendingRevenue',  coalesce((select sum(total_amount) from inv where status = 'sent'), 0),
    'overdueRevenue',  coalesce((select sum(total_amount) from inv where status = 'overdue'), 0),
    'paidInvoicesCount', (select count(*) from inv where status = 'paid'),
    'invoicesTotal',     (select count(*) from inv),
    'invoicesSum',       coalesce((select sum(total_amount) from inv), 0),
    'completedJobsCount', (select count(*) from completed),
    'jobsTotal',          (select count(*) from jb),
    'pricedJobsSum',   coalesce((select sum(total_amount) from completed where total_amount > 0), 0),
    'pricedJobsCount', (select count(*) from completed where total_amount > 0),
    'perJobSum',       coalesce((select sum(amt) from per_job_rev), 0),
    'perJobCount',     (select count(*) from per_job_rev),
    'invoiceStatus', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n))
      from (select status, count(*) as n from inv group by status) s
    ), '[]'::jsonb),
    'jobStatus', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'value', s.n))
      from (select status, count(*) as n from jb
            where status in ('scheduled','in_progress','completed','invoiced','cancelled')
            group by status) s
    ), '[]'::jsonb),
    'monthlyRevenue', coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'revenue', revenue, 'jobs', jobs)) from monthly), '[]'::jsonb),
    'byLocation', coalesce((
      select jsonb_agg(jsonb_build_object('locationId', s.location_id, 'jobCount', s.n, 'revenue', s.rev))
      from (select jb.location_id, count(*) as n,
                   sum(case when jb.status in ('completed','invoiced')
                            then case when jb.total_amount > 0 then jb.total_amount
                                      else coalesce(pjr.amt, 0) end
                            else 0 end) as rev
            from jb left join per_job_rev pjr on pjr.job_id = jb.id::text
            group by jb.location_id) s
    ), '[]'::jsonb),
    'newClientsCount', (select count(*) from public.clients c
                        where c.business_id = p_business_id
                          and (p_from is null or c.created_at >= p_from) and c.created_at <= p_to),
    'totalClientsCount', (select count(*) from public.clients c where c.business_id = p_business_id),
    'inventoryValue', case when p_include_inventory then
      coalesce((select sum(coalesce(quantity,0) * coalesce(unit_cost,0)) from public.inventory_items
                where business_id = p_business_id and (p_location_id is null or location_id = p_location_id)), 0) else 0 end,
    'inventoryItemsCount', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and (p_location_id is null or location_id = p_location_id)) else 0 end,
    'lowStock', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and coalesce(quantity,0) <= 5 and (p_location_id is null or location_id = p_location_id)) else 0 end,
    'outOfStock', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and coalesce(quantity,0) = 0 and (p_location_id is null or location_id = p_location_id)) else 0 end
  );
$$;

-- The old 10-argument signature must go, or PostgREST can't choose between the two.
drop function if exists public.invoice_tab_counts(uuid, uuid, date, date, text, numeric, uuid[], uuid[], text, text[]);

create or replace function public.invoice_tab_counts(
  p_business_id uuid,
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_search_term text default null,
  p_search_amount numeric default null,
  p_client_ids uuid[] default null,
  p_invoice_ids uuid[] default null,
  p_date_field text default 'issue',
  p_quick text[] default null,
  p_tz text default 'UTC'
) returns table(tab text, cnt bigint)
language sql stable security invoker set search_path = public as $func$
  with base as (
    select i.status
    from public.invoices i
    where i.business_id = p_business_id
      and (p_location_id is null or i.location_id = p_location_id)
      and (p_date_from is null or (case p_date_field
             when 'due'  then i.due_date
             when 'paid' then (i.paid_at at time zone p_tz)::date
             else i.issue_date end) >= p_date_from)
      and (p_date_to is null or (case p_date_field
             when 'due'  then i.due_date
             when 'paid' then (i.paid_at at time zone p_tz)::date
             else i.issue_date end) <= p_date_to)
      and (
        p_search_term is null
        or i.invoice_number ilike '%' || p_search_term || '%'
        or i.custom_fields_text ilike '%' || p_search_term || '%'
        or (p_search_amount is not null and i.total_amount = p_search_amount)
        or (p_client_ids  is not null and i.client_id = any(p_client_ids))
        or (p_invoice_ids is not null and i.id        = any(p_invoice_ids))
      )
      and (p_quick is null or (
            (not ('recent_paid' = any(p_quick)) or (i.status = 'paid' and i.paid_at >= now() - interval '30 days'))
        and (not ('recent_updated' = any(p_quick)) or i.updated_at >= now() - interval '7 days')
        and (not ('reminded' = any(p_quick)) or coalesce(i.reminder_count, 0) > 0)
        and (not ('not_reminded' = any(p_quick)) or (coalesce(i.reminder_count, 0) = 0 and i.status in ('sent','overdue')))
        and (not ('due_soon' = any(p_quick)) or (i.status in ('draft','sent','overdue') and i.due_date between (now() at time zone p_tz)::date and (now() at time zone p_tz)::date + 7))
        and (not ('partial' = any(p_quick)) or (i.status <> 'paid' and coalesce(i.amount_paid, 0) > 0))
        and (not ('collect' = any(p_quick)) or (i.collect_from_partner and i.status not in ('paid','cancelled')))
      ))
  ), agg as (
    select
      count(*)                                        as all_cnt,
      count(*) filter (where status = 'draft')        as draft_cnt,
      count(*) filter (where status = 'sent')         as sent_cnt,
      count(*) filter (where status = 'paid')         as paid_cnt,
      count(*) filter (where status = 'overdue')      as overdue_cnt,
      count(*) filter (where status = 'total_loss')   as total_loss_cnt
    from base
  )
  select t.tab, t.cnt from agg cross join lateral (values
    ('all', all_cnt), ('draft', draft_cnt), ('sent', sent_cnt),
    ('paid', paid_cnt), ('overdue', overdue_cnt), ('total_loss', total_loss_cnt)
  ) t(tab, cnt);
$func$;

revoke all on function public.invoice_tab_counts(uuid, uuid, date, date, text, numeric, uuid[], uuid[], text, text[], text) from public, anon;
grant execute on function public.invoice_tab_counts(uuid, uuid, date, date, text, numeric, uuid[], uuid[], text, text[], text) to authenticated, service_role;
