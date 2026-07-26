-- 165_job_group_index.sql
-- Aggregate powering the jobs list's LAZY group-by. Returns the groups (key,
-- label, count) for a group-by dimension + the active filters, WITHOUT
-- returning the job rows — so grouping a large list never loads every job. The
-- list renders these group headers, then loads each group's jobs on demand as
-- it scrolls toward them.
--
-- The filter args mirror JobsListScreen's tab/search logic; the client resolves
-- the search term to client_ids / crew job_ids (same lookups as jobsQuery) and
-- expands the tabs to a status set + archived/closed flags, then passes them in.
--
-- SECURITY INVOKER so it respects the caller's RLS on jobs (a field worker only
-- groups the jobs they can see). p_business_id is an extra explicit scope.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

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
  p_date_to date default null
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
    -- A job's lead = its is_lead assignment (resolved employee name, else the
    -- manually-typed worker_name).
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
      and (
        p_search_term is null
        or j.title           ilike '%' || p_search_term || '%'
        or j.external_ref    ilike '%' || p_search_term || '%'
        or j.estimate_number ilike '%' || p_search_term || '%'
        or j.job_city        ilike '%' || p_search_term || '%'
        or j.job_state       ilike '%' || p_search_term || '%'
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

-- ── Test in the SQL Editor (replace the uuid) ────────────────────────────────
--   select * from public.job_group_index('<your-business-uuid>', 'lead');
--   select * from public.job_group_index('<your-business-uuid>', 'client');
--   -- Should return one row per lead/client with a count; the counts should
--   -- sum to your total jobs (minus closed/archived, which are excluded by default).
