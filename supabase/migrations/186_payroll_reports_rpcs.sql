-- 186_payroll_reports_rpcs.sql
-- Nómina + Reports stop downloading whole tables.
--
-- Design principle (see also 185): SQL returns per-employee AGGREGATED INPUTS
-- and report-wide sums; the TypeScript pay phase (overtime, daily ceil,
-- salary, driver modes, custom formulas — computePayrollRows) runs unchanged
-- on top. Payloads become O(#employees) instead of O(#jobs+#timesheets).
--
-- All functions are SECURITY INVOKER — they see exactly what the caller's RLS
-- allows, same as the queries they replace. Period/range bounds are computed
-- client-side (device-local getPayrollPeriod / report ranges) and passed in.
--
-- Hour-attribution semantics mirror shared/src/lib/payroll.ts exactly:
--   * jobs count by scheduled_date within [start, end]
--   * jobs.total_hours credited IN FULL to every DISTINCT assigned crew member
--   * jobs.driver_hours credited IN FULL to every DISTINCT driver id
--   * timesheets with employee_id IS NULL contribute nothing
--   * formula job-custom-field values collected per contributing job over the
--     crew ∪ drivers union, DISTINCT per job, regardless of hours
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ─── 1. payroll_period_inputs — per-employee aggregated hour inputs ─────────

create or replace function public.payroll_period_inputs(
  p_business_id uuid,
  p_start date,
  p_end date,
  p_jcf_keys text[] default null   -- job custom-field keys a pay formula reads
) returns table(
  employee_id uuid,
  first_name text,
  last_name text,
  pay_rate numeric,
  pay_type text,
  active boolean,
  overtime_eligible boolean,
  overtime_threshold numeric,
  overtime_multiplier numeric,
  custom_fields jsonb,
  worked_hours double precision,   -- timesheets + Σ distinct-crew job hours
  driven_hours double precision,
  jobs_driven integer,
  jcf_raw jsonb,                   -- { "<field_key>": [raw values per job] }
  breakdown jsonb                  -- employeeBreakdownInRange shape
) language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.employee_id as id, sum(coalesce(t.hours_worked, 0))::double precision as h
    from public.timesheets t
    where t.business_id = p_business_id and t.employee_id is not null
      and t.work_date >= p_start and t.work_date <= p_end
    group by t.employee_id
  ),
  jobs_in as (
    select j.id, j.title, j.scheduled_date,
           coalesce(j.total_hours, 0) as th, coalesce(j.driver_hours, 0) as dh,
           j.driver_employee_ids, j.custom_fields
    from public.jobs j
    where j.business_id = p_business_id
      and j.scheduled_date >= p_start and j.scheduled_date <= p_end
  ),
  crew as (  -- DISTINCT: duplicate assignment rows credit hours ONCE per job
    select distinct j.id as job_id, ja.employee_id as id, j.th, j.title, j.scheduled_date
    from jobs_in j
    join public.job_assignments ja on ja.job_id = j.id
    where ja.employee_id is not null and j.th <> 0
  ),
  drv as (
    select distinct j.id as job_id, d.id, j.dh, j.title, j.scheduled_date
    from jobs_in j
    cross join lateral unnest(j.driver_employee_ids) as d(id)
    where j.dh <> 0
  ),
  crew_sum as (select c.id, sum(c.th)::double precision as h from crew c group by c.id),
  drv_sum  as (select d.id, sum(d.dh)::double precision as h, count(*)::int as n from drv d group by d.id),
  contrib as (  -- per-(employee, job) worked/driven split → breakdown rows
    select coalesce(c.id, d.id) as emp,
           coalesce(c.job_id, d.job_id) as job_id,
           coalesce(c.title, d.title) as title,
           coalesce(c.scheduled_date, d.scheduled_date) as sd,
           coalesce(c.th, 0) as worked,
           coalesce(d.dh, 0) as driven
    from crew c
    full outer join drv d on d.id = c.id and d.job_id = c.job_id
  ),
  breakdown_jobs as (
    select emp,
           jsonb_agg(jsonb_build_object(
             'jobId', job_id, 'title', title, 'date', sd,
             'workedHours', round(worked::numeric, 2),
             'drivenHours', round(driven::numeric, 2)
           ) order by coalesce(sd::text, '')) as js,
           sum(worked)::double precision as wh,
           sum(driven)::double precision as dvh
    from contrib
    group by emp
  ),
  jcf_people as (  -- crew ∪ drivers per job, distinct — regardless of hours
    select distinct j.id as job_id, x.id as emp, j.custom_fields
    from jobs_in j
    cross join lateral (
      select ja.employee_id as id from public.job_assignments ja
      where ja.job_id = j.id and ja.employee_id is not null
      union
      select d.id from unnest(j.driver_employee_ids) as d(id)
    ) x
    where p_jcf_keys is not null and j.custom_fields is not null
  ),
  jcf as (
    select emp, jsonb_object_agg(k, vals) as raw
    from (
      select p.emp, kk.k, jsonb_agg(p.custom_fields -> kk.k) as vals
      from jcf_people p
      cross join unnest(p_jcf_keys) as kk(k)
      where p.custom_fields ? kk.k
      group by p.emp, kk.k
    ) t
    group by emp
  )
  select e.id, e.first_name, e.last_name, e.pay_rate, e.pay_type,
         e.active, coalesce(e.overtime_eligible, false),
         e.overtime_threshold, e.overtime_multiplier, e.custom_fields,
         coalesce(t.h, 0) + coalesce(cs.h, 0) as worked_hours,
         coalesce(ds.h, 0) as driven_hours,
         coalesce(ds.n, 0) as jobs_driven,
         jcf.raw as jcf_raw,
         jsonb_build_object(
           'jobs', coalesce(bj.js, '[]'::jsonb),
           'loggedHours', round(coalesce(t.h, 0)::numeric, 2),
           'workedHours', round(coalesce(bj.wh, 0)::numeric, 2),
           'drivenHours', round(coalesce(bj.dvh, 0)::numeric, 2),
           'totalHours', round((coalesce(bj.wh, 0) + coalesce(bj.dvh, 0) + coalesce(t.h, 0))::numeric, 2)
         ) as breakdown
  from public.employees e
  left join ts t on t.id = e.id
  left join crew_sum cs on cs.id = e.id
  left join drv_sum ds on ds.id = e.id
  left join breakdown_jobs bj on bj.emp = e.id
  left join jcf on jcf.emp = e.id
  where e.business_id = p_business_id;
$$;

-- ─── 2. payroll_period_ledger — payments + loan balances/recent entries ─────

create or replace function public.payroll_period_ledger(
  p_business_id uuid,
  p_start date,
  p_end date
) returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    -- Period OVERLAP match (anchor changes must not orphan paid checks).
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'employee_id', p.employee_id, 'method', p.method,
        'check_number', p.check_number, 'bonus', p.bonus, 'gross_pay', p.gross_pay,
        'hours', p.hours, 'created_at', p.created_at, 'components', p.components
      ) order by p.created_at)
      from public.payroll_payments p
      where p.business_id = p_business_id
        and p.period_start <= p_end and p.period_end >= p_start
    ), '[]'::jsonb),
    -- Complete balances over the WHOLE ledger (never download it in full).
    'loan_balances', coalesce((
      select jsonb_object_agg(b.employee_id::text, b.bal)
      from (
        select l.employee_id, sum(coalesce(l.amount, 0)) as bal
        from public.employee_loans l
        where l.business_id = p_business_id and l.employee_id is not null
        group by l.employee_id
      ) b
    ), '{}'::jsonb),
    -- Recent entries per worker for the ledger overlay (newest 50 each — the
    -- balance above is always complete regardless).
    'loan_entries', coalesce((
      select jsonb_object_agg(t.emp::text, t.entries)
      from (
        select x.employee_id as emp,
               jsonb_agg(jsonb_build_object(
                 'id', x.id, 'amount', coalesce(x.amount, 0), 'note', x.note,
                 'entryDate', coalesce(x.entry_date::text, '')
               ) order by x.entry_date desc nulls last, x.id desc) as entries
        from (
          select l.*, row_number() over (
            partition by l.employee_id
            order by l.entry_date desc nulls last, l.id desc
          ) as rn
          from public.employee_loans l
          where l.business_id = p_business_id and l.employee_id is not null
        ) x
        where x.rn <= 50
        group by x.employee_id
      ) t
    ), '{}'::jsonb)
  );
$$;

-- ─── 3. employee_hours_breakdown — one worker, arbitrary bounds ─────────────
-- Serves past-period manual-payment snapshots + payment-history explanations.

create or replace function public.employee_hours_breakdown(
  p_business_id uuid,
  p_employee_id uuid,
  p_start date,
  p_end date
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with logged as (
    select coalesce(sum(coalesce(t.hours_worked, 0)), 0)::double precision as h
    from public.timesheets t
    where t.business_id = p_business_id and t.employee_id = p_employee_id
      and t.work_date >= p_start and t.work_date <= p_end
  ),
  contrib as (
    select j.id as job_id, j.title, j.scheduled_date as sd,
           case when exists (
             select 1 from public.job_assignments ja
             where ja.job_id = j.id and ja.employee_id = p_employee_id
           ) and coalesce(j.total_hours, 0) <> 0 then coalesce(j.total_hours, 0) else 0 end as worked,
           case when p_employee_id = any(coalesce(j.driver_employee_ids, '{}'))
                 and coalesce(j.driver_hours, 0) <> 0 then coalesce(j.driver_hours, 0) else 0 end as driven
    from public.jobs j
    where j.business_id = p_business_id
      and j.scheduled_date >= p_start and j.scheduled_date <= p_end
  ),
  hits as (select * from contrib where worked <> 0 or driven <> 0)
  select jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'jobId', h.job_id, 'title', h.title, 'date', h.sd,
        'workedHours', round(h.worked::numeric, 2),
        'drivenHours', round(h.driven::numeric, 2)
      ) order by coalesce(h.sd::text, '')) from hits h
    ), '[]'::jsonb),
    'loggedHours', round((select h from logged)::numeric, 2),
    'workedHours', round(coalesce((select sum(worked) from hits), 0)::numeric, 2),
    'drivenHours', round(coalesce((select sum(driven) from hits), 0)::numeric, 2),
    'totalHours', round((coalesce((select sum(worked + driven) from hits), 0) + (select h from logged))::numeric, 2)
  );
$$;

-- ─── 4. reports_overview — every non-payroll reports metric in one call ─────
-- Mirrors shared/src/lib/reports.ts computeReports:
--   invoices filtered by coalesce(issue_date, created_at); jobs/clients by
--   created_at; monthly buckets keyed 'YYYY-MM' (labels stay client-side);
--   avgJobValue 3-tier fallback; byLocation revenue from completed/invoiced
--   jobs; inventory lowStock keeps the historical qty<=5 rule.
-- The payroll section of Reports reuses payroll_period_inputs + the client
-- pay engine (per-worker hours/pay incl. job + driver credits).

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
    'byLocation', coalesce((
      select jsonb_agg(jsonb_build_object('locationId', s.location_id, 'jobCount', s.n, 'revenue', s.rev))
      from (select location_id, count(*) as n,
                   sum(case when status in ('completed','invoiced') then total_amount else 0 end) as rev
            from jb group by location_id) s
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
