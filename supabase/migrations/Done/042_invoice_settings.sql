-- 042_invoice_settings.sql
-- Invoice settings: a default due-date window, per-invoice custom fields, and
-- custom field templates (mirrors client/job field templates).
--
--   - businesses.invoice_due_days: when set (e.g. 15), new invoices auto-fill
--     the due date that many days out from the issue date. null = no default.
--   - invoices.custom_fields: JSONB map of custom field values per invoice.
--   - invoice_field_templates: the per-business custom field definitions,
--     each with a `required` flag and `sort_order` (same shape as the other
--     *_field_templates tables).
--
-- The default invoice notes/terms already live on businesses.invoice_notes_default
-- (migration 040) — this migration doesn't touch that; the Invoice settings UI
-- just relocates where it's edited.
--
-- All add-if-not-exists / create-if-not-exists, safe to re-run. Run manually
-- in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists invoice_due_days integer;

alter table public.invoices
  add column if not exists custom_fields jsonb;

create table if not exists public.invoice_field_templates (
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

create index if not exists idx_invoice_field_templates_business
  on public.invoice_field_templates(business_id, sort_order);

alter table public.invoice_field_templates enable row level security;

drop policy if exists "members read invoice_field_templates" on public.invoice_field_templates;
create policy "members read invoice_field_templates"
  on public.invoice_field_templates for select
  using (public.is_business_member(business_id));
drop policy if exists "admin write invoice_field_templates" on public.invoice_field_templates;
create policy "admin write invoice_field_templates"
  on public.invoice_field_templates for insert
  with check (public.is_business_admin(business_id));
drop policy if exists "admin update invoice_field_templates" on public.invoice_field_templates;
create policy "admin update invoice_field_templates"
  on public.invoice_field_templates for update
  using (public.is_business_admin(business_id));
drop policy if exists "admin delete invoice_field_templates" on public.invoice_field_templates;
create policy "admin delete invoice_field_templates"
  on public.invoice_field_templates for delete
  using (public.is_business_admin(business_id));

-- updated_at trigger (set_updated_at() comes from migration 008).
drop trigger if exists set_invoice_field_templates_updated_at on public.invoice_field_templates;
create trigger set_invoice_field_templates_updated_at
  before update on public.invoice_field_templates
  for each row execute procedure public.set_updated_at();
