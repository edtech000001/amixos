-- 098_enterprise_leads.sql
-- Captures "Contact sales" leads from the Enterprise (50+) plan card in the
-- pricing modal. The in-app lead form inserts one row per submission.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.enterprise_leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- The submitting user / active workspace, when known (form is in Settings).
  user_id       uuid references auth.users (id) on delete set null,
  business_id   uuid references public.businesses (id) on delete set null,
  contact_name  text,
  business_name text,
  email         text,
  phone         text,
  team_size     text,
  message       text
);

alter table public.enterprise_leads enable row level security;

-- Authenticated users may submit their own lead (user_id must be themselves).
-- No SELECT/UPDATE/DELETE policy → only the service role can read leads.
drop policy if exists "enterprise_leads_insert_own" on public.enterprise_leads;
create policy "enterprise_leads_insert_own"
  on public.enterprise_leads
  for insert
  to authenticated
  with check (user_id = auth.uid());
