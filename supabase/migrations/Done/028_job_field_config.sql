-- Migration 028: Job field config + custom-field templates
-- Run in Supabase SQL Editor
--
-- Brings jobs to parity with clients/employees for custom fields:
--   1. job_field_templates — per-business custom field definitions
--   2. jobs.custom_fields    — per-job JSONB of template_key → value
--   3. businesses.job_field_required + job_field_order — settings UI
--
-- See migrations 008 (client_field_templates) and 025 (employee_field_templates)
-- for the same pattern.

-- ── 1. Templates table ───────────────────────────────────────────────────────
create table if not exists public.job_field_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field_key   text not null,
  field_label text not null,
  field_type  text not null default 'text'
                check (field_type in ('text','number','date','boolean','select')),
  field_options text[],
  required    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(business_id, field_key)
);

create index if not exists idx_job_field_templates_business
  on public.job_field_templates(business_id, sort_order);

alter table public.job_field_templates enable row level security;

-- RLS: same role gating as the jobs table. Managers+ read & write,
-- admin can delete.
create policy "manager+ read job_field_templates" on public.job_field_templates for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));
create policy "manager+ write job_field_templates" on public.job_field_templates for insert
  with check (public.has_business_role(business_id, array['owner','admin','manager']));
create policy "manager+ update job_field_templates" on public.job_field_templates for update
  using (public.has_business_role(business_id, array['owner','admin','manager']));
create policy "admin delete job_field_templates" on public.job_field_templates for delete
  using (public.is_business_admin(business_id));

-- updated_at trigger (set_updated_at() comes from migration 008).
drop trigger if exists set_job_field_templates_updated_at on public.job_field_templates;
create trigger set_job_field_templates_updated_at
  before update on public.job_field_templates
  for each row execute procedure public.set_updated_at();

-- ── 2. Per-job custom_fields JSONB ───────────────────────────────────────────
alter table public.jobs
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on column public.jobs.custom_fields is
  'Per-job values keyed by job_field_templates.field_key';

-- ── 3. Business-level job-field config ───────────────────────────────────────
alter table public.businesses
  add column if not exists job_field_required jsonb not null default '{}'::jsonb,
  add column if not exists job_field_order    jsonb default null;

comment on column public.businesses.job_field_required is
  'Which standard job fields are required at save time. Object keyed by field_key.';
comment on column public.businesses.job_field_order is
  'User-defined order of job fields in Ajustes. Mixed array of field_key strings and "custom:<template_uuid>" refs.';
