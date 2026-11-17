-- 284_contact_cc_invoices_only.sql
-- "CC this person on: Off · Invoices only · All emails" for client contacts.
-- cc_on_invoices (despite its name) means "CC on all emails" today; this flag
-- narrows it to invoices only — e.g. the client's accounts-payable assistant
-- gets every invoice but not proposals or general email.
-- Existing CC contacts keep "All emails" (default false).
--
-- Run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.client_contacts
  add column if not exists cc_invoices_only boolean not null default false;

comment on column public.client_contacts.cc_invoices_only is
  'With cc_on_invoices: CC only on invoice emails (not proposals / general email).';
