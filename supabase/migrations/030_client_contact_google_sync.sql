-- 030_client_contact_google_sync.sql
-- Track Google Contacts sync state on client_contacts (the secondary people
-- attached to a client — e.g. the project manager, the foreman). Each one
-- gets its own Google contact, organization = parent client's company,
-- biography = "Employee of {client name}". Mirrors what clients already do
-- via clients.google_resource_name.
--
-- Idempotent: safe to re-run.

alter table public.client_contacts
  add column if not exists google_resource_name text;

comment on column public.client_contacts.google_resource_name is
  'The People API resourceName (people/cXXX) of the matching Google contact, set after sync. NULL = not synced yet.';
