-- Migration 050: round out calendar_events for the full calendar module.
-- Run in Supabase SQL Editor. All add-if-not-exists, safe to re-run.
--
-- The original calendar_events (migration 001) only had title/description/
-- start_time/end_time/location. The app has been using event_type + client_id
-- (added manually in some envs); this makes them official + adds all-day +
-- multi-day support and an index for the range queries the calendar runs.
--
-- event_type is intentionally free-text (no CHECK): the calendar ships
-- meeting/delivery/reminder/follow_up/other today, but future industry
-- modules may register their own event types and we don't want a constraint
-- to block them. The client validates against the known set.

alter table public.calendar_events
  add column if not exists event_type text not null default 'other',
  add column if not exists client_id  uuid references public.clients(id) on delete set null,
  add column if not exists all_day    boolean not null default false;

-- The calendar fetches a visible date range per business; index the columns
-- those queries filter/sort on.
create index if not exists calendar_events_business_start_idx
  on public.calendar_events (business_id, start_time);
