-- 207 — Reports: per-location revenue falls back to invoice line items
--
-- Symptom: Reportes → "Por ubicación" showed the right job counts (556 / 257)
-- next to $0.00 for every branch.
--
-- Cause: the breakdown summed jobs.total_amount only. This business prices on
-- the invoice, not the job, so every jobs row carries 0 — the same situation
-- avgJobValue already handles with its tier-2 fallback (invoice line_items
-- summed per job_id). The location assignment was never the problem.
--
-- Fix: reuse the existing per_job_rev CTE for jobs with no amount of their
-- own. Nothing else in reports_overview changes; this is a create-or-replace
-- of the whole function because Postgres has no partial-body replace.
--
-- Idempotent: safe to run more than once.

create or replace function public.reports_overview(
  p_business_id uuid,
  p_from timestamptz,               -- null = no lower bound ('all')
  p_to timestamptz,
  p_bucket_start date,              -- first month bucket (client-computed)
  p_bucket_months int,              -- 1..24 (client-computed)
  p_tz text default 'UTC',
  p_include_inventory boolean default false
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with inv as (
    select i.id, i.status, coalesce(i.total_amount, 0) as total_amount, i.line_items,
           coalesce(i.issue_date::timestamptz, i.created_at) as eff_date,
           coalesce(i.issue_date::timestamptz, i.paid_at, i.created_at) as bucket_date
    from public.invoices i
    where i.business_id = p_business_id
      and (p_from is null or coalesce(i.issue_date::timestamptz, i.created_at) >= p_from)
      and coalesce(i.issue_date::timestamptz, i.created_at) <= p_to
  ),
  jb as (
    select j.id, j.status, coalesce(j.total_amount, 0) as total_amount,
           j.location_id, j.created_at
    from public.jobs j
    where j.business_id = p_business_id
      and (p_from is null or j.created_at >= p_from)
      and j.created_at <= p_to
  ),
  per_job_rev as (  -- invoice line_items summed per job_id (tier-2 avg source)
    -- Coercions mirror the client's Number(qty ?? 1) || 0 semantics: missing/
    -- null qty → 1, non-numeric → 0; missing rate → 0, non-numeric → 0.
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
    -- Per-branch revenue now uses the SAME best-available per-job amount as
    -- avgJobValue: the job's own total_amount when it has one, otherwise the
    -- invoice line items tagged with that job_id (per_job_rev). Businesses
    -- that price on the invoice rather than the job left every job at 0, so
    -- this block reported $0.00 for every branch even with hundreds of
    -- completed jobs. Job counts were never affected.
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
                where business_id = p_business_id), 0) else 0 end,
    'inventoryItemsCount', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id) else 0 end,
    'lowStock', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and coalesce(quantity,0) <= 5) else 0 end,
    'outOfStock', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and coalesce(quantity,0) = 0) else 0 end
  );
$$;
