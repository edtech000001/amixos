-- 162_list_keyset_indexes.sql
-- Supports keyset (id-cursor) pagination for the big dashboard lists. The app
-- now loads jobs/clients/invoices with `.eq('business_id', X).gt('id', cursor)
-- .order('id').limit(1000)` instead of OFFSET paging, so each page is a bounded
-- index range-scan. These composite (business_id, id) indexes let Postgres jump
-- straight to the next slice for a business instead of scanning the global id PK
-- and filtering — keeping every page fast as the tables grow.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- (Non-concurrent CREATE INDEX briefly locks the table; fine at current sizes.
--  For very large tables you can instead run each as CREATE INDEX CONCURRENTLY
--  outside a transaction.)

create index if not exists jobs_business_id_keyset_idx     on public.jobs           (business_id, id);
create index if not exists clients_business_id_keyset_idx  on public.clients        (business_id, id);
create index if not exists invoices_business_id_keyset_idx on public.invoices       (business_id, id);
