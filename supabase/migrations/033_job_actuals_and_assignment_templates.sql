-- Migration 033: Job actuals (Project Leader workflow) + per-worker custom fields
-- Run in Supabase SQL Editor
--
-- Adds the "Owner schedules → Project Leader logs actuals" workflow:
--   1. job_assignments — per-worker actuals (hours_worked, custom_fields) + is_lead marker
--   2. businesses      — crew-mode toggle + assignment_field_required/order settings
--   3. job_assignment_field_templates — per-worker custom-field templates
--                                       (mirror of client_field_templates pattern)
--   4. RLS extension   — allow the lead (field role) to update assignments on their job
--
-- Module-aware: driver/mileage/drove_hours are NOT hardcoded columns. Each business
-- defines its own per-worker fields via job_assignment_field_templates so non-crew
-- industries (HVAC, mechanic, salon) can flip job_crew_mode off and never see crew UI.

-- ── 1. job_assignments — per-worker actuals + lead flag ─────────────────────
alter table public.job_assignments
  add column if not exists is_lead       boolean not null default false,
  add column if not exists hours_worked  numeric(6,2),
  add column if not exists custom_fields jsonb   not null default '{}'::jsonb,
  add column if not exists logged_at     timestamptz,
  add column if not exists logged_by     uuid references auth.users(id) on delete set null;

comment on column public.job_assignments.is_lead is
  'Marks the Project Leader for this job. Partial unique index enforces at most one per job.';
comment on column public.job_assignments.custom_fields is
  'Per-worker values keyed by job_assignment_field_templates.field_key';

-- At most one lead per job. Partial unique so non-lead rows are unconstrained.
create unique index if not exists idx_job_assignments_one_lead_per_job
  on public.job_assignments(job_id) where is_lead = true;

-- Quick lookup: "jobs where I am the lead" — drives the "Mis Trabajos" screen.
create index if not exists idx_job_assignments_employee_lead
  on public.job_assignments(employee_id) where is_lead = true;

-- ── 2. businesses — module-aware toggles ────────────────────────────────────
alter table public.businesses
  add column if not exists job_crew_mode             boolean not null default true,
  add column if not exists assignment_field_required jsonb   not null default '{}'::jsonb,
  add column if not exists assignment_field_order    jsonb   default null;

comment on column public.businesses.job_crew_mode is
  'When false, hides lead-marking and per-worker actuals UI (solo-tech industries).';
comment on column public.businesses.assignment_field_required is
  'Which standard per-worker fields are required. Object keyed by field_key.';
comment on column public.businesses.assignment_field_order is
  'User-defined order of per-worker fields. Mixed array of field_key strings and "custom:<template_uuid>" refs.';

-- ── 3. job_assignment_field_templates (mirror of client_field_templates) ────
create table if not exists public.job_assignment_field_templates (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  field_key     text not null,
  field_label   text not null,
  field_type    text not null default 'text'
                  check (field_type in ('text','number','date','boolean','select')),
  field_options text[],
  required      boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(business_id, field_key)
);

create index if not exists idx_job_assignment_field_templates_business
  on public.job_assignment_field_templates(business_id, sort_order);

alter table public.job_assignment_field_templates enable row level security;

create policy "members read job_assignment_field_templates"
  on public.job_assignment_field_templates for select
  using (public.is_business_member(business_id));
create policy "admin write job_assignment_field_templates"
  on public.job_assignment_field_templates for insert
  with check (public.is_business_admin(business_id));
create policy "admin update job_assignment_field_templates"
  on public.job_assignment_field_templates for update
  using (public.is_business_admin(business_id));
create policy "admin delete job_assignment_field_templates"
  on public.job_assignment_field_templates for delete
  using (public.is_business_admin(business_id));

-- updated_at trigger (set_updated_at() comes from migration 008).
drop trigger if exists set_job_assignment_field_templates_updated_at
  on public.job_assignment_field_templates;
create trigger set_job_assignment_field_templates_updated_at
  before update on public.job_assignment_field_templates
  for each row execute procedure public.set_updated_at();

-- ── 4. RLS — allow lead (field role) to update assignments on THEIR job ─────
-- 022 already has "manager+ update job_assignments". This policy is additive —
-- UPDATE policies are OR'd, so manager+ paths still work for office staff.
drop policy if exists "lead update job_assignments" on public.job_assignments;
create policy "lead update job_assignments" on public.job_assignments for update
  using (
    exists (
      select 1
        from public.jobs j
        join public.job_assignments lead_row on lead_row.job_id = j.id
        join public.employees e on e.id = lead_row.employee_id
       where j.id = job_assignments.job_id
         and lead_row.is_lead = true
         and e.user_id = auth.uid()
    )
  );
-- Intentionally NOT adding INSERT/DELETE for leads: a lead can edit recorded
-- actuals but cannot change WHO was on the job. Managers+ still own the roster.
