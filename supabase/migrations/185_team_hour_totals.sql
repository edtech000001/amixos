-- 185_team_hour_totals.sql
-- Team screen → Hours tab: per-worker period hours in ONE scan.
--
-- The tab used to download the whole employees roster + every timesheet and
-- job in the period (with a job_assignments embed) just to run the payroll
-- engine and keep three fields. The displayed number is config-free:
--   hours = round2(timesheet hours + Σ job.total_hours per DISTINCT crew
--           member + Σ job.driver_hours per DISTINCT driver)
-- exactly mirroring computePayrollRows' hour-attribution phase
-- (shared/src/lib/payroll.ts):
--   * jobs filtered by scheduled_date within [start, end]
--   * total_hours credited IN FULL to every distinct assigned crew member
--   * driver_hours credited IN FULL to every distinct id in driver_employee_ids
--   * timesheets with employee_id IS NULL contribute nothing
--   * rows kept when hours > 0 OR pay_type = 'salary' (includeZero: false)
--
-- SECURITY INVOKER — runs under the caller's RLS, same visibility as the
-- queries it replaces. Period bounds are passed in (period math stays
-- client-side; see getPayrollPeriod).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.team_hour_totals(
  p_business_id uuid,
  p_start date,
  p_end date
) returns table(employee_id uuid, worker_name text, hours double precision)
language sql stable security invoker set search_path = public as $$
  with worked as (
    select ts.employee_id as id, sum(coalesce(ts.hours_worked, 0))::double precision as h
    from public.timesheets ts
    where ts.business_id = p_business_id
      and ts.employee_id is not null
      and ts.work_date >= p_start and ts.work_date <= p_end
    group by ts.employee_id
  ),
  job_crew as (
    -- DISTINCT: duplicate assignment rows credit the job's hours ONCE.
    select distinct j.id as job_id, ja.employee_id as id, j.total_hours
    from public.jobs j
    join public.job_assignments ja on ja.job_id = j.id
    where j.business_id = p_business_id
      and ja.employee_id is not null
      and j.scheduled_date >= p_start and j.scheduled_date <= p_end
      and coalesce(j.total_hours, 0) <> 0
  ),
  crew_hours as (
    select id, sum(total_hours)::double precision as h from job_crew group by id
  ),
  driver_rows as (
    select distinct j.id as job_id, d.id, j.driver_hours
    from public.jobs j
    cross join lateral unnest(j.driver_employee_ids) as d(id)
    where j.business_id = p_business_id
      and j.scheduled_date >= p_start and j.scheduled_date <= p_end
      and coalesce(j.driver_hours, 0) <> 0
  ),
  driver_hours as (
    select id, sum(driver_hours)::double precision as h from driver_rows group by id
  ),
  totals as (
    select e.id,
           trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as name,
           e.pay_type,
           coalesce(w.h, 0) + coalesce(c.h, 0) + coalesce(d.h, 0) as hrs
    from public.employees e
    left join worked w on w.id = e.id
    left join crew_hours c on c.id = e.id
    left join driver_hours d on d.id = e.id
    where e.business_id = p_business_id
  )
  select id, name, round(hrs::numeric, 2)::double precision as hours
  from totals
  where hrs > 0 or pay_type = 'salary'
  order by hrs desc;
$$;

-- ── Verify (compare with the Hours tab before updating the app) ─────────────
--   select * from public.team_hour_totals('<business-uuid>',
--     '<period-start>'::date, '<period-end>'::date);
