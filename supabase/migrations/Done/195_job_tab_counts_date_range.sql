-- 195_job_tab_counts_date_range.sql
-- =============================================================================
-- The jobs list's date-range filter (pay-period / custom range) filters the
-- ROWS server-side (scheduled_date between from/to — jobsQuery.ts) but the
-- header total + tab badges come from job_tab_counts (181), which had no date
-- parameters — so "5062 total" showed with a pay-period filter displaying a
-- handful of jobs.
--
-- This extends job_tab_counts with optional p_date_from / p_date_to matching
-- the page query's scheduled_date semantics exactly. Null dates = unchanged
-- behavior.
--
-- The old 5-arg signature must be DROPPED first: `create or replace` with a
-- different parameter list would create an OVERLOAD, and PostgREST rejects
-- ambiguous RPC calls once two candidates match.
--
-- The client (fetchJobTabCounts) only passes the date args when a range is
-- active and falls back to the date-less call if this migration hasn't been
-- run yet — safe to deploy code before running this.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

drop function if exists public.job_tab_counts(uuid, uuid, text, uuid[], uuid[]);

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
        or j.title           ilike '%' || p_search_term || '%'
        or j.external_ref    ilike '%' || p_search_term || '%'
        or j.estimate_number ilike '%' || p_search_term || '%'
        or j.job_city        ilike '%' || p_search_term || '%'
        or j.job_state       ilike '%' || p_search_term || '%'
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
--   select * from public.job_tab_counts('<business-id>');                -- unchanged totals
--   select * from public.job_tab_counts('<business-id>', null, null,
--     null, null, current_date - 7, current_date);                       -- range-filtered
