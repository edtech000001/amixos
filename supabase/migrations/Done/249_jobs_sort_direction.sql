-- 249_jobs_sort_direction.sql
-- Jobs list sorting: a direction, sane date sorts, and the paused status.
--
--   * p_sort_desc (new, last param, default null): the user can flip any sort
--     by tapping it again. null = the sort's default direction, which for the
--     DATE sorts is now NEWEST FIRST — Start date used to open a 5,000-job list
--     on work from years ago. Defaults mirror shared/src/lib/jobSort.ts
--     (DEFAULT_DESC): recent, updated, startDate, endDate → desc; the rest asc.
--   * End date of a single-day job is its start date. end_date is only filled
--     for multi-day jobs, so every one-day job used to sink to the bottom of
--     the End date sort.
--   * Missing values are NULL (not '9999-12-31') so they stay at the bottom in
--     BOTH directions.
--   * 'created' sort key: "Recently added" flipped to oldest-first is served
--     here (the default newest-first stays on the keyset path).
--   * 'paused' (migration 246) placed after in_progress in the status order.
--
-- Same filters and security as 209 (security invoker: RLS applies).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

-- The signature changes (new param), so drop the 209 version first — leaving
-- both would make PostgREST calls ambiguous.
drop function if exists public.jobs_page_ids(
  uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, int, int
);

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
  p_sort_desc boolean default null         -- null = the sort's default direction
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

-- Same exposure as every other RPC (migration 236): signed-in users only.
revoke all on function public.jobs_page_ids(
  uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, int, int, boolean
) from public, anon;
grant execute on function public.jobs_page_ids(
  uuid, text, text[], boolean, text, text, uuid[], uuid[], uuid, date, date, int, int, boolean
) to authenticated, service_role;
