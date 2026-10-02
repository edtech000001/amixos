-- 245_dock_apps_per_user_business.sql
-- Mobile dock (bottom nav) app selection, scoped PER USER PER BUSINESS.
--
-- Supersedes profiles.dock_apps (071) — per-user, but shared across every
-- business that user belongs to, so pinning Inventario in one business changed
-- the dock in all of them. Which apps are even ELIGIBLE differs per business
-- (enabled modules, and the user's role there), so one global list was wrong.
--
-- Mirrors 157, which fixed the identical bug for the dashboard widget layout.
-- profiles.dock_apps (071) is left in place, unused, for a clean rollback.
--
-- RLS: a user only ever sees/writes their own rows (user_id = auth.uid()).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.user_dock_apps (
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  keys        jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table public.user_dock_apps enable row level security;

drop policy if exists "own dock apps" on public.user_dock_apps;
create policy "own dock apps" on public.user_dock_apps
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Backfill: give every membership the user's current global dock, so nobody's
-- dock resets on upgrade. Each row is independent from here on — changing one
-- business's dock no longer touches the others. Rows whose keys are not a JSON
-- array are skipped (the column is free-form jsonb; the app only ever wrote
-- arrays, but a non-array would violate the client parser's expectations).
insert into public.user_dock_apps (user_id, business_id, keys)
select bm.user_id, bm.business_id, p.dock_apps
  from public.business_members bm
  join public.profiles p on p.id = bm.user_id
 where p.dock_apps is not null
   and jsonb_typeof(p.dock_apps) = 'array'
on conflict (user_id, business_id) do nothing;
