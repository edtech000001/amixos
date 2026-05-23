-- Migration 023: Job location coords, worker notes, all-day flag
-- Run in Supabase SQL Editor

alter table public.jobs
  add column if not exists job_lat       numeric(10, 7),
  add column if not exists job_lng       numeric(10, 7),
  add column if not exists worker_notes  text,
  add column if not exists all_day       boolean not null default false;

comment on column public.jobs.job_lat      is 'Optional latitude — captured from pasted coords or map link';
comment on column public.jobs.job_lng      is 'Optional longitude — captured from pasted coords or map link';
comment on column public.jobs.worker_notes is 'Notes visible to assigned workers (separate from internal_notes)';
comment on column public.jobs.all_day      is 'True when the job covers the full day; time_start/time_end should be null';
