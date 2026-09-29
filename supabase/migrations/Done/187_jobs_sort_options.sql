-- 187_jobs_sort_options.sql
-- New jobs-list sort options: priority / recently-updated / title / end date.
--
-- Extends jobs_page_ids (181) with four sort keys, mirroring the client-side
-- semantics in shared/src/lib/jobSort.ts exactly:
--   priority:  urgent → high → normal → low; missing counts as 'normal',
--              unknown values sink last (array_position → null → NULLS LAST)
--   updated:   latest jobs.updated_at first (the one DESC sort — handled by a
--              second order-by arm; sort_val is a zero-padded epoch so text
--              comparison is chronological regardless of timezone rendering)
--   title:     lower(title) A→Z, blank/missing last
--   endDate:   soonest end_date first, no-date last
-- 'client' and 'lead' remain valid (older app builds + saved preferences still
-- send them) even though the UI no longer offers them.
--
-- SECURITY INVOKER — RLS applies inside, unchanged from 181. Same signature,
-- so plain create-or-replace. Idempotent / safe to re-run.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

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
        or j.title           ilike '%' || p_search_term || '%'
        or j.external_ref    ilike '%' || p_search_term || '%'
        or j.estimate_number ilike '%' || p_search_term || '%'
        or j.job_city        ilike '%' || p_search_term || '%'
        or j.job_state       ilike '%' || p_search_term || '%'
        or (p_client_ids   is not null and j.client_id = any(p_client_ids))
        or (p_crew_job_ids is not null and j.id        = any(p_crew_job_ids))
      )
  )
  select id from filt
  order by
    -- 'updated' is the one DESC sort; every other key sorts ASC. Two mutually
    -- exclusive arms keep NULLS LAST working in both directions.
    case when p_sort <> 'updated' then sort_val end asc nulls last,
    case when p_sort =  'updated' then sort_val end desc nulls last,
    created_at desc, id desc
  limit p_limit offset p_offset;
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select * from public.jobs_page_ids('<business-uuid>', 'priority');
--   select * from public.jobs_page_ids('<business-uuid>', 'updated');
--   select * from public.jobs_page_ids('<business-uuid>', 'title');
--   select * from public.jobs_page_ids('<business-uuid>', 'endDate');
-- Compare against the app list after updating; ties break newest-first.
