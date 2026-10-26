-- 253_job_field_filters.sql
-- Jobs list: Team-style field filters — pick a field (Lead, Crew member,
-- Client, Priority, State, City, or a custom job field), then check values.
-- AND across fields, OR within one field.
--
--   job_matches_filters(job, filters)  the ONE definition of the filter rules,
--                                       used by every jobs RPC below.
--   job_filter_values(...)             a field's values + job counts (the
--                                       list loads 50 rows at a time, so the
--                                       values can't come from loaded rows).
--   jobs_page_ids / job_tab_counts / jobs_summary / job_group_index
--                                       + trailing p_filters jsonb (default
--                                       null): server sorts, tab badges, the
--                                       Summary and the group index all honour
--                                       the filters. Bodies are otherwise
--                                       identical to 249 / 246 / 238 / 209.
--
-- p_filters shape: {"lead": [...], "crew": [...], "client": [...],
--   "priority": [...], "state": [...], "city": [...], "cf:<field_key>": [...]}
--   lead/crew values: employee uuid, or 'w:<worker name>' for crew without an
--   employee record. '' = "(empty)" for the column fields.
--   The keyset page query (PostgREST, shared/src/lib/jobsQuery.ts
--   applyFieldFilters) mirrors these rules.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Requires 249, 246, 238,
-- 209. Safe to re-run.

-- ── 1. The filter rules ────────────────────────────────────────────────────
create or replace function public.job_matches_filters(j public.jobs, p_filters jsonb)
returns boolean
language sql stable security invoker set search_path = public as $$
  select coalesce(bool_and(
    case
      when f.k = 'lead' then exists (
        select 1 from public.job_assignments ja
        where ja.job_id = j.id and ja.is_lead
          and coalesce(ja.employee_id::text, 'w:' || coalesce(ja.worker_name, '')) = any(f.vals))
      when f.k = 'crew' then exists (
        select 1 from public.job_assignments ja
        where ja.job_id = j.id
          and coalesce(ja.employee_id::text, 'w:' || coalesce(ja.worker_name, '')) = any(f.vals))
      when f.k = 'client'   then coalesce(j.client_id::text, '') = any(f.vals)
      when f.k = 'priority' then coalesce(j.priority, 'normal') = any(f.vals)
      when f.k = 'state'    then coalesce(upper(nullif(trim(j.job_state), '')), '') = any(f.vals)
      when f.k = 'city'     then coalesce(nullif(trim(j.job_city), ''), '') = any(f.vals)
      when f.k like 'cf:%'  then coalesce(nullif(trim(j.custom_fields ->> substr(f.k, 4)), ''), '') = any(f.vals)
      else true
    end), true)
  from (
    select e.k, array(select jsonb_array_elements_text(e.v)) as vals
    from jsonb_each(coalesce(p_filters, '{}'::jsonb)) as e(k, v)
    where jsonb_typeof(e.v) = 'array' and jsonb_array_length(e.v) > 0
  ) f;
$$;

revoke all on function public.job_matches_filters(public.jobs, jsonb) from public, anon;
grant execute on function public.job_matches_filters(public.jobs, jsonb) to authenticated, service_role;

-- ── 2. A field's values + counts (non-archived jobs) ───────────────────────
-- Names come from employees_roster (migration 178), readable by every member.
create or replace function public.job_filter_values(
  p_business_id uuid,
  p_field text,
  p_location_id uuid default null
) returns table(value text, label text, cnt bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_field in ('lead', 'crew') then
    return query
      select coalesce(ja.employee_id::text, 'w:' || coalesce(ja.worker_name, '')) as value,
             coalesce(nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
                      nullif(ja.worker_name, ''), '—') as label,
             count(distinct ja.job_id) as cnt
      from public.jobs j
      join public.job_assignments ja on ja.job_id = j.id and (p_field = 'crew' or ja.is_lead)
      left join public.employees_roster e on e.id = ja.employee_id
      where j.business_id = p_business_id and j.archived_at is null
        and (p_location_id is null or j.location_id = p_location_id)
      group by 1, 2
      order by 3 desc, 2  -- positions: the OUT params share these names
      limit 500;
  elsif p_field = 'client' then
    return query
      select coalesce(j.client_id::text, '') as value,
             coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
                      nullif(c.company, ''), '') as label,
             count(*) as cnt
      from public.jobs j
      left join public.clients c on c.id = j.client_id
      where j.business_id = p_business_id and j.archived_at is null
        and (p_location_id is null or j.location_id = p_location_id)
      group by 1, 2
      order by 3 desc, 2  -- positions: the OUT params share these names
      limit 500;
  else
    return query
      select v.val as value, v.val as label, count(*) as cnt
      from public.jobs j
      cross join lateral (select case
        when p_field = 'priority' then coalesce(j.priority, 'normal')
        when p_field = 'state'    then coalesce(upper(nullif(trim(j.job_state), '')), '')
        when p_field = 'city'     then coalesce(nullif(trim(j.job_city), ''), '')
        when p_field like 'cf:%'  then coalesce(nullif(trim(j.custom_fields ->> substr(p_field, 4)), ''), '')
        else '' end as val) v
      where j.business_id = p_business_id and j.archived_at is null
        and (p_location_id is null or j.location_id = p_location_id)
      group by 1, 2
      order by 3 desc, 2  -- positions: the OUT params share these names
      limit 500;
  end if;
end;
$$;

revoke all on function public.job_filter_values(uuid, text, uuid) from public, anon;
grant execute on function public.job_filter_values(uuid, text, uuid) to authenticated, service_role;

create index if not exists job_assignments_job_id_idx on public.job_assignments (job_id);

-- ── 3. The jobs RPCs + p_filters ───────────────────────────────────────────
-- New trailing param → drop the old signatures first (two overloads would make
-- PostgREST calls ambiguous). New functions get PUBLIC execute by default —
-- re-locked after each (migration 236).

drop function if exists public.jobs_page_ids(uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, int, int, boolean);
create or replace function public.jobs_page_ids(
  p_business_id uuid,
  p_sort text,                             -- 'status'|'startDate'|'endDate'|'priority'|'updated'|'title'|'created'|'client'|'lead'|'company'
  p_status_include text[] default null,
  p_exclude_closed boolean default false,
  p_archived text default 'exclude',       -- 'exclude' | 'only' | 'any'
  p_search_term text default null,
  p_client_ids uuid[] default null,
  p_crew_job_ids uuid[] default null,
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_limit int default 50,
  p_offset int default 0,
  p_sort_desc boolean default null,        -- null = the sort's default direction
  p_filters jsonb default null            -- field filters (migration 253)
) returns setof uuid
language sql stable security invoker set search_path = public as $$
  with filt as (
    select
      j.id, j.created_at,
      case p_sort
        when 'status' then lpad(coalesce(
          array_position(array['proposal','sent','accepted','posible','scheduled',
                               'in_progress','paused','completed','invoiced','declined','cancelled'], j.status),
          99)::text, 2, '0')
        when 'startDate' then j.scheduled_date::text
        when 'endDate' then coalesce(j.end_date, j.scheduled_date)::text
        when 'priority' then array_position(array['urgent','high','normal','low'],
                                            coalesce(j.priority, 'normal'))::text
        when 'updated' then lpad(floor(extract(epoch from j.updated_at))::bigint::text, 12, '0')
        when 'created' then lpad(floor(extract(epoch from j.created_at))::bigint::text, 12, '0')
        when 'title' then nullif(trim(lower(coalesce(j.title, ''))), '')
        when 'client' then nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '')
        when 'company' then nullif(trim(coalesce(c.company,'')), '')
        when 'lead' then lead.name
        else ''
      end as sort_val
    from public.jobs j
    left join public.clients c on p_sort in ('client','company') and c.id = j.client_id
    left join lateral (
      select coalesce(
               nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
               ja.worker_name
             ) as name
      from public.job_assignments ja
      left join public.employees e on e.id = ja.employee_id
      where p_sort = 'lead' and ja.job_id = j.id and ja.is_lead = true
      limit 1
    ) lead on true
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
      and (p_status_include is null or j.status = any(p_status_include))
      and (not p_exclude_closed or j.status not in ('invoiced','cancelled'))
      and (p_archived = 'any'
           or (p_archived = 'exclude' and j.archived_at is null)
           or (p_archived = 'only'    and j.archived_at is not null))
      and (p_date_from is null or j.scheduled_date >= p_date_from)
      and (p_date_to   is null or j.scheduled_date <= p_date_to)
      and (p_filters is null or public.job_matches_filters(j, p_filters))
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
  dir as (
    select coalesce(p_sort_desc, p_sort in ('updated','startDate','endDate','created')) as descending
  )
  select f.id from filt f, dir
  order by
    case when dir.descending then f.sort_val end desc nulls last,
    case when not dir.descending then f.sort_val end asc nulls last,
    f.created_at desc, f.id desc
  limit p_limit offset p_offset;
$$;

revoke all on function public.jobs_page_ids(uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, int, int, boolean, jsonb) from public, anon;
grant execute on function public.jobs_page_ids(uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, int, int, boolean, jsonb) to authenticated, service_role;

drop function if exists public.job_tab_counts(uuid, uuid, text, uuid[], uuid[], date, date);
create or replace function public.job_tab_counts(
  p_business_id uuid,
  p_location_id uuid default null,
  p_search_term text default null,
  p_client_ids uuid[] default null,
  p_crew_job_ids uuid[] default null,
  p_date_from date default null,
  p_date_to date default null,
  p_filters jsonb default null            -- field filters (migration 253)
) returns table(tab text, cnt bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select j.status, j.archived_at, j.delegated_to_business_id
    from public.jobs j
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
      and (p_date_from is null or j.scheduled_date >= p_date_from)
      and (p_date_to   is null or j.scheduled_date <= p_date_to)
      and (p_filters is null or public.job_matches_filters(j, p_filters))
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
  ), agg as (
    select
      count(*)                                                                                  as all_cnt,
      count(*) filter (where archived_at is not null)                                           as archived_cnt,
      count(*) filter (where archived_at is null
                         and status in ('proposal','sent','accepted','declined'))               as propuestas_cnt,
      count(*) filter (where archived_at is null and delegated_to_business_id is not null)      as delegated_cnt,
      count(*) filter (where archived_at is null and status = 'posible')                        as posible_cnt,
      count(*) filter (where archived_at is null and status = 'scheduled')                      as scheduled_cnt,
      count(*) filter (where archived_at is null and status = 'in_progress')                    as in_progress_cnt,
      count(*) filter (where archived_at is null and status = 'paused')                         as paused_cnt,
      count(*) filter (where archived_at is null and status = 'completed')                      as completed_cnt,
      count(*) filter (where archived_at is null and status = 'invoiced')                       as invoiced_cnt,
      count(*) filter (where archived_at is null and status = 'cancelled')                      as cancelled_cnt
    from base
  )
  select t.tab, t.cnt from agg cross join lateral (values
    ('all', all_cnt), ('archived', archived_cnt), ('propuestas', propuestas_cnt),
    ('delegated', delegated_cnt), ('posible', posible_cnt), ('scheduled', scheduled_cnt),
    ('in_progress', in_progress_cnt), ('paused', paused_cnt),
    ('completed', completed_cnt), ('invoiced', invoiced_cnt), ('cancelled', cancelled_cnt)
  ) t(tab, cnt);
$$;

revoke all on function public.job_tab_counts(uuid, uuid, text, uuid[], uuid[], date, date, jsonb) from public, anon;
grant execute on function public.job_tab_counts(uuid, uuid, text, uuid[], uuid[], date, date, jsonb) to authenticated, service_role;

drop function if exists public.jobs_summary(uuid, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, text[], uuid[]);
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
          and (p_filters is null or public.job_matches_filters(j, p_filters))
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

revoke all on function public.jobs_summary(uuid, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, text[], uuid[], jsonb) from public, anon;
grant execute on function public.jobs_summary(uuid, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, text[], uuid[], jsonb) to authenticated, service_role;

drop function if exists public.job_group_index(uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date);
create or replace function public.job_group_index(
  p_business_id uuid,
  p_group_by text,                         -- 'client' | 'lead' | 'company' | 'state'
  p_status_include text[] default null,    -- statuses to include (null = all)
  p_exclude_closed boolean default false,  -- default view hides invoiced/cancelled
  p_archived text default 'exclude',       -- 'exclude' | 'only' | 'any'
  p_search_term text default null,         -- job-field ilike (null = no search)
  p_client_ids uuid[] default null,        -- search: client ids whose name matched
  p_crew_job_ids uuid[] default null,      -- search: job ids whose crew/lead matched
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_filters jsonb default null            -- field filters (migration 253)
)
returns table(group_key text, group_label text, cnt bigint)
language sql stable security invoker as $$
  with filt as (
    select
      j.id, j.client_id, j.job_state,
      c.company as company,
      trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as client_name,
      lead.name as lead_name
    from public.jobs j
    left join public.clients c on c.id = j.client_id
    left join lateral (
      select coalesce(
               nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
               ja.worker_name
             ) as name
      from public.job_assignments ja
      left join public.employees e on e.id = ja.employee_id
      where ja.job_id = j.id and ja.is_lead = true
      limit 1
    ) lead on true
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
      and (p_status_include is null or j.status = any(p_status_include))
      and (not p_exclude_closed or j.status not in ('invoiced', 'cancelled'))
      and (p_archived = 'any'
           or (p_archived = 'exclude' and j.archived_at is null)
           or (p_archived = 'only'    and j.archived_at is not null))
      and (p_date_from is null or j.scheduled_date >= p_date_from)
      and (p_date_to   is null or j.scheduled_date <= p_date_to)
      and (p_filters is null or public.job_matches_filters(j, p_filters))
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
  select
    case p_group_by
      when 'client'  then coalesce(client_id::text, '')
      when 'lead'    then coalesce(lead_name, '')
      when 'company' then coalesce(company, '')
      when 'state'   then coalesce(job_state, '')
      else ''
    end as group_key,
    case p_group_by
      when 'client'  then coalesce(nullif(client_name, ''), '—')
      when 'lead'    then coalesce(nullif(lead_name, ''), '—')
      when 'company' then coalesce(nullif(company, ''), '—')
      when 'state'   then coalesce(nullif(job_state, ''), '—')
      else ''
    end as group_label,
    count(*) as cnt
  from filt
  group by 1, 2
  order by cnt desc, group_label;
$$;

revoke all on function public.job_group_index(uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, jsonb) from public, anon;
grant execute on function public.job_group_index(uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, jsonb) to authenticated, service_role;

-- New functions must be visible to the API right away (PostgREST caches the
-- schema; a stale cache answers "Could not find the function … in the schema
-- cache").
notify pgrst, 'reload schema';
