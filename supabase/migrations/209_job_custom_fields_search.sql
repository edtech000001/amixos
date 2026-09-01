-- 209_job_custom_fields_search.sql
--
-- Make user-defined job custom fields searchable from the jobs list.
--
-- Today searchOrClause() (shared/lib/jobsQuery.ts) matches title, external_ref,
-- estimate_number, job_city, job_state + client/crew names. jobs.custom_fields
-- is NOT searched, so looking up "Grain Bin" only finds jobs with that text in
-- the TITLE — a job whose Tipo de Proyecto is "Grain Bin" but whose title says
-- something else is silently missed.
--
-- Why a generated column and not a JSONB expression: fetchJobsPage builds a
-- PostgREST `.or(...)` string, which can't express a jsonb traversal. It needs
-- a real, indexable column to match against.
--
-- Why values-only and not custom_fields::text: the raw cast includes the KEYS,
-- so a search for "type" would match every job carrying a `project_type` key.
-- Flattening to values keeps matches meaningful.

-- ── 1. Values-only flattener ────────────────────────────────────────────────
-- Must be IMMUTABLE to be legal in a stored generated column. jsonb_each_text
-- is immutable, so this is genuinely immutable, not just labelled as such.
--
-- Objects only. custom_fields is always an object in practice; anything else
-- (null, array, scalar from a bad import) yields '' rather than erroring, so a
-- malformed row can never block an insert.
create or replace function public.jsonb_values_text(p jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  -- The CASE normalizes non-objects to '{}' INSIDE the FROM: jsonb_each_text
  -- raises on a scalar or array, and guarding in a WHERE/CASE around the
  -- subquery wouldn't reliably short-circuit. string_agg with no GROUP BY
  -- always returns exactly one row, so the function never yields NULL-by-
  -- omission (which a trailing WHERE would).
  select coalesce(string_agg(v.value, ' '), '')
  from jsonb_each_text(
    case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end
  ) as v
  where v.value is not null and v.value <> ''
$$;

comment on function public.jsonb_values_text(jsonb) is
  'Space-joined VALUES of a jsonb object (keys excluded), for trigram search on custom_fields. IMMUTABLE so it can back a generated column. CHANGING THIS BODY DOES NOT RECOMPUTE jobs.custom_fields_text — existing rows keep their old value until updated. Backfill deliberately if you edit it.';

-- ── 2. Generated search column ──────────────────────────────────────────────
alter table public.jobs
  add column if not exists custom_fields_text text
    generated always as (public.jsonb_values_text(custom_fields)) stored;

comment on column public.jobs.custom_fields_text is
  'Auto-maintained flattening of custom_fields values for search. Never write to this directly.';

-- ── 3. Trigram index ────────────────────────────────────────────────────────
-- Matches the pattern the other job search columns use (migration 182).
-- Without it, ILIKE '%term%' is a seq scan and search degrades as jobs grow.
--
-- NOT concurrently: adding the generated column above already took an ACCESS
-- EXCLUSIVE lock and rewrote the table, so the table is already unavailable for
-- the duration of this migration — CONCURRENTLY would buy nothing and can't run
-- in the same transaction anyway.
create index if not exists jobs_custom_fields_text_trgm_idx
  on public.jobs using gin (custom_fields_text gin_trgm_ops);

-- ── 4. Teach the three search RPCs about the new column ─────────────────────
-- The page query (fetchJobsPage) builds its own PostgREST `.or(...)`, but the
-- tab badges, server-side sort and group index all run through these RPCs. If
-- only the page query learns the new arm, the list shows custom-field matches
-- while the badges count something narrower — so all three move together.
--
-- Each is re-created verbatim from its current definition (job_group_index:
-- 165, jobs_page_ids: 187, job_tab_counts: 195) with a single added line:
--   or j.custom_fields_text ilike '%' || p_search_term || '%'
-- Signatures are unchanged, so no drop is needed and no PostgREST overload can
-- appear.

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

create or replace function public.jobs_page_ids(
  p_business_id uuid,
  p_sort text,                             -- 'status'|'startDate'|'priority'|'updated'|'title'|'endDate'|'client'|'lead'|'company'
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
  p_offset int default 0
) returns setof uuid
language sql stable security invoker set search_path = public as $$
  with filt as (
    select
      j.id, j.created_at,
      case p_sort
        when 'status' then lpad(coalesce(
          array_position(array['proposal','sent','accepted','posible','scheduled',
                               'in_progress','completed','invoiced','declined','cancelled'], j.status),
          99)::text, 2, '0')
        when 'startDate' then coalesce(j.scheduled_date::text, '9999-12-31')
        when 'endDate' then coalesce(j.end_date::text, '9999-12-31')
        when 'priority' then array_position(array['urgent','high','normal','low'],
                                            coalesce(j.priority, 'normal'))::text
        when 'updated' then lpad(floor(extract(epoch from j.updated_at))::bigint::text, 12, '0')
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
  )
  select id from filt
  order by
    case when p_sort <> 'updated' then sort_val end asc nulls last,
    case when p_sort =  'updated' then sort_val end desc nulls last,
    created_at desc, id desc
  limit p_limit offset p_offset;
$$;

create or replace function public.job_tab_counts(
  p_business_id uuid,
  p_location_id uuid default null,
  p_search_term text default null,
  p_client_ids uuid[] default null,
  p_crew_job_ids uuid[] default null,
  p_date_from date default null,
  p_date_to date default null
) returns table(tab text, cnt bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select j.status, j.archived_at, j.delegated_to_business_id
    from public.jobs j
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
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
      count(*) filter (where archived_at is null and status = 'completed')                      as completed_cnt,
      count(*) filter (where archived_at is null and status = 'invoiced')                       as invoiced_cnt,
      count(*) filter (where archived_at is null and status = 'cancelled')                      as cancelled_cnt
    from base
  )
  select t.tab, t.cnt from agg cross join lateral (values
    ('all', all_cnt), ('archived', archived_cnt), ('propuestas', propuestas_cnt),
    ('delegated', delegated_cnt), ('posible', posible_cnt), ('scheduled', scheduled_cnt),
    ('in_progress', in_progress_cnt), ('completed', completed_cnt),
    ('invoiced', invoiced_cnt), ('cancelled', cancelled_cnt)
  ) t(tab, cnt);
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Column populated (should be non-empty wherever custom_fields has values):
--      select id, custom_fields, custom_fields_text
--      from public.jobs where custom_fields <> '{}'::jsonb limit 5;
-- 2. Keys are NOT searchable, values are:
--      select public.jsonb_values_text('{"project_type":"Grain Bin"}'::jsonb);
--      -- => 'Grain Bin'   (not 'project_type Grain Bin')
-- 3. Index is used rather than a seq scan:
--      explain analyze select count(*) from public.jobs
--      where business_id = '<uuid>' and custom_fields_text ilike '%grain%';
-- 4. Badges agree with the list — search a custom-field-only value in the app
--    and confirm the tab counts match the rows shown.
