-- 181_perf_rls_rpcs.sql
-- Performance overhaul, part 1 of 2 (part 2 = 182_perf_indexes.sql).
--
-- WHY: list loads were slow because (a) the clients/invoices/employees SELECT
-- policies still call member_view(business_id, …) — a SECURITY DEFINER
-- function doing 2 queries — PER ROW for every role (the footgun 160/161 fixed
-- for jobs/location but never propagated), (b) the jobs "assigned" arm still
-- ran per-row plpgsql + an unindexed EXISTS, and (c) the app fires 10
-- count:'exact' scans per jobs-list open plus 9 dashboard queries.
--
-- WHAT THIS DOES (no security-semantics changes — see the verification block):
--   1. job_assignments.business_id formalized (column + backfill + trigger).
--   2. member_view / member_res / member_cap / member_location_locked converted
--      plpgsql → single-statement `language sql` (same results, less overhead).
--   3. Initplan policy rewrites (161 pattern) for jobs (assigned arm), clients,
--      invoices, employees + the 070 field-reads-all-clients policy.
--   4. New RPCs: job_tab_counts (all tab badges in ONE scan), jobs_page_ids
--      (server-side sort for status/startDate/client/lead — replaces the
--      client's download-everything fallback), dashboard_stats (one scan for
--      the dashboard's number widgets).
--   5. pg_trgm extension (182 adds the trigram indexes that make ilike search
--      index-assisted).
--
-- IMPORTANT: run manually in the Supabase SQL Editor (one run; transactional).
-- THEN re-run 178_employees_roster_view.sql (updated to the initplan form).
-- THEN run 182_perf_indexes.sql statement by statement.
--
-- ── Verification (run before + after, compare counts per role) ───────────────
-- Simulate a member and count what they can see (repeat for an owner, a field
-- worker, and a custom-role member):
--   begin;
--   select set_config('request.jwt.claims', json_build_object(
--     'sub', (select id from auth.users where email = '<member-email>'),
--     'role','authenticated')::text, true);
--   set local role authenticated;
--   select
--     (select count(*) from public.jobs)      as jobs,
--     (select count(*) from public.clients)   as clients,
--     (select count(*) from public.invoices)  as invoices,
--     (select count(*) from public.employees) as employees;
--   rollback;
-- Counts must be identical before vs after this migration.

create extension if not exists pg_trgm;

-- ─── 1. job_assignments.business_id ─────────────────────────────────────────
-- The app already filters job_assignments by business_id (crew-name search);
-- formalize the column, backfill from the parent job, and stamp it on insert.

alter table public.job_assignments
  add column if not exists business_id uuid references public.businesses(id) on delete cascade;

update public.job_assignments ja
  set business_id = j.business_id
  from public.jobs j
  where j.id = ja.job_id and ja.business_id is null;

create or replace function public.job_assignments_stamp_business()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.business_id is null then
    select business_id into new.business_id from public.jobs where id = new.job_id;
  end if;
  return new;
end;
$$;

drop trigger if exists job_assignments_stamp_business on public.job_assignments;
create trigger job_assignments_stamp_business
  before insert on public.job_assignments
  for each row execute function public.job_assignments_stamp_business();

-- ─── 2. plpgsql → sql conversions (semantics preserved exactly) ─────────────
-- Same resolution order as 164: role null → deny; owner → allow; stored
-- snapshot value; else built-in default. Single-statement SQL drops the
-- plpgsql interpreter + SPI overhead on every call.

create or replace function public.member_view(b_id uuid, res text)
returns text language sql security definer stable set search_path = public as $$
  select case
    when r.role is null then 'none'
    when r.role = 'owner' then 'all'
    else coalesce(
      br.permissions #>> array['resources', res, 'view'],
      public.default_role_permissions(r.role) #>> array['resources', res, 'view'],
      'none')
  end
  from (select public.member_role(b_id) as role) r
  left join public.business_roles br on br.business_id = b_id and br.key = r.role;
$$;

create or replace function public.member_res(b_id uuid, res text, act text)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when r.role is null then false
    when r.role = 'owner' then true
    else coalesce(
      (coalesce(
        br.permissions #>> array['resources', res, act],
        public.default_role_permissions(r.role) #>> array['resources', res, act]
      ))::boolean,
      false)
  end
  from (select public.member_role(b_id) as role) r
  left join public.business_roles br on br.business_id = b_id and br.key = r.role;
$$;

create or replace function public.member_cap(b_id uuid, cap text)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when r.role is null then false
    when br.permissions #> array['caps', cap] is not null
      then coalesce((br.permissions #>> array['caps', cap])::boolean, false)
    else public.default_role_cap(r.role, cap)
  end
  from (select public.member_role(b_id) as role) r
  left join public.business_roles br on br.business_id = b_id and br.key = r.role;
$$;

create or replace function public.member_location_locked(b_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when r.role is null then false
    when r.role = 'owner' then false
    when br.permissions #>> array['caps','switchLocations'] is null then r.role = 'field'
    else (br.permissions #>> array['caps','switchLocations']) = 'false'
  end
  from (select public.member_role(b_id) as role) r
  left join public.business_roles br on br.business_id = b_id and br.key = r.role;
$$;

-- ─── 3. Initplan helpers + policy rewrites ──────────────────────────────────
-- SECURITY DEFINER helpers are never inlined, so they must NEVER appear in a
-- policy with a row-column argument. Rule: keyed only on auth.uid(), called
-- with CONSTANT args, referenced via `IN (select …)` → one evaluation/query.

-- Businesses where my effective view for <res> equals <scope>.
create or replace function public.my_view_businesses(res text, scope text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select bm.business_id
  from public.business_members bm
  where bm.user_id = auth.uid()
    and public.member_view(bm.business_id, res) = scope;
$$;

-- Job ids I'm assigned to (via my linked employee rows).
create or replace function public.my_assigned_job_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ja.job_id
  from public.job_assignments ja
  join public.employees e on e.id = ja.employee_id
  where e.user_id = auth.uid();
$$;

-- Businesses where my raw role is 'field' (070's quick-log clients read).
create or replace function public.my_field_role_businesses()
returns setof uuid language sql stable security definer set search_path = public as $$
  select business_id from public.business_members
  where user_id = auth.uid() and role = 'field';
$$;

-- jobs: keep 161's view-all arm; the assigned arm loses its per-row
-- member_view call and per-row is_assigned_to_job scan.
drop policy if exists "jobs read" on public.jobs;
create policy "jobs read" on public.jobs for select
  using (
    business_id in (select public.my_jobs_view_all_businesses())
    or (
      business_id in (select public.my_view_businesses('jobs', 'assigned'))
      and published_to_crew = true
      and id in (select public.my_assigned_job_ids())
    )
  );

-- clients: 089's per-row policy + 070's field policy → set-based.
drop policy if exists "clients read" on public.clients;
create policy "clients read" on public.clients for select
  using (
    business_id in (select public.my_view_businesses('clients', 'all'))
    or (
      business_id in (select public.my_view_businesses('clients', 'assigned'))
      and exists (
        select 1 from public.jobs j
        where j.client_id = clients.id
          and j.id in (select public.my_assigned_job_ids())
      )
    )
  );

drop policy if exists "field read all clients" on public.clients;
create policy "field read all clients" on public.clients for select
  using (business_id in (select public.my_field_role_businesses()));

-- invoices / employees: 'all'-only arms (the 069 employee self-read and the
-- restrictive location-lock policies are unchanged and still apply).
drop policy if exists "invoices read" on public.invoices;
create policy "invoices read" on public.invoices for select
  using (business_id in (select public.my_view_businesses('invoices', 'all')));

drop policy if exists "employees read" on public.employees;
create policy "employees read" on public.employees for select
  using (business_id in (select public.my_view_businesses('employees', 'all')));

-- ─── 4a. job_tab_counts — every tab badge in ONE scan ───────────────────────
-- SECURITY INVOKER: counts are of exactly the rows the caller can see, same as
-- the 10 head-count queries this replaces. Semantics mirror fetchJobTabCounts:
-- 'all' spans archived; search spans every status; other tabs exclude archived.
-- Search matching mirrors job_group_index (165): raw ilike on 5 job fields +
-- pre-resolved client/crew id lists.

create or replace function public.job_tab_counts(
  p_business_id uuid,
  p_location_id uuid default null,
  p_search_term text default null,
  p_client_ids uuid[] default null,
  p_crew_job_ids uuid[] default null
) returns table(tab text, cnt bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select j.status, j.archived_at, j.delegated_to_business_id
    from public.jobs j
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
      and (
        p_search_term is null
        or j.title           ilike '%' || p_search_term || '%'
        or j.external_ref    ilike '%' || p_search_term || '%'
        or j.estimate_number ilike '%' || p_search_term || '%'
        or j.job_city        ilike '%' || p_search_term || '%'
        or j.job_state       ilike '%' || p_search_term || '%'
        or (p_client_ids   is not null and j.client_id = any(p_client_ids))
        or (p_crew_job_ids is not null and j.id        = any(p_crew_job_ids))
      )
  ), agg as (
    select
      count(*)                                                                                  as all_cnt,
      count(*) filter (where archived_at is not null)                                           as archived_cnt,
      count(*) filter (where archived_at is null
                         and status in ('proposal','sent','accepted','declined'))               as propuestas_cnt,
      count(*) filter (where archived_at is null and delegated_to_business_id is not null)      as delegated_cnt,
      count(*) filter (where archived_at is null and status = 'posible')                        as posible_cnt,
      count(*) filter (where archived_at is null and status = 'scheduled')                      as scheduled_cnt,
      count(*) filter (where archived_at is null and status = 'in_progress')                    as in_progress_cnt,
      count(*) filter (where archived_at is null and status = 'completed')                      as completed_cnt,
      count(*) filter (where archived_at is null and status = 'invoiced')                       as invoiced_cnt,
      count(*) filter (where archived_at is null and status = 'cancelled')                      as cancelled_cnt
    from base
  )
  select t.tab, t.cnt from agg cross join lateral (values
    ('all', all_cnt), ('archived', archived_cnt), ('propuestas', propuestas_cnt),
    ('delegated', delegated_cnt), ('posible', posible_cnt), ('scheduled', scheduled_cnt),
    ('in_progress', in_progress_cnt), ('completed', completed_cnt),
    ('invoiced', invoiced_cnt), ('cancelled', cancelled_cnt)
  ) t(tab, cnt);
$$;

-- ─── 4b. jobs_page_ids — server-side sort page for non-'recent' sorts ───────
-- Returns one page of job IDS in the requested order; the client refetches the
-- rows (with embeds) via .in('id', ids) — RLS re-applies on that read, so this
-- can never widen visibility. Replaces the client's "download every job then
-- sort locally" fallback. Sort semantics mirror shared/src/lib/jobSort.ts:
--   status:    pipeline order (unknown statuses last)
--   startDate: soonest first, no-date last
--   client:    client name A→Z, missing last
--   lead:      lead name A→Z, missing last
-- Offset paging (not keyset): the scan is server-side and id-only, and pages
-- past the first few are rare — simplicity wins here.

create or replace function public.jobs_page_ids(
  p_business_id uuid,
  p_sort text,                             -- 'status'|'startDate'|'client'|'lead'|'company'
  p_status_include text[] default null,
  p_exclude_closed boolean default false,
  p_archived text default 'exclude',       -- 'exclude' | 'only' | 'any'
  p_search_term text default null,
  p_client_ids uuid[] default null,
  p_crew_job_ids uuid[] default null,
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_limit int default 50,
  p_offset int default 0
) returns setof uuid
language sql stable security invoker set search_path = public as $$
  with filt as (
    select
      j.id, j.created_at,
      case p_sort
        when 'status' then lpad(coalesce(
          array_position(array['proposal','sent','accepted','posible','scheduled',
                               'in_progress','completed','invoiced','declined','cancelled'], j.status),
          99)::text, 2, '0')
        when 'startDate' then coalesce(j.scheduled_date::text, '9999-12-31')
        when 'client' then nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '')
        when 'company' then nullif(trim(coalesce(c.company,'')), '')
        when 'lead' then lead.name
        else ''
      end as sort_val
    from public.jobs j
    left join public.clients c on p_sort in ('client','company') and c.id = j.client_id
    left join lateral (
      select coalesce(
               nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
               ja.worker_name
             ) as name
      from public.job_assignments ja
      left join public.employees e on e.id = ja.employee_id
      where p_sort = 'lead' and ja.job_id = j.id and ja.is_lead = true
      limit 1
    ) lead on true
    where j.business_id = p_business_id
      and (p_location_id is null or j.location_id = p_location_id)
      and (p_status_include is null or j.status = any(p_status_include))
      and (not p_exclude_closed or j.status not in ('invoiced','cancelled'))
      and (p_archived = 'any'
           or (p_archived = 'exclude' and j.archived_at is null)
           or (p_archived = 'only'    and j.archived_at is not null))
      and (p_date_from is null or j.scheduled_date >= p_date_from)
      and (p_date_to   is null or j.scheduled_date <= p_date_to)
      and (
        p_search_term is null
        or j.title           ilike '%' || p_search_term || '%'
        or j.external_ref    ilike '%' || p_search_term || '%'
        or j.estimate_number ilike '%' || p_search_term || '%'
        or j.job_city        ilike '%' || p_search_term || '%'
        or j.job_state       ilike '%' || p_search_term || '%'
        or (p_client_ids   is not null and j.client_id = any(p_client_ids))
        or (p_crew_job_ids is not null and j.id        = any(p_crew_job_ids))
      )
  )
  select id from filt
  order by sort_val asc nulls last, created_at desc, id desc
  limit p_limit offset p_offset;
$$;

-- ─── 4c. dashboard_stats — the dashboard's number widgets in one call ───────
-- SECURITY INVOKER. Replaces: paid-this-month sum, the unbounded "all paid
-- invoices this year" download (now a grouped sum), and 5 count:'exact'
-- queries. Boundaries are passed in from the client so month/year edges match
-- the device's timezone exactly (parity with the old client-side math).

create or replace function public.dashboard_stats(
  p_business_id uuid,
  p_start_month timestamptz,
  p_start_year timestamptz,
  p_tz text default 'UTC'
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with paid as (
    select total_amount, paid_at
    from public.invoices
    where business_id = p_business_id and status = 'paid' and paid_at >= p_start_year
  ), monthly as (
    select extract(month from (paid_at at time zone p_tz))::int as m,
           sum(coalesce(total_amount, 0)) as amt
    from paid
    group by 1
  )
  select jsonb_build_object(
    'earnings_month', coalesce((select sum(coalesce(total_amount,0)) from paid where paid_at >= p_start_month), 0),
    'earnings_year',  coalesce((select sum(coalesce(total_amount,0)) from paid), 0),
    'monthly', (select jsonb_agg(coalesce(mm.amt, 0) order by gs.m)
                from generate_series(1, 12) gs(m)
                left join monthly mm on mm.m = gs.m),
    'invoices_pending', (select count(*) from public.invoices
                         where business_id = p_business_id and status = 'sent'),
    'invoices_overdue', (select count(*) from public.invoices
                         where business_id = p_business_id and status = 'overdue'),
    'clients_total',    (select count(*) from public.clients
                         where business_id = p_business_id),
    'clocked_in_now',   (select count(*) from public.timesheets
                         where business_id = p_business_id and clock_out is null),
    'jobs_active',      (select count(*) from public.jobs
                         where business_id = p_business_id and status in ('scheduled','in_progress'))
  );
$$;
