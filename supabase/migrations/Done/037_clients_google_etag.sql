-- Migration 037: Cache the Google People API etag per client
-- Run in Supabase SQL Editor
--
-- Background: every `update` on a Google contact previously needed two
-- API calls — a GET to fetch the contact's current `etag` (Google's
-- optimistic-concurrency token) and a PATCH to apply changes. That
-- doubled API consumption per update, and at the throttle that kept us
-- under the 60/min write quota, we were still hitting the 60/min
-- "Critical read requests" quota on bulk re-applies of the notes
-- template.
--
-- With this column, the API caches the etag locally after every
-- successful create/update. Subsequent updates skip the GET and use the
-- cached value. If the cached etag is stale (PATCH returns 412), the
-- API falls back to GET + retry once.
--
-- NULL is safe and treated as "no cache yet — do the GET as before."

alter table public.clients
  add column if not exists google_etag text;

comment on column public.clients.google_etag is
  'Latest etag returned by the Google People API for this contact. Cached so updates can skip the GET-then-PATCH dance.';
