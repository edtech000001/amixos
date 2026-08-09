-- 188_payroll_breakdown_lead.sql
-- Payroll hours-breakdown job rows now carry the job's LEAD name ('lead' key)
-- so the sheet can show who ran/entered each job. Replaces the two RPCs from
-- 186 with the lead threaded through — signatures unchanged, callers without
-- the app update simply ignore the extra key.
--
-- Lead resolution mirrors jobs_page_ids' lead sort: the is_lead assignment's
-- employee name, else its worker_name (manual crews). employees join runs
-- under the caller's RLS (SECURITY INVOKER) — payroll callers read employees
-- already; if a policy hides a row the lead just comes out null.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ─── 1. payroll_period_inputs ───────────────────────────────────────────────
-- DROP first: the live function's OUT-parameter row type can differ from this
-- definition (42P13 'cannot change return type'), and create-or-replace can't
-- cross that. PostgREST re-resolves on next call, so the gap is harmless.

drop function if exists public.payroll_period_inputs(uuid, date, date, text[]);

create function public.payroll_period_inputs(
  p_business_id uuid,
  p_start date,
  p_end date,
  p_jcf_keys text[] default null
) returns table(
  employee_id uuid,
  first_name text,
  last_name text,
  pay_rate double precision,
  pay_type text,
  active boolean,
  overtime_eligible boolean,
  overtime_threshold double precision,
  overtime_multiplier double precision,
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
           j.driver_employee_ids, j.custom_fields,
           lead.name as lead_name
    from public.jobs j
    left join lateral (
      select coalesce(
               nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
               ja.worker_name
             ) as name
      from public.job_assignments ja
      left join public.employees e on e.id = ja.employee_id
      where ja.job_id = j.id and ja.is_lead = true
      limit 1
    ) lead on true
    where j.business_id = p_business_id
      and j.scheduled_date >= p_start and j.scheduled_date <= p_end
  ),
  crew as (  -- DISTINCT: duplicate assignment rows credit hours ONCE per job
    select distinct j.id as job_id, ja.employee_id as id, j.th, j.title, j.scheduled_date, j.lead_name
    from jobs_in j
    join public.job_assignments ja on ja.job_id = j.id
    where ja.employee_id is not null and j.th <> 0
  ),
  drv as (
    select distinct j.id as job_id, d.id, j.dh, j.title, j.scheduled_date, j.lead_name
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
           coalesce(c.lead_name, d.lead_name) as lead_name,
           coalesce(c.th, 0) as worked,
           coalesce(d.dh, 0) as driven
    from crew c
    full outer join drv d on d.id = c.id and d.job_id = c.job_id
  ),
  breakdown_jobs as (
    select emp,
           jsonb_agg(jsonb_build_object(
             'jobId', job_id, 'title', title, 'date', sd, 'lead', lead_name,
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

-- ─── 2. employee_hours_breakdown ────────────────────────────────────────────

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
           lead.name as lead_name,
           case when exists (
             select 1 from public.job_assignments ja
             where ja.job_id = j.id and ja.employee_id = p_employee_id
           ) and coalesce(j.total_hours, 0) <> 0 then coalesce(j.total_hours, 0) else 0 end as worked,
           case when p_employee_id = any(coalesce(j.driver_employee_ids, '{}'))
                 and coalesce(j.driver_hours, 0) <> 0 then coalesce(j.driver_hours, 0) else 0 end as driven
    from public.jobs j
    left join lateral (
      select coalesce(
               nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
               ja.worker_name
             ) as name
      from public.job_assignments ja
      left join public.employees e on e.id = ja.employee_id
      where ja.job_id = j.id and ja.is_lead = true
      limit 1
    ) lead on true
    where j.business_id = p_business_id
      and j.scheduled_date >= p_start and j.scheduled_date <= p_end
  ),
  hits as (select * from contrib where worked <> 0 or driven <> 0)
  select jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'jobId', h.job_id, 'title', h.title, 'date', h.sd, 'lead', h.lead_name,
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

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select breakdown -> 'jobs' -> 0 from public.payroll_period_inputs(
--     '<business-uuid>', '<start>'::date, '<end>'::date) limit 1;
-- Each job object should now include a "lead" key.
