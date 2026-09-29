-- Migration 027: Employee field config (required + unified order) on businesses
-- Run in Supabase SQL Editor
--
-- Mirrors the clients pattern (client_field_required + client_field_order):
--   - employee_field_required: which standard employee fields are mandatory
--     on save. JSONB object keyed by field_key (e.g. {"email": true}).
--   - employee_field_order: the unified display order of standard fields and
--     custom-field templates. Mixed array of strings:
--       "first_name", "phone", "email", ...    ← standard field keys
--       "custom:<template_uuid>"               ← refers to a row in
--                                                employee_field_templates
--
-- NULL on either column means "use the hardcoded default". Items missing
-- from a saved order get auto-appended on render.

alter table public.businesses
  add column if not exists employee_field_required jsonb not null default '{}'::jsonb,
  add column if not exists employee_field_order    jsonb default null;

comment on column public.businesses.employee_field_required is
  'Which standard employee fields are required at save time. Object keyed by field_key.';
comment on column public.businesses.employee_field_order is
  'User-defined order of employee fields in Ajustes. Mixed array of field_key strings and "custom:<template_uuid>" refs.';
