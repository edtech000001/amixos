-- 246_job_paused_status.sql
-- "Paused" / on-hold jobs: work blocked on something outside the crew's
-- control (materials, client, weather, a permit) so the crew moves to other
-- jobs instead of the job sitting in progress holding them.
--
-- Paused is NOT another step in the pipeline and NOT terminal like cancelled.
-- It SUSPENDS whatever the job was, and resuming must put it back exactly
-- there — you can be blocked before you start (scheduled) just as easily as
-- mid-job (in_progress). Hence paused_from: the status to restore. Inferring
-- it would get the common "waiting on material before we start" case wrong.
--
-- Why a status value rather than a flag: the whole app is status-driven —
-- the list chips, job_tab_counts, the reports "jobs by status" breakdown and
-- the keyset sort all key off jobs.status. A flag would need every one of
-- those taught about it separately; a status value inherits them.
--
-- The crew is freed by crewFinderData / jobConflicts, which already skip
-- ('cancelled','declined') — paused joins that list. The scheduled date is
-- deliberately KEPT so the calendar still shows the original plan.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── 1. Allow the new status ────────────────────────────────────────────────
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in (
    'posible',
    'proposal','sent','accepted','declined',
    'scheduled','in_progress','paused','completed','cancelled','invoiced'
  ));

-- ── 2. Pause state ─────────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists paused_at    timestamptz,
  -- The status to return to on resume. Any non-paused status is allowed: you
  -- can be blocked at any active stage.
  add column if not exists paused_from  text,
  -- Free text, but previously-used values are offered as quick-picks (see the
  -- RPC below), so a business converges on its own vocabulary without anyone
  -- maintaining a list. Kept AFTER resume on purpose — it is the record of why
  -- the job was once delayed, and it keeps feeding the suggestions.
  add column if not exists pause_reason text,
  add column if not exists pause_note   text;

alter table public.jobs drop constraint if exists jobs_paused_from_check;
alter table public.jobs add constraint jobs_paused_from_check
  check (paused_from is null or paused_from in (
    'posible','proposal','sent','accepted','scheduled','in_progress'
  ));

comment on column public.jobs.paused_from is
  'Status to restore when the job resumes. Set when status becomes paused.';
comment on column public.jobs.pause_reason is
  'Why the job was paused. Retained after resume — it is history and it feeds job_pause_reasons().';

-- Powers the reason suggestions. Partial: most jobs never get paused.
create index if not exists jobs_pause_reason_idx
  on public.jobs (business_id, pause_reason)
  where pause_reason is not null;

-- ── 3. Reason suggestions ──────────────────────────────────────────────────
-- Distinct reasons this business has used, most-used first. There is no
-- reason catalog to maintain: typing "Clima" once makes it a quick-pick next
-- time. security invoker so RLS still scopes it to the caller's businesses.
create or replace function public.job_pause_reasons(
  p_business_id uuid,
  p_limit int default 8
) returns table(reason text, uses bigint)
language sql stable security invoker set search_path = public as $$
  select j.pause_reason, count(*)
    from public.jobs j
   where j.business_id = p_business_id
     and j.pause_reason is not null
     and btrim(j.pause_reason) <> ''
   group by j.pause_reason
   order by count(*) desc, j.pause_reason
   limit greatest(p_limit, 0);
$$;

-- ── 4. Tab counts ──────────────────────────────────────────────────────────
-- Verbatim copy of the 209 body plus the paused bucket. Paused is NOT folded
-- into in_progress: the point of the feature is seeing blocked work apart from
-- work actually moving.
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

-- ── Verify ─────────────────────────────────────────────────────────────────
-- 1. The new status is accepted and the old ones still are:
--      update public.jobs set status = 'paused', paused_from = 'in_progress',
--             paused_at = now(), pause_reason = 'Material'
--       where id = '<a job you own>';
-- 2. It shows up as its own tab, and in_progress drops by one:
--      select * from public.job_tab_counts('<business-uuid>') order by tab;
-- 3. Suggestions come back ranked:
--      select * from public.job_pause_reasons('<business-uuid>');
-- 4. Nonsense is rejected:
--      update public.jobs set paused_from = 'completed' where id = '<id>';
--      -- => violates jobs_paused_from_check
-- 5. Put it back:
--      update public.jobs set status = paused_from, paused_at = null,
--             paused_from = null where id = '<id>';
