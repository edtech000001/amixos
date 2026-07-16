-- 144_field_label_translations.sql
-- Bilingual custom-field labels. Each custom-field template gets optional
-- per-locale label overrides; the existing `field_label` stays as the
-- always-present fallback (shown when a locale has no override), so existing
-- single-language fields keep working untouched.
--
--   field_label_es → label shown to Spanish (es) users
--   field_label_en → label shown to English (en) users
--   field_label    → fallback when the matching override is empty
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

alter table public.client_field_templates
  add column if not exists field_label_es text,
  add column if not exists field_label_en text;

alter table public.employee_field_templates
  add column if not exists field_label_es text,
  add column if not exists field_label_en text;

alter table public.job_field_templates
  add column if not exists field_label_es text,
  add column if not exists field_label_en text;

alter table public.invoice_field_templates
  add column if not exists field_label_es text,
  add column if not exists field_label_en text;

alter table public.job_assignment_field_templates
  add column if not exists field_label_es text,
  add column if not exists field_label_en text;
