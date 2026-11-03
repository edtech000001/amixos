-- 268_daily_pay_days_worked.sql
-- "Por día" pay now counts DAYS WORKED, not ceil(total hours / 8): 5 days of
-- 4 hours used to pay 3 days, 2 days of 10 hours paid 3. The pay RPCs return
-- each worker's distinct work dates (timesheets + crewed jobs) and driving
-- dates; the client counts days with the same driver-mode rule it uses for
-- hours (shared/src/lib/payroll.ts).
--   * payroll_period_inputs (latest: 189) + worked_dates / driven_dates columns.
--     Return type changes → drop + create, then the 236 grant model.
--   * jobs_summary (latest: 255) + worked_dates / driven_dates per employee.
-- Bodies otherwise unchanged.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

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
  breakdown jsonb,                 -- employeeBreakdownInRange shape
  worked_dates date[],             -- distinct days with timesheet or crew hours (daily pay)
  driven_dates date[]              -- distinct days with driving hours
) language sql stable security invoker set search_path = public as $$
  with ts as (
    select t.employee_id as id, sum(coalesce(t.hours_worked, 0))::double precision as h
    from public.timesheets t
    where t.business_id = p_business_id and t.employee_id is not null
      and t.work_date >= p_start and t.work_date <= p_end
    group by t.employee_id
  ),
  ts_days as (
    select t.employee_id as id, t.work_date as d
    from public.timesheets t
    where t.business_id = p_business_id and t.employee_id is not null
      and t.work_date >= p_start and t.work_date <= p_end
      and coalesce(t.hours_worked, 0) <> 0
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
  crew as (  -- DISTINCT: duplicate assignment rows credit hours ONCE per job.
             -- crew = false rows (lead-only) credit nothing.
    select distinct j.id as job_id, ja.employee_id as id, j.th, j.title, j.scheduled_date, j.lead_name
    from jobs_in j
    join public.job_assignments ja on ja.job_id = j.id
    where ja.employee_id is not null and coalesce(ja.crew, true) and j.th <> 0
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
  worked_days as (
    select id, array_agg(distinct d order by d) as ds
    from (select id, d from ts_days
          union select c.id, c.scheduled_date from crew c where c.scheduled_date is not null) x
    group by id
  ),
  driven_days as (
    select d.id, array_agg(distinct d.scheduled_date order by d.scheduled_date) as ds
    from drv d where d.scheduled_date is not null group by d.id
  ),
  jcf_people as (  -- crew ∪ drivers per job, distinct — regardless of hours.
                   -- Lead-only rows excluded: no work, no per-job pay fields.
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
         ) as breakdown,
         coalesce(wd.ds, '{}'::date[]) as worked_dates,
         coalesce(dd.ds, '{}'::date[]) as driven_dates
  from public.employees e
  left join ts t on t.id = e.id
  left join crew_sum cs on cs.id = e.id
  left join drv_sum ds on ds.id = e.id
  left join breakdown_jobs bj on bj.emp = e.id
  left join jcf on jcf.emp = e.id
  left join worked_days wd on wd.id = e.id
  left join driven_days dd on dd.id = e.id
  where e.business_id = p_business_id;
$$;

revoke all on function public.payroll_period_inputs(uuid, date, date, text[]) from public, anon;
grant execute on function public.payroll_period_inputs(uuid, date, date, text[]) to authenticated, service_role;

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
  p_jcf_keys text[] default null,          -- job custom-field keys a pay formula reads
  p_job_ids uuid[] default null,           -- explicit selection; overrides every filter above
  p_filters jsonb default null            -- field filters (migration 253)
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with jobs_in as (
    select j.id, j.status, j.scheduled_date,
           coalesce(j.total_amount, 0)::double precision as amount,
           coalesce(j.total_hours, 0)  as th,
           coalesce(j.driver_hours, 0) as dh,
           j.driver_employee_ids, j.custom_fields
    from public.jobs j
    where j.business_id = p_business_id
      and (
        -- Explicit selection: exactly these jobs, whatever tab/search/date is
        -- on screen. business_id above still scopes it (plus RLS — invoker).
        (p_job_ids is not null and j.id = any(p_job_ids))
        or (p_job_ids is null
          and (p_location_id is null or j.location_id = p_location_id)
          and (p_status_include is null or j.status = any(p_status_include))
          and (not p_exclude_closed or j.status not in ('invoiced', 'cancelled'))
          and (p_archived = 'any'
               or (p_archived = 'exclude' and j.archived_at is null)
               or (p_archived = 'only'    and j.archived_at is not null))
          and (p_date_from is null or j.scheduled_date >= p_date_from)
          and (p_date_to   is null or j.scheduled_date <= p_date_to)
          and (p_filters is null or j.id in (select public.job_filter_job_ids(p_business_id, p_filters)))
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
        )
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
    select distinct j.id as job_id, ja.employee_id as id, j.th, j.scheduled_date
    from jobs_in j
    join public.job_assignments ja on ja.job_id = j.id
    where ja.employee_id is not null and coalesce(ja.crew, true) and j.th <> 0
  ),
  drv as (
    select distinct j.id as job_id, d.id, j.dh, j.scheduled_date
    from jobs_in j
    cross join lateral unnest(j.driver_employee_ids) as d(id)
    where j.dh <> 0
  ),
  crew_sum as (select c.id, sum(c.th)::double precision as h from crew c group by c.id),
  drv_sum  as (select d.id, sum(d.dh)::double precision as h, count(*)::int as n from drv d group by d.id),
  worked_days as (  -- distinct days per worker (daily pay)
    select c.id, array_agg(distinct c.scheduled_date order by c.scheduled_date) as ds
    from crew c where c.scheduled_date is not null group by c.id
  ),
  driven_days as (
    select d.id, array_agg(distinct d.scheduled_date order by d.scheduled_date) as ds
    from drv d where d.scheduled_date is not null group by d.id
  ),
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
             'jcf_raw',             jcf.raw,
             'worked_dates',        coalesce(to_jsonb(wd.ds), '[]'::jsonb),
             'driven_dates',        coalesce(to_jsonb(dd.ds), '[]'::jsonb)
           )), '[]'::jsonb) as js
    from public.employees e
    left join crew_sum cs on cs.id = e.id
    left join drv_sum  ds on ds.id = e.id
    left join jcf         on jcf.emp = e.id
    left join worked_days wd on wd.id = e.id
    left join driven_days dd on dd.id = e.id
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
