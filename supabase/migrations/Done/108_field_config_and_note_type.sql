-- Custom-field upgrades:
--  1. field_config JSONB on every *_field_templates table. Per-field options:
--       { "integerOnly": true }  — number fields: whole numbers only
--       { "multi": true }        — select fields: allow multiple selections
--     (stored value is the selected options comma-joined: "A, B")
--  2. New 'note' field_type (long multiline text) — extend the CHECK
--     constraints that previously allowed only text|number|date|boolean|select.
--
-- Run manually in the Supabase SQL Editor.

-- ── 1. field_config column ─────────────────────────────────────────────────
alter table client_field_templates
  add column if not exists field_config jsonb not null default '{}'::jsonb;
alter table employee_field_templates
  add column if not exists field_config jsonb not null default '{}'::jsonb;
alter table job_field_templates
  add column if not exists field_config jsonb not null default '{}'::jsonb;
alter table job_assignment_field_templates
  add column if not exists field_config jsonb not null default '{}'::jsonb;
alter table invoice_field_templates
  add column if not exists field_config jsonb not null default '{}'::jsonb;

-- ── 2. allow the new 'note' type ───────────────────────────────────────────
-- client_field_templates historically had NO check constraint (008) — add one
-- now for consistency (existing rows only ever held the five legacy types).
alter table client_field_templates
  drop constraint if exists client_field_templates_field_type_check;
alter table client_field_templates
  add constraint client_field_templates_field_type_check
  check (field_type in ('text', 'note', 'number', 'date', 'boolean', 'select'));

alter table employee_field_templates
  drop constraint if exists employee_field_templates_field_type_check;
alter table employee_field_templates
  add constraint employee_field_templates_field_type_check
  check (field_type in ('text', 'note', 'number', 'date', 'boolean', 'select'));

alter table job_field_templates
  drop constraint if exists job_field_templates_field_type_check;
alter table job_field_templates
  add constraint job_field_templates_field_type_check
  check (field_type in ('text', 'note', 'number', 'date', 'boolean', 'select'));

alter table job_assignment_field_templates
  drop constraint if exists job_assignment_field_templates_field_type_check;
alter table job_assignment_field_templates
  add constraint job_assignment_field_templates_field_type_check
  check (field_type in ('text', 'note', 'number', 'date', 'boolean', 'select'));

alter table invoice_field_templates
  drop constraint if exists invoice_field_templates_field_type_check;
alter table invoice_field_templates
  add constraint invoice_field_templates_field_type_check
  check (field_type in ('text', 'note', 'number', 'date', 'boolean', 'select'));
