-- 238_jobs_summary_selection.sql
-- =============================================================================
-- Jobs-list Summary for a hand-picked selection.
--
-- The Summary button totalled the whole filtered set. Picking 5 of 10 rows in
-- select mode and asking "what do these cost" had no answer. This adds
-- p_job_ids: when set, the summary covers exactly those jobs and ignores the
-- tab/search/date/location filters (the selection IS the set). Everything else
-- — hours, per-employee payroll inputs, custom-field formula keys — is the same
-- query as 210, so a selection's totals can't drift from the filtered ones.
--
-- The signature changes (new trailing arg), so the old 11-arg function is
-- dropped first — otherwise PostgREST sees two overloads and rejects calls
-- that omit p_job_ids as ambiguous.
--
-- Grants: migration 236 revoked PUBLIC/anon EXECUTE on every function, but a
-- NEWLY created function gets PUBLIC execute again by default — re-applied
-- below.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Requires 210 (+209).
-- Idempotent / safe to re-run.
-- =============================================================================

drop function if exists public.jobs_summary(
  uuid, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, text[]
);

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
  p_job_ids uuid[] default null            -- explicit selection; overrides every filter above
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


revoke all on function public.jobs_summary(
  uuid, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, text[], uuid[]
) from public, anon;
grant execute on function public.jobs_summary(
  uuid, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, text[], uuid[]
) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Existing callers unchanged (no p_job_ids):
--      select public.jobs_summary('<business-uuid>');
-- 2. Selection: jobCount must equal the number of ids passed (that belong to
--    the business), regardless of status/archived:
--      select public.jobs_summary('<business-uuid>', p_job_ids => array['<job-1>','<job-2>']::uuid[]);
