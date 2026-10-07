-- 247_job_pause_log.sql
-- History of every time a job was put on hold (migration 246 added the status).
--
-- jobs.paused_at / pause_reason are the CURRENT state — read on every job load
-- with no join, cleared on resume. That makes a job stalled five times look
-- identical to one stalled once, so "which jobs keep getting blocked?" and
-- "what actually stalls us?" are unanswerable. This table is the history: one
-- row per pause EPISODE, closed by stamping resumed_at.
--
-- History cannot be backfilled, so this lands with the feature rather than
-- after it.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.job_pause_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  job_id      uuid not null references public.jobs(id)       on delete cascade,
  -- Null resumed_at = still on hold. At most one open episode per job (below).
  paused_at   timestamptz not null default now(),
  resumed_at  timestamptz,
  reason      text,
  note        text,
  -- The status the job was held AT, so the history reads "blocked before it
  -- started" vs "blocked halfway".
  paused_from text,
  paused_by   uuid references auth.users(id) on delete set null,
  resumed_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One OPEN episode per job. Without this a double-tap on "Put on hold", or an
-- offline write replayed twice, silently doubles the count — and the count is
-- the whole point of the table.
create unique index if not exists job_pause_log_one_open_idx
  on public.job_pause_log (job_id)
  where resumed_at is null;

-- Per-job history, newest first (the detail screen).
create index if not exists job_pause_log_job_idx
  on public.job_pause_log (job_id, paused_at desc);
-- Business-wide reporting ("what stalls us", "chronically blocked jobs").
create index if not exists job_pause_log_business_idx
  on public.job_pause_log (business_id, paused_at desc);

alter table public.job_pause_log enable row level security;

-- Reads follow the job: anyone who can see the job can see why it stalled.
-- Initplan form per CLAUDE.md — a SECURITY DEFINER helper must never take a
-- row column, or it re-evaluates per row.
drop policy if exists "job_pause_log read" on public.job_pause_log;
create policy "job_pause_log read" on public.job_pause_log
  for select using (
    business_id in (select public.my_view_businesses('jobs', 'all'))
    or (
      business_id in (select public.my_view_businesses('jobs', 'assigned'))
      and job_id in (select public.my_assigned_job_ids())
    )
  );

-- Writes follow jobs.edit — the same permission that lets you change a status.
drop policy if exists "job_pause_log insert" on public.job_pause_log;
create policy "job_pause_log insert" on public.job_pause_log
  for insert with check (public.member_res(business_id, 'jobs', 'edit'));
drop policy if exists "job_pause_log update" on public.job_pause_log;
create policy "job_pause_log update" on public.job_pause_log
  for update using (public.member_res(business_id, 'jobs', 'edit'))
          with check (public.member_res(business_id, 'jobs', 'edit'));
drop policy if exists "job_pause_log delete" on public.job_pause_log;
create policy "job_pause_log delete" on public.job_pause_log
  for delete using (public.member_res(business_id, 'jobs', 'delete'));

-- ── Per-job summary ────────────────────────────────────────────────────────
-- What the detail banner shows: "On hold 3 times · 12 days total". Open
-- episodes count their time up to now, so a job held right now keeps ticking.
create or replace function public.job_pause_summary(p_job_id uuid)
returns table(episodes bigint, total_seconds numeric, open_since timestamptz)
language sql stable security invoker set search_path = public as $$
  select
    count(*),
    coalesce(sum(extract(epoch from (coalesce(resumed_at, now()) - paused_at))), 0),
    max(paused_at) filter (where resumed_at is null)
  from public.job_pause_log
  where job_id = p_job_id;
$$;

-- ── Business-wide: what actually stalls us ─────────────────────────────────
-- Reasons ranked by how much time they cost, not just how often they occur —
-- "waiting on permit" twice for three weeks each matters more than "rain"
-- eight times for an afternoon.
create or replace function public.job_pause_stats(
  p_business_id uuid,
  p_from date default null,
  p_to   date default null
) returns table(reason text, episodes bigint, total_days numeric, jobs bigint)
language sql stable security invoker set search_path = public as $$
  select
    coalesce(nullif(btrim(l.reason), ''), '—'),
    count(*),
    round(sum(extract(epoch from (coalesce(l.resumed_at, now()) - l.paused_at))) / 86400.0, 1),
    count(distinct l.job_id)
  from public.job_pause_log l
  where l.business_id = p_business_id
    and (p_from is null or l.paused_at >= p_from)
    and (p_to   is null or l.paused_at <  (p_to + 1))
  group by 1
  order by 3 desc, 2 desc;
$$;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- 1. Pause a job in the app, then:
--      select * from public.job_pause_log where job_id = '<id>';
--      -- one row, resumed_at null
-- 2. A second open episode is rejected:
--      insert into public.job_pause_log (business_id, job_id)
--      values ('<biz>', '<id>');
--      -- => duplicate key on job_pause_log_one_open_idx
-- 3. Resume in the app, then pause again — two rows, the first closed:
--      select paused_at, resumed_at, reason from public.job_pause_log
--       where job_id = '<id>' order by paused_at;
-- 4. Summary and stats:
--      select * from public.job_pause_summary('<id>');
--      select * from public.job_pause_stats('<biz>');
