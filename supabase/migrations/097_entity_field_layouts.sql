-- 097_entity_field_layouts.sql
-- Bring the jobs field-config model (section layout + per-field show/hide) to
-- clients, employees and invoices.
--
-- For each entity, two JSONB columns on businesses (mirroring job_field_layout /
-- job_field_hidden):
--   <entity>_field_layout  — ordered [{key, section}]; array order = within-
--                            section order. null = built-in default layout.
--   <entity>_field_hidden  — { field_key: true } for fields hidden on the form.
--
-- Sections per entity are defined in shared/src/lib/<entity>FieldSections.ts.
-- Custom fields default into each entity's 'additional' section.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists client_field_layout   jsonb,
  add column if not exists client_field_hidden   jsonb,
  add column if not exists employee_field_layout jsonb,
  add column if not exists employee_field_hidden jsonb,
  add column if not exists invoice_field_layout  jsonb,
  add column if not exists invoice_field_hidden  jsonb;

comment on column public.businesses.client_field_layout   is 'Ordered client-form field layout: [{key,section}]. null = default.';
comment on column public.businesses.client_field_hidden   is 'Client fields hidden on the form: { field_key: true }.';
comment on column public.businesses.employee_field_layout is 'Ordered employee-form field layout: [{key,section}]. null = default.';
comment on column public.businesses.employee_field_hidden is 'Employee fields hidden on the form: { field_key: true }.';
comment on column public.businesses.invoice_field_layout  is 'Ordered invoice-form field layout: [{key,section}]. null = default.';
comment on column public.businesses.invoice_field_hidden  is 'Invoice fields hidden on the form: { field_key: true }.';
