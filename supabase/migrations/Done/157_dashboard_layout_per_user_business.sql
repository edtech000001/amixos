-- 157_dashboard_layout_per_user_business.sql
-- Dashboard widget layout, scoped PER USER PER BUSINESS.
--
-- Supersedes 156 (which put it on profiles.dashboard_layout — per-user but
-- shared across all of a user's businesses). This dedicated table keys the
-- layout on (user_id, business_id), so the same person can arrange their home
-- differently in each business they belong to, and one member's layout never
-- affects another's. profiles.dashboard_layout (156) and
-- businesses.dashboard_layout (049) are both left in place, unused, for a
-- clean rollback.
--
-- RLS: a user only ever sees/writes their own rows (user_id = auth.uid()).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- Safe to run whether or not 156 was applied.

create table if not exists public.user_dashboard_layouts (
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  layout      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table public.user_dashboard_layouts enable row level security;

drop policy if exists "own dashboard layouts" on public.user_dashboard_layouts;
create policy "own dashboard layouts" on public.user_dashboard_layouts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Backfill each business OWNER's current layout so their view doesn't reset.
-- (Non-owners start on the role default and customize independently.) Sourced
-- from businesses.dashboard_layout — the same value 156 copied into profiles
-- for owners — so this works whether or not 156 was applied.
insert into public.user_dashboard_layouts (user_id, business_id, layout)
select b.owner_id, b.id, b.dashboard_layout
  from public.businesses b
 where b.dashboard_layout is not null
on conflict (user_id, business_id) do nothing;
