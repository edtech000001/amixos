-- 137_import_logs.sql
-- Import audit trail: one row per import run (any of the 8 hub steps) with
-- the file name, counts and who/when — the hub shows the 10 most recent so
-- there's always a record of what was loaded.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.import_logs (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  -- clients | employees | jobs | photos | invoices | payroll | equipment | inventory
  mode         text not null,
  file_name    text,
  success      integer not null default 0,
  updated      integer not null default 0,
  skipped      integer not null default 0,
  failed       integer not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists import_logs_business_created_idx
  on public.import_logs (business_id, created_at desc);

alter table public.import_logs enable row level security;

-- Importing is a writer-role activity; the log follows the same gate.
drop policy if exists "writers read import_logs" on public.import_logs;
create policy "writers read import_logs" on public.import_logs for select
  using (public.can_write_business(business_id));

drop policy if exists "writers insert import_logs" on public.import_logs;
create policy "writers insert import_logs" on public.import_logs for insert
  with check (public.can_write_business(business_id));
