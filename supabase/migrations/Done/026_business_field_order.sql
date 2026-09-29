-- Migration 026: Persist user-controlled order of client fields (standard + custom)
-- Run in Supabase SQL Editor
--
-- A single JSONB array of identifiers controls the display order of BOTH
-- standard fields and custom-field templates in Ajustes → Clientes — so
-- users can interleave them (e.g. put a custom field above a default one).
--
-- Entry shape:
--   - "first_name", "phone_cell", "city", ...   ← standard field keys
--   - "custom:<template_uuid>"                 ← refers to a row in
--                                                client_field_templates
--
-- A NULL value falls back to the hardcoded standard order followed by
-- existing custom templates. Items missing from the saved order get
-- auto-appended on render, so deleting/adding a template never silently
-- drops from view.

alter table public.businesses
  add column if not exists client_field_order jsonb default null;

comment on column public.businesses.client_field_order is
  'User-defined order of client fields in Ajustes. Mixed array of standard field_key strings and "custom:<template_uuid>" refs.';
