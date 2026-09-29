-- Migration 008: Expanded client fields + custom field templates
-- Run this in the Supabase SQL Editor

-- ── 1. Add new columns to clients ──────────────────────────────────────────
alter table public.clients
  add column if not exists company        text,
  add column if not exists phone_cell     text,
  add column if not exists phone_office   text,
  add column if not exists address_line2  text,
  add column if not exists city           text,
  add column if not exists state          text,
  add column if not exists zip_code       text,
  add column if not exists email_office   text,
  add column if not exists email_home     text,
  add column if not exists custom_fields  jsonb default '{}'::jsonb;

-- Rename existing `phone` → `phone_cell` for new users; keep `phone` for backwards compat
-- (we keep both; phone_cell is the new canonical field, phone is legacy)
-- Rename existing `email` → `email_office` for backwards compat
-- (keep both; we'll show email in the UI from either field)

-- ── 2. Custom field templates (per business) ────────────────────────────────
create table if not exists public.client_field_templates (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  field_key   text not null,         -- slug used as JSON key: "license_number"
  field_label text not null,         -- display label: "Número de Licencia"
  field_type  text not null default 'text',  -- text | number | date | boolean | select
  field_options text[],              -- for select type: list of options
  required    boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(business_id, field_key)
);

-- RLS
alter table public.client_field_templates enable row level security;

drop policy if exists "owner manage templates" on public.client_field_templates;
create policy "owner manage templates"
  on public.client_field_templates
  for all
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = client_field_templates.business_id
        and businesses.owner_id = auth.uid()
    )
  );

-- ── 3. updated_at trigger for templates ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_client_field_templates_updated_at on public.client_field_templates;
create trigger set_client_field_templates_updated_at
  before update on public.client_field_templates
  for each row execute procedure public.set_updated_at();
