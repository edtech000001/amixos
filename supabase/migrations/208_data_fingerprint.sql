-- 208 — data_fingerprint(): cheap "has anything changed?" probe for the cache
--
-- The app caches screen payloads (shared/src/lib/swrCache.ts) and revalidates
-- in the background. That is right for hot data, but wasteful for screens that
-- change rarely — Empleados, Archivos, Precios, Ajustes all refetch everything
-- on every visit even when nothing moved.
--
-- This function returns a tiny stamp per domain: "<row count>:<max updated_at>".
-- The client stores the stamp beside the cached payload and, on each open, asks
-- only for the stamp. Identical → serve the cache and skip the heavy query
-- entirely. Different → refetch immediately.
--
-- Why a server probe rather than purely local invalidation: this catches edits
-- made by ANY source — another device, another team member, an outbox flush —
-- not just mutations this client happened to perform.
--
-- security invoker, so RLS applies: a caller can only fingerprint rows they are
-- already allowed to read. Every domain is a count + max over an indexed
-- business_id, so the probe stays far cheaper than the payload it guards.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── 1. Close the updated_at gaps ────────────────────────────────────────────
-- A stamp built on max(updated_at) only detects edits when updated_at actually
-- moves on UPDATE. These three tables had the column defaulted (or missing)
-- with no trigger, so edits were invisible: a renamed folder or a corrected
-- timesheet would have kept serving stale cache until a row was added/removed.

-- NOTE: file_sections (053) no longer exists — 054 replaced it with
-- file_folders. The folders table is the one to stamp here.
alter table public.timesheets   add column if not exists updated_at timestamptz not null default now();
alter table public.file_entries add column if not exists updated_at timestamptz not null default now();
alter table public.file_folders add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_timesheets_updated_at on public.timesheets;
create trigger set_timesheets_updated_at
  before update on public.timesheets
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_file_entries_updated_at on public.file_entries;
create trigger set_file_entries_updated_at
  before update on public.file_entries
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_file_folders_updated_at on public.file_folders;
create trigger set_file_folders_updated_at
  before update on public.file_folders
  for each row execute procedure public.set_updated_at();

-- ── 2. The probe ────────────────────────────────────────────────────────────
-- Domains are an explicit whitelist, not a table name passed through: the
-- scoping column and the tables folded into each domain differ, and dynamic
-- SQL over a caller-supplied identifier is not something this should accept.

create or replace function public.data_fingerprint(
  p_business_id uuid,
  p_domains     text[]
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  result jsonb := '{}'::jsonb;
  d      text;
  stamp  text;
begin
  foreach d in array p_domains loop
    stamp := null;
    case d
      when 'jobs' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.jobs where business_id = p_business_id;
      when 'invoices' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.invoices where business_id = p_business_id;
      when 'clients' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.clients where business_id = p_business_id;
      when 'employees' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.employees where business_id = p_business_id;
      when 'timesheets' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.timesheets where business_id = p_business_id;
      when 'price_sheets' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.price_sheet_items where business_id = p_business_id;
      when 'inventory' then
        select count(*)::text || ':' || coalesce(max(updated_at)::text, '-')
          into stamp from public.inventory_items where business_id = p_business_id;
      -- Composite domains: one stamp covering every table the screen reads, so
      -- a change to any of them invalidates that screen's cache.
      when 'files' then
        select (
          (select count(*) from public.file_entries    where business_id = p_business_id) +
          (select count(*) from public.file_folders    where business_id = p_business_id) +
          (select count(*) from public.file_categories where business_id = p_business_id)
        )::text || ':' || coalesce(greatest(
          (select max(updated_at) from public.file_entries    where business_id = p_business_id),
          (select max(updated_at) from public.file_folders    where business_id = p_business_id),
          (select max(updated_at) from public.file_categories where business_id = p_business_id)
        )::text, '-') into stamp;
      when 'templates' then
        select (
          (select count(*) from public.client_field_templates         where business_id = p_business_id) +
          (select count(*) from public.employee_field_templates       where business_id = p_business_id) +
          (select count(*) from public.invoice_field_templates        where business_id = p_business_id) +
          (select count(*) from public.job_field_templates            where business_id = p_business_id) +
          (select count(*) from public.job_assignment_field_templates where business_id = p_business_id)
        )::text || ':' || coalesce(greatest(
          (select max(updated_at) from public.client_field_templates         where business_id = p_business_id),
          (select max(updated_at) from public.employee_field_templates       where business_id = p_business_id),
          (select max(updated_at) from public.invoice_field_templates        where business_id = p_business_id),
          (select max(updated_at) from public.job_field_templates            where business_id = p_business_id),
          (select max(updated_at) from public.job_assignment_field_templates where business_id = p_business_id)
        )::text, '-') into stamp;
      when 'business' then
        select coalesce(updated_at::text, '-')
          into stamp from public.businesses where id = p_business_id;
      else
        -- Unknown domain: report it rather than silently returning a constant
        -- stamp, which would freeze that screen's cache forever.
        stamp := 'unknown';
    end case;
    result := result || jsonb_build_object(d, coalesce(stamp, '-'));
  end loop;
  return result;
end $$;

grant execute on function public.data_fingerprint(uuid, text[]) to authenticated;
