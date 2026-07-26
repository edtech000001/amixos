-- 163_more_keyset_indexes.sql
-- Extends keyset (id-cursor) pagination to the remaining big lists — employees,
-- equipment, inventory_items — which the app now loads with
-- `.eq('business_id', X).gt('id', cursor).order('id').limit(1000)` instead of
-- OFFSET paging. These composite (business_id, id) indexes keep each page a
-- bounded index range-scan. Companion to 162 (jobs/clients/invoices).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create index if not exists employees_business_id_keyset_idx  on public.employees       (business_id, id);
create index if not exists equipment_business_id_keyset_idx  on public.equipment       (business_id, id);
create index if not exists inventory_business_id_keyset_idx  on public.inventory_items (business_id, id);
