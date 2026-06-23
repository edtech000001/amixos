-- 091_data_import.sql
-- Legacy data import (AppSheet projects + FileMaker invoices).
--
-- Two columns make the migration work:
--  1. jobs.external_ref / invoices.external_ref — the OLD system's id
--     (e.g. AppSheet "Proyecto-8384902e", FileMaker invoice "257556"). This is
--     (a) the link key: the invoice sheet references a job's Project ID so the
--     importer can find the freshly-created job, and (b) an idempotency key: a
--     re-run skips rows whose external_ref already exists instead of duplicating.
--  2. jobs.crew_names / jobs.driver_names — a TEXT snapshot of every worker /
--     driver name on the job. Crew normally lives in job_assignments (FK to
--     employees), but a deleted employee cascades that row away and the name is
--     lost. The snapshot keeps the historical name on the job forever, whether
--     or not the worker matched an employee record.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- 1. External reference ids (old-system primary keys).
alter table public.jobs
  add column if not exists external_ref text;

alter table public.invoices
  add column if not exists external_ref text;

-- 2. Historical crew/driver name snapshots (survive employee deletion).
alter table public.jobs
  add column if not exists crew_names   text[] not null default '{}',
  add column if not exists driver_names text[] not null default '{}';

comment on column public.jobs.external_ref is
  'Legacy id from the imported system (e.g. AppSheet Proyecto-xxxx). Link + idempotency key for data import.';
comment on column public.jobs.crew_names is
  'Snapshot of all worker names on this job, kept for history even if the matched employee is later deleted.';
comment on column public.jobs.driver_names is
  'Snapshot of all driver names on this job, kept for history even if the matched employee is later deleted.';
comment on column public.invoices.external_ref is
  'Legacy invoice number/id from the imported system (e.g. FileMaker 257556). Idempotency key for data import.';

-- 3. Lookup/idempotency indexes. Partial (external_ref not null) so they only
--    cover imported rows and stay tiny. NOT unique — a re-run looks the row up
--    and skips it in app code, and we never want a stray duplicate id to hard-
--    fail an otherwise-good import batch.
create index if not exists jobs_business_external_ref_idx
  on public.jobs (business_id, external_ref)
  where external_ref is not null;

create index if not exists invoices_business_external_ref_idx
  on public.invoices (business_id, external_ref)
  where external_ref is not null;
