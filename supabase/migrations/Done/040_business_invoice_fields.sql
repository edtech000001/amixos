-- Business profile fields for invoice / estimate creation.
--
-- address, city, state, postal_code, country, logo_url already exist on
-- public.businesses (001_initial_schema). This adds the contact, tax/legal,
-- and invoicing fields so the data is available when generating invoices.
--
-- Run manually in the Supabase SQL Editor. All add-if-not-exists, so safe to
-- re-run.

alter table public.businesses
  add column if not exists email                 text,
  add column if not exists phone                 text,
  add column if not exists website               text,
  add column if not exists tax_id                text,
  add column if not exists license_number        text,
  add column if not exists invoice_notes_default  text;
