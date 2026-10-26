-- 252_client_list_stats.sql
-- Clients list: filters + sorts on activity ("recently invoiced", "owes
-- money"…). The numbers live ON the client row so the list can filter, sort
-- and page with plain PostgREST queries; triggers on invoices + jobs keep them
-- current.
--
--   clients.balance_due        Σ (total − paid) over sent/overdue invoices
--   clients.overdue_count      # overdue invoices
--   clients.last_invoice_date  latest issue_date of a non-draft, non-cancelled invoice
--   clients.lifetime_billed    Σ total over sent/overdue/paid invoices
--   clients.open_jobs          # jobs accepted / scheduled / in progress
--   clients.last_job_at        latest job created_at
--
-- Stats refreshes must NOT look like user edits: the clients updated_at
-- trigger is replaced with one that skips the stamp when only these columns
-- changed ("Recently updated" sort/filter, offline conflict checks).
--
-- Quick filters (mirror shared/src/lib/clientsQuery.ts applyClientFilters):
--   recent_added     created in the last 30 days
--   recent_invoiced  invoiced in the last 30 days
--   owes             balance_due > 0
--   overdue          overdue_count > 0
--   active_jobs      open_jobs > 0
--   inactive         client 180+ days old, no invoice/job in 180 days, no open jobs
--   no_email         no email on file
--
-- Needs 251 (invoices.amount_paid). IMPORTANT: run manually in the Supabase
-- SQL Editor. Safe to re-run.

-- ── 1. Columns ─────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists balance_due       numeric not null default 0,
  add column if not exists overdue_count     integer not null default 0,
  add column if not exists last_invoice_date date,
  add column if not exists lifetime_billed   numeric not null default 0,
  add column if not exists open_jobs         integer not null default 0,
  add column if not exists last_job_at       timestamptz;

-- ── 2. updated_at: skip stats-only updates ─────────────────────────────────
-- custom_fields_text is excluded too: generated columns read NULL in a BEFORE
-- trigger's NEW, so it would always look changed.
create or replace function public.clients_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_skip text[] := array['updated_at', 'custom_fields_text', 'balance_due', 'overdue_count',
                         'last_invoice_date', 'lifetime_billed', 'open_jobs', 'last_job_at'];
begin
  if (to_jsonb(new) - v_skip) is distinct from (to_jsonb(old) - v_skip) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists update_clients_updated_at on public.clients;
create trigger update_clients_updated_at
  before update on public.clients
  for each row execute function public.clients_set_updated_at();

revoke execute on function public.clients_set_updated_at() from public, authenticated, anon;

-- ── 3. Recompute ───────────────────────────────────────────────────────────
create or replace function public.refresh_client_stats(p_client_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.clients c set
    balance_due       = coalesce(s.balance, 0),
    overdue_count     = coalesce(s.overdue, 0),
    last_invoice_date = s.last_inv,
    lifetime_billed   = coalesce(s.billed, 0),
    open_jobs         = coalesce(j.open_cnt, 0),
    last_job_at       = j.last_job
  from (select distinct unnest(p_client_ids) as id) ids
  cross join lateral (
    select
      sum(i.total_amount - coalesce(i.amount_paid, 0)) filter (where i.status in ('sent', 'overdue')) as balance,
      count(*) filter (where i.status = 'overdue')                                                    as overdue,
      max(i.issue_date) filter (where i.status not in ('draft', 'cancelled'))                         as last_inv,
      sum(i.total_amount) filter (where i.status in ('sent', 'overdue', 'paid'))                      as billed
    from public.invoices i
    where i.client_id = ids.id
  ) s
  cross join lateral (
    select
      count(*) filter (where jb.status in ('accepted', 'scheduled', 'in_progress')) as open_cnt,
      max(jb.created_at)                                                            as last_job
    from public.jobs jb
    where jb.client_id = ids.id
  ) j
  where c.id = ids.id
    -- No-op writes skipped (no row churn / realtime noise).
    and (c.balance_due, c.overdue_count, c.last_invoice_date, c.lifetime_billed, c.open_jobs, c.last_job_at)
        is distinct from
        (coalesce(s.balance, 0), coalesce(s.overdue, 0)::integer, s.last_inv, coalesce(s.billed, 0), coalesce(j.open_cnt, 0)::integer, j.last_job);
$$;

revoke execute on function public.refresh_client_stats(uuid[]) from public, authenticated, anon;

create or replace function public.clients_stats_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_client_stats(array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.client_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.client_id end
  ], null));
  return null;
end;
$$;

revoke execute on function public.clients_stats_on_change() from public, authenticated, anon;

drop trigger if exists invoices_client_stats on public.invoices;
create trigger invoices_client_stats
  after insert or delete or update of client_id, status, total_amount, amount_paid, issue_date
  on public.invoices
  for each row execute function public.clients_stats_on_change();

drop trigger if exists jobs_client_stats on public.jobs;
create trigger jobs_client_stats
  after insert or delete or update of client_id, status
  on public.jobs
  for each row execute function public.clients_stats_on_change();

-- ── 4. Indexes ─────────────────────────────────────────────────────────────
create index if not exists invoices_client_id_idx          on public.invoices (client_id);
create index if not exists clients_business_created_idx    on public.clients (business_id, created_at);
create index if not exists clients_business_updated_idx    on public.clients (business_id, updated_at);
create index if not exists clients_business_last_inv_idx   on public.clients (business_id, last_invoice_date);
create index if not exists clients_business_balance_idx    on public.clients (business_id, balance_due);
create index if not exists clients_business_billed_idx     on public.clients (business_id, lifetime_billed);

-- ── 5. Backfill ────────────────────────────────────────────────────────────
select public.refresh_client_stats(array_agg(id)) from public.clients;
