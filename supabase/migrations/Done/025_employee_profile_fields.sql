-- Migration 025: Employee profile fields + custom-field templates
-- Run in Supabase SQL Editor
--
-- Adds the "HR-ish" fields that get captured when someone is hired
-- (address, birthday, hire date, emergency contact, personal email) plus
-- a custom_fields JSONB column and a templates table mirroring the
-- client_field_templates pattern. Anything not covered by the standard
-- fields can be modeled as a custom field per business.

-- ── 1. Add standard fields to employees ──────────────────────────────────────
alter table public.employees
  add column if not exists email                   text,
  add column if not exists birthday                date,
  add column if not exists hire_date               date,
  add column if not exists address                 text,
  add column if not exists city                    text,
  add column if not exists state                   text,
  add column if not exists zip_code                text,
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text,
  add column if not exists custom_fields           jsonb not null default '{}'::jsonb;

comment on column public.employees.email                   is 'Personal email (separate from any app-login email)';
comment on column public.employees.birthday                is 'Date of birth — used for age + anniversary reminders';
comment on column public.employees.hire_date               is 'Date of hire — distinct from created_at (record can be created later)';
comment on column public.employees.custom_fields           is 'Per-employee values keyed by employee_field_templates.field_key';

-- ── 2. Templates table (mirrors client_field_templates) ──────────────────────
create table if not exists public.employee_field_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field_key   text not null,                       -- slug used as JSON key
  field_label text not null,                       -- display label
  field_type  text not null default 'text'
                check (field_type in ('text','number','date','boolean','select')),
  field_options text[],                            -- for 'select' type
  required    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(business_id, field_key)
);

create index if not exists idx_employee_field_templates_business
  on public.employee_field_templates(business_id, sort_order);

-- ── 3. RLS — manager+ for read & write (mirrors employees policies) ──────────
alter table public.employee_field_templates enable row level security;

create policy "manager+ read employee_field_templates"
  on public.employee_field_templates for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));

create policy "manager+ write employee_field_templates"
  on public.employee_field_templates for insert
  with check (public.has_business_role(business_id, array['owner','admin','manager']));

create policy "manager+ update employee_field_templates"
  on public.employee_field_templates for update
  using (public.has_business_role(business_id, array['owner','admin','manager']));

create policy "admin delete employee_field_templates"
  on public.employee_field_templates for delete
  using (public.is_business_admin(business_id));

-- ── 4. updated_at trigger ────────────────────────────────────────────────────
-- public.set_updated_at() already exists from migration 008.
drop trigger if exists set_employee_field_templates_updated_at on public.employee_field_templates;
create trigger set_employee_field_templates_updated_at
  before update on public.employee_field_templates
  for each row execute procedure public.set_updated_at();
