-- 182_perf_indexes.sql
-- Performance overhaul, part 2 of 2 (run 181_perf_rls_rpcs.sql FIRST).
--
-- ⚠️ RUN EACH STATEMENT INDIVIDUALLY. `CREATE INDEX CONCURRENTLY` cannot run
-- inside a transaction, and the SQL Editor wraps multi-statement runs in one.
-- Select one statement at a time and execute it (Cmd/Ctrl+Enter runs the
-- selection). Run during low traffic — the GIN builds are the slowest.
--
-- If a CONCURRENTLY build fails it leaves an INVALID index; fix with
--   drop index if exists <name>;  then re-run the create.
-- Check for invalid indexes:  select indexrelid::regclass from pg_index where not indisvalid;
--
-- What each index serves:
--   jobs list sort/filter, job_assignments embeds + RLS assigned-jobs lookup,
--   the business_members probe on EVERY RLS initplan helper, roster/picker
--   filters, tables that had zero indexes (client_contacts, timesheets), other
--   lists' sort orders, and trigram indexes so ilike '%term%' search stops
--   seq-scanning.

-- ── jobs: the list's actual sort + core filters ──────────────────────────────
create index concurrently if not exists jobs_business_created_id_idx
  on public.jobs (business_id, created_at desc, id desc);

create index concurrently if not exists jobs_business_status_idx
  on public.jobs (business_id, status) where archived_at is null;

create index concurrently if not exists jobs_business_sched_idx
  on public.jobs (business_id, scheduled_date);

create index concurrently if not exists jobs_client_id_idx
  on public.jobs (client_id) where client_id is not null;

-- ── job_assignments: embeds + RLS my_assigned_job_ids + crew search ─────────
create index concurrently if not exists job_assignments_job_id_idx
  on public.job_assignments (job_id);

create index concurrently if not exists job_assignments_employee_id_idx
  on public.job_assignments (employee_id);

create index concurrently if not exists job_assignments_business_id_idx
  on public.job_assignments (business_id);

-- ── RLS hot path: every initplan helper probes business_members by user ─────
create index concurrently if not exists business_members_user_id_idx
  on public.business_members (user_id);

create index concurrently if not exists employees_user_id_idx
  on public.employees (user_id) where user_id is not null;

create index concurrently if not exists employees_business_active_idx
  on public.employees (business_id, active);

-- ── tables that had ZERO indexes ────────────────────────────────────────────
create index concurrently if not exists client_contacts_client_id_idx
  on public.client_contacts (client_id);

create index concurrently if not exists client_contacts_business_id_idx
  on public.client_contacts (business_id);

create index concurrently if not exists timesheets_business_date_idx
  on public.timesheets (business_id, work_date desc);

create index concurrently if not exists timesheets_employee_id_idx
  on public.timesheets (employee_id);

create index concurrently if not exists timesheets_business_open_idx
  on public.timesheets (business_id) where clock_out is null;

-- ── other lists' sort orders ────────────────────────────────────────────────
create index concurrently if not exists invoices_business_created_id_idx
  on public.invoices (business_id, created_at desc, id desc);

create index concurrently if not exists invoices_business_status_idx
  on public.invoices (business_id, status);

create index concurrently if not exists invoices_business_paid_at_idx
  on public.invoices (business_id, paid_at) where status = 'paid';

create index concurrently if not exists clients_business_name_idx
  on public.clients (business_id, last_name, first_name, id);

create index concurrently if not exists equipment_business_name_idx
  on public.equipment (business_id, name, id);

-- ── trigram search (requires pg_trgm — created in 181) ──────────────────────
create index concurrently if not exists jobs_title_trgm_idx
  on public.jobs using gin (title gin_trgm_ops);

create index concurrently if not exists jobs_external_ref_trgm_idx
  on public.jobs using gin (external_ref gin_trgm_ops);

create index concurrently if not exists jobs_estimate_number_trgm_idx
  on public.jobs using gin (estimate_number gin_trgm_ops);

create index concurrently if not exists jobs_city_trgm_idx
  on public.jobs using gin (job_city gin_trgm_ops);

create index concurrently if not exists clients_name_trgm_idx
  on public.clients using gin (
    (coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(company,'')) gin_trgm_ops
  );

create index concurrently if not exists job_assignments_worker_trgm_idx
  on public.job_assignments using gin (worker_name gin_trgm_ops);

create index concurrently if not exists employees_name_trgm_idx
  on public.employees using gin (
    (coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops
  );
