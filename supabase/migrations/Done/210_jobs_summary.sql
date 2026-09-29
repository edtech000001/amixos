-- 210_jobs_summary.sql
-- =============================================================================
-- Summary totals for the CURRENT jobs-list filter set.
--
-- Leads file one job per day on multi-day work, so answering "what did the
-- Grain Bin work cost in August" means opening jobs one at a time. This RPC
-- totals the whole filtered set in one call.
--
-- Why server-side: the jobs list is keyset-paged (fetchJobsPage). Summing the
-- loaded rows would report on one page and under-count silently as soon as the
-- filter matches more than a page — the exact trap CLAUDE.md's pagination rule
-- describes.
--
-- Filter arguments mirror jobs_page_ids / job_group_index EXACTLY (same tab,
-- search, location and date semantics) so the summary always describes the set
-- on screen. Search includes custom_fields_text — see migration 209.
--
-- PAY MATH LIVES IN THE CLIENT. This returns hours only, in the same per-
-- employee shape as payroll_period_inputs (186/188/189). The caller feeds it to
-- computePayrollRowsFromAggregates() in shared/lib/payroll.ts, so pay rates,
-- overtime, driver mode and custom formulas stay in ONE place and the summary
-- can never drift from Payroll and Reports. Do not reimplement pay here.
--
-- TIMESHEETS ARE DELIBERATELY EXCLUDED. payroll_period_inputs adds timesheet
-- hours because a pay period covers all work in a window. A jobs-list filter is
-- a set of JOBS — clocked hours aren't attributable to it, and folding them in
-- would inflate a filtered total with work from jobs the filter excluded.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Requires migration 209
-- (custom_fields_text). Idempotent / safe to re-run.
-- =============================================================================

create or replace function public.jobs_summary(
  p_business_id uuid,
  p_status_include text[] default null,    -- statuses to include (null = all)
  p_exclude_closed boolean default false,  -- default view hides invoiced/cancelled
  p_archived text default 'exclude',       -- 'exclude' | 'only' | 'any'
  p_search_term text default null,
  p_client_ids uuid[] default null,        -- search: client ids whose name matched
  p_crew_job_ids uuid[] default null,      -- search: job ids whose crew/lead matched
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_jcf_keys text[] default null           -- job custom-field keys a pay formula reads
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with jobs_in as (
    select j.id, j.status,
           coalesce(j.total_amount, 0)::double precision as amount,
           coalesce(j.total_hours, 0)  as th,
           coalesce(j.driver_hours, 0) as dh,
           j.driver_employee_ids, j.custom_fields
    from public.jobs j
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
      and (p_status_include is null or j.status = any(p_status_include))
      and (not p_exclude_closed or j.status not in ('invoiced', 'cancelled'))
      and (p_archived = 'any'
           or (p_archived = 'exclude' and j.archived_at is null)
           or (p_archived = 'only'    and j.archived_at is not null))
      and (p_date_from is null or j.scheduled_date >= p_date_from)
      and (p_date_to   is null or j.scheduled_date <= p_date_to)
      and (
        p_search_term is null
        or j.title              ilike '%' || p_search_term || '%'
        or j.external_ref       ilike '%' || p_search_term || '%'
        or j.estimate_number    ilike '%' || p_search_term || '%'
        or j.job_city           ilike '%' || p_search_term || '%'
        or j.job_state          ilike '%' || p_search_term || '%'
        or j.custom_fields_text ilike '%' || p_search_term || '%'
        or (p_client_ids   is not null and j.client_id = any(p_client_ids))
        or (p_crew_job_ids is not null and j.id        = any(p_crew_job_ids))
      )
  ),
  -- ── Scalars ──────────────────────────────────────────────────────────────
  scalars as (
    select count(*)::bigint                as job_count,
           coalesce(sum(amount), 0)        as total_amount,
           coalesce(sum(th), 0)            as total_hours,
           coalesce(sum(dh), 0)            as total_driver_hours
    from jobs_in
  ),
  by_status as (
    select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) as js
    from (select status, count(*)::bigint as cnt from jobs_in group by status) s
  ),
  -- ── Per-employee hours (mirrors payroll_period_inputs, minus timesheets) ──
  crew as (  -- DISTINCT: a duplicated assignment row credits the job ONCE.
             -- crew = false is a lead-only row and credits nothing (mig. 189).
    select distinct j.id as job_id, ja.employee_id as id, j.th
    from jobs_in j
    join public.job_assignments ja on ja.job_id = j.id
    where ja.employee_id is not null and coalesce(ja.crew, true) and j.th <> 0
  ),
  drv as (
    select distinct j.id as job_id, d.id, j.dh
    from jobs_in j
    cross join lateral unnest(j.driver_employee_ids) as d(id)
    where j.dh <> 0
  ),
  crew_sum as (select c.id, sum(c.th)::double precision as h from crew c group by c.id),
  drv_sum  as (select d.id, sum(d.dh)::double precision as h, count(*)::int as n from drv d group by d.id),
  jcf_people as (  -- crew ∪ drivers per job, distinct — regardless of hours.
    select distinct j.id as job_id, x.id as emp, j.custom_fields
    from jobs_in j
    cross join lateral (
      select ja.employee_id as id from public.job_assignments ja
      where ja.job_id = j.id and ja.employee_id is not null and coalesce(ja.crew, true)
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
  ),
  employees_agg as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'employee_id',         e.id,
             'first_name',          e.first_name,
             'last_name',           e.last_name,
             'pay_rate',            e.pay_rate,
             'pay_type',            e.pay_type,
             'overtime_eligible',   coalesce(e.overtime_eligible, false),
             'overtime_threshold',  e.overtime_threshold,
             'overtime_multiplier', e.overtime_multiplier,
             'custom_fields',       e.custom_fields,
             'worked_hours',        coalesce(cs.h, 0),
             'driven_hours',        coalesce(ds.h, 0),
             'jobs_driven',         coalesce(ds.n, 0),
             'jcf_raw',             jcf.raw
           )), '[]'::jsonb) as js
    from public.employees e
    left join crew_sum cs on cs.id = e.id
    left join drv_sum  ds on ds.id = e.id
    left join jcf         on jcf.emp = e.id
    -- Only people who actually contributed to THIS set. includeZero=false on
    -- the client too, but filtering here keeps the payload small.
    where e.business_id = p_business_id
      and (cs.h is not null or ds.h is not null)
  )
  select jsonb_build_object(
    'jobCount',         s.job_count,
    'totalAmount',      s.total_amount,
    'totalHours',       s.total_hours,
    'totalDriverHours', s.total_driver_hours,
    'byStatus',         b.js,
    'employees',        ea.js
  )
  from scalars s cross join by_status b cross join employees_agg ea;
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Unfiltered totals for a business:
--      select public.jobs_summary('<business-uuid>');
-- 2. jobCount must equal the 'all' tab from job_tab_counts under the same args:
--      select * from public.job_tab_counts('<business-uuid>');
-- 3. Date-scoped, and cross-check hours against team_hour_totals for the same
--    window (team_hour_totals ALSO counts timesheets, so its number is >= this
--    one — they match only when nobody logged standalone timesheet hours):
--      select public.jobs_summary('<business-uuid>', null, false, 'exclude',
--        null, null, null, null, current_date - 30, current_date);
-- 4. Custom-field search reaches it (needs migration 209):
--      select public.jobs_summary('<business-uuid>', null, false, 'exclude',
--        'Grain Bin');
