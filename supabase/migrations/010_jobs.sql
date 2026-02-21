-- Migration 010: Jobs / Work Orders module
-- Run in Supabase SQL Editor

-- ── 1. Jobs table ────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  invoice_id      uuid references public.invoices(id) on delete set null,

  -- Core fields
  title           text not null,
  description     text,
  status          text not null default 'scheduled'
                    check (status in ('scheduled','in_progress','completed','cancelled','invoiced')),
  priority        text not null default 'normal'
                    check (priority in ('low','normal','high','urgent')),

  -- Location
  job_address     text,
  job_city        text,
  job_state       text,

  -- Scheduling
  scheduled_date  date,
  time_start      time,
  time_end        time,
  completed_date  date,

  -- Financial summary (computed/cached)
  total_amount    numeric(10,2) not null default 0,

  -- Notes
  internal_notes  text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 2. Job assignments (which employees are on this job) ─────────────────────
create table if not exists public.job_assignments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  worker_name text,   -- fallback if no employee record
  role_note   text,   -- "lead", "helper", etc.
  created_at  timestamptz not null default now()
);

-- ── 3. Job line items (labor + materials) ────────────────────────────────────
create table if not exists public.job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  item_type   text not null default 'labor'
                check (item_type in ('labor','material','equipment','other')),
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null default 0,
  total       numeric(10,2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz not null default now()
);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_items enable row level security;

-- Jobs: owner only
create policy "owner manage jobs"
  on public.jobs for all
  using (exists (
    select 1 from public.businesses
    where businesses.id = jobs.business_id
      and businesses.owner_id = auth.uid()
  ));

-- Job assignments: via job's business
create policy "owner manage job_assignments"
  on public.job_assignments for all
  using (exists (
    select 1 from public.jobs j
    join public.businesses b on b.id = j.business_id
    where j.id = job_assignments.job_id
      and b.owner_id = auth.uid()
  ));

-- Job items: via job's business
create policy "owner manage job_items"
  on public.job_items for all
  using (exists (
    select 1 from public.jobs j
    join public.businesses b on b.id = j.business_id
    where j.id = job_items.job_id
      and b.owner_id = auth.uid()
  ));

-- ── 5. updated_at trigger ────────────────────────────────────────────────────
drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
  before update on public.jobs
  for each row execute procedure public.set_updated_at();
