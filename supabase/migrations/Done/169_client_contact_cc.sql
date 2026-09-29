-- Per-contact "CC on invoices" flag.
--
-- When an invoice is sent to a client, every one of that client's contacts
-- flagged cc_on_invoices = true (and with an email) is auto-added to the CC
-- line — so a client that always copies their bookkeeper/partner is set up
-- once and remembered on every send.
alter table public.client_contacts
  add column if not exists cc_on_invoices boolean not null default false;

comment on column public.client_contacts.cc_on_invoices is
  'Auto-CC this contact''s email when sending an invoice to the client.';
