-- 240 — Bill another company's invoice lines through this invoice
--
-- A user in two businesses (e.g. Pivot Builders + Champion Built) sometimes
-- sends a shared client ONE invoice from Pivot that also lists Champion's
-- work. Champion's own invoice stays a normal unpaid invoice (Pivot pays
-- Champion later and it gets marked paid then). On Pivot's side the copied
-- lines are real, client-facing lines — the client pays the full amount — but
-- they are NOT Pivot's money, so revenue/earnings must leave them out.
--
--   businesses.allow_bill_through  Opt-in on the SOURCE business (off by
--                                  default): its invoices may be billed
--                                  through the owner's other businesses.
--   invoices.billed_through        On the SOURCE invoice: where its lines
--                                  were billed ([{business_id, business_name,
--                                  invoice_id, invoice_number, at}]).
--                                  Informational only; status is untouched.
--   invoices.passthrough_amount    On the TARGET invoice: the part of
--                                  total_amount that belongs to another
--                                  business. Maintained by a trigger from
--                                  line_items (lines carrying a `passthrough`
--                                  object), so every existing line-item writer
--                                  stays correct without code changes.
--
-- Revenue RPCs (dashboard_stats, dashboard_top_clients, reports_overview) now
-- count total_amount - passthrough_amount. Bodies are otherwise identical to
-- 226/227.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists allow_bill_through boolean not null default false;

alter table public.invoices
  add column if not exists billed_through jsonb not null default '[]'::jsonb,
  add column if not exists passthrough_amount numeric not null default 0;

-- ── passthrough_amount maintenance ─────────────────────────────────────────
-- Σ qty × rate over non-excluded passthrough lines, plus the invoice's tax on
-- them (the tax on another company's work isn't this company's money either).
-- Same qty/rate coercion as reports_overview.per_job_rev.
create or replace function public.invoices_set_passthrough_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sub numeric;
begin
  select coalesce(sum(
           (case when li ->> 'qty' is null then 1
                 when li ->> 'qty' ~ '^-?[0-9]+(\.[0-9]+)?$' then (li ->> 'qty')::numeric
                 else 0 end)
           * (case when li ->> 'rate' ~ '^-?[0-9]+(\.[0-9]+)?$' then (li ->> 'rate')::numeric
                   else 0 end)
         ), 0)
    into sub
  from jsonb_array_elements(coalesce(new.line_items, '[]'::jsonb)) as li
  where jsonb_typeof(li -> 'passthrough') = 'object'
    and coalesce((li ->> 'excluded')::boolean, false) = false;

  new.passthrough_amount := sub * (1 + coalesce(new.tax_rate, 0) / 100);
  return new;
end;
$$;

-- Trigger functions are never callable by clients (see 237).
revoke execute on function public.invoices_set_passthrough_amount() from public, anon, authenticated;

drop trigger if exists invoices_set_passthrough_amount on public.invoices;
create trigger invoices_set_passthrough_amount
  before insert or update of line_items, tax_rate on public.invoices
  for each row execute function public.invoices_set_passthrough_amount();

-- ── Revenue RPCs: this business's share only ───────────────────────────────

create or replace function public.dashboard_stats(
  p_business_id uuid,
  p_start_month timestamptz,
  p_start_year timestamptz,
  p_tz text default 'UTC',
  p_location_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with own as (
    -- Own share: what's billed for another business (240) isn't earnings.
    select status, paid_at, location_id,
           coalesce(total_amount, 0) - coalesce(passthrough_amount, 0) as total_amount
    from public.invoices
    where business_id = p_business_id
      and (p_location_id is null or location_id = p_location_id)
  ), paid as (
    select total_amount, paid_at
    from own
    where status = 'paid' and paid_at >= p_start_year
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
    'invoices_pending', (select count(*) from own where status = 'sent'),
    'invoices_overdue', (select count(*) from own where status = 'overdue'),
    'invoices_pending_amount', coalesce((select sum(total_amount) from own where status = 'sent'), 0),
    'invoices_overdue_amount', coalesce((select sum(total_amount) from own where status = 'overdue'), 0),
    'clients_total',    (select count(*) from public.clients c
                         where c.business_id = p_business_id
                           and (p_location_id is null
                                or exists (select 1 from public.client_locations cl
                                           where cl.client_id = c.id and cl.location_id = p_location_id)
                                or not exists (select 1 from public.client_locations cl
                                               where cl.client_id = c.id))),
    'clocked_in_now',   (select count(*) from public.timesheets ts
                         where ts.business_id = p_business_id and ts.clock_out is null
                           and (p_location_id is null
                                or exists (select 1 from public.employee_locations el
                                           where el.employee_id = ts.employee_id
                                             and el.location_id = p_location_id))),
    'jobs_active',      (select count(*) from public.jobs
                         where business_id = p_business_id and status in ('scheduled','in_progress')
                           and (p_location_id is null or location_id = p_location_id)),
    'jobs_scheduled',   (select count(*) from public.jobs
                         where business_id = p_business_id and status = 'scheduled'
                           and (p_location_id is null or location_id = p_location_id)),
    'jobs_in_progress', (select count(*) from public.jobs
                         where business_id = p_business_id and status = 'in_progress'
                           and (p_location_id is null or location_id = p_location_id)),
    'jobs_today',       (select count(*) from public.jobs
                         where business_id = p_business_id
                           and status in ('scheduled','in_progress')
                           and scheduled_date = (now() at time zone p_tz)::date
                           and (p_location_id is null or location_id = p_location_id))
  );
$$;

create or replace function public.dashboard_top_clients(
  p_business_id uuid,
  p_start timestamptz,
  p_limit int default 8,
  p_location_id uuid default null
) returns table (
  client_id uuid,
  first_name text,
  last_name text,
  company text,
  total numeric,
  invoice_count bigint
)
language sql stable security invoker set search_path = public as $$
  select
    c.id,
    c.first_name,
    c.last_name,
    c.company,
    coalesce(sum(i.total_amount - coalesce(i.passthrough_amount, 0)), 0) as total,
    count(i.id) as invoice_count
  from public.invoices i
  join public.clients c on c.id = i.client_id
  where i.business_id = p_business_id
    and i.status = 'paid'
    and i.paid_at >= p_start
    and (p_location_id is null or i.location_id = p_location_id)
  group by c.id, c.first_name, c.last_name, c.company
  having coalesce(sum(i.total_amount - coalesce(i.passthrough_amount, 0)), 0) > 0
  order by total desc
  limit greatest(p_limit, 0);
$$;

create or replace function public.reports_overview(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_start date,
  p_bucket_months int,
  p_tz text default 'UTC',
  p_include_inventory boolean default false,
  p_location_id uuid default null
) returns jsonb
language sql stable security invoker set search_path = public as $$
  with inv as (
    -- Own share only: lines billed for another business (240) are excluded.
    select i.id, i.status,
           coalesce(i.total_amount, 0) - coalesce(i.passthrough_amount, 0) as total_amount,
           i.line_items,
           coalesce(i.issue_date::timestamptz, i.created_at) as eff_date,
           coalesce(i.issue_date::timestamptz, i.paid_at, i.created_at) as bucket_date
    from public.invoices i
    where i.business_id = p_business_id
      and (p_from is null or coalesce(i.issue_date::timestamptz, i.created_at) >= p_from)
      and coalesce(i.issue_date::timestamptz, i.created_at) <= p_to
      and (p_location_id is null or i.location_id = p_location_id)
  ),
  jb as (
    select j.id, j.status, coalesce(j.total_amount, 0) as total_amount,
           j.location_id, j.created_at
    from public.jobs j
    where j.business_id = p_business_id
      and (p_from is null or j.created_at >= p_from)
      and j.created_at <= p_to
      and (p_location_id is null or j.location_id = p_location_id)
  ),
  per_job_rev as (
    select li ->> 'job_id' as job_id,
           sum(
             (case when li ->> 'qty' is null then 1
                   when li ->> 'qty' ~ '^-?[0-9]+(\.[0-9]+)?$' then (li ->> 'qty')::double precision
                   else 0 end)
             * (case when li ->> 'rate' ~ '^-?[0-9]+(\.[0-9]+)?$' then (li ->> 'rate')::double precision
                     else 0 end)
           ) as amt
    from inv, jsonb_array_elements(coalesce(inv.line_items, '[]'::jsonb)) as li
    where li ->> 'job_id' is not null
    group by 1
  ),
  buckets as (
    select gs.i,
           to_char(p_bucket_start + (gs.i || ' months')::interval, 'YYYY-MM') as ym,
           date_trunc('month', (p_bucket_start + (gs.i || ' months')::interval))::date as m_start
    from generate_series(0, greatest(p_bucket_months, 1) - 1) as gs(i)
  ),
  monthly as (
    select b.ym,
           coalesce((select sum(total_amount) from inv
                     where inv.status = 'paid'
                       and to_char(inv.bucket_date at time zone p_tz, 'YYYY-MM') = b.ym), 0) as revenue,
           coalesce((select count(*) from jb
                     where to_char(jb.created_at at time zone p_tz, 'YYYY-MM') = b.ym), 0) as jobs
    from buckets b
    order by b.i
  ),
  completed as (select * from jb where status in ('completed', 'invoiced'))
  select jsonb_build_object(
    'totalRevenue',    coalesce((select sum(total_amount) from inv where status = 'paid'), 0),
    'pendingRevenue',  coalesce((select sum(total_amount) from inv where status = 'sent'), 0),
    'overdueRevenue',  coalesce((select sum(total_amount) from inv where status = 'overdue'), 0),
    'paidInvoicesCount', (select count(*) from inv where status = 'paid'),
    'invoicesTotal',     (select count(*) from inv),
    'invoicesSum',       coalesce((select sum(total_amount) from inv), 0),
    'completedJobsCount', (select count(*) from completed),
    'jobsTotal',          (select count(*) from jb),
    'pricedJobsSum',   coalesce((select sum(total_amount) from completed where total_amount > 0), 0),
    'pricedJobsCount', (select count(*) from completed where total_amount > 0),
    'perJobSum',       coalesce((select sum(amt) from per_job_rev), 0),
    'perJobCount',     (select count(*) from per_job_rev),
    'invoiceStatus', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n))
      from (select status, count(*) as n from inv group by status) s
    ), '[]'::jsonb),
    'jobStatus', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'value', s.n))
      from (select status, count(*) as n from jb
            where status in ('scheduled','in_progress','completed','invoiced','cancelled')
            group by status) s
    ), '[]'::jsonb),
    'monthlyRevenue', coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'revenue', revenue, 'jobs', jobs)) from monthly), '[]'::jsonb),
    'byLocation', coalesce((
      select jsonb_agg(jsonb_build_object('locationId', s.location_id, 'jobCount', s.n, 'revenue', s.rev))
      from (select jb.location_id, count(*) as n,
                   sum(case when jb.status in ('completed','invoiced')
                            then case when jb.total_amount > 0 then jb.total_amount
                                      else coalesce(pjr.amt, 0) end
                            else 0 end) as rev
            from jb left join per_job_rev pjr on pjr.job_id = jb.id::text
            group by jb.location_id) s
    ), '[]'::jsonb),
    'newClientsCount', (select count(*) from public.clients c
                        where c.business_id = p_business_id
                          and (p_from is null or c.created_at >= p_from) and c.created_at <= p_to),
    'totalClientsCount', (select count(*) from public.clients c where c.business_id = p_business_id),
    'inventoryValue', case when p_include_inventory then
      coalesce((select sum(coalesce(quantity,0) * coalesce(unit_cost,0)) from public.inventory_items
                where business_id = p_business_id and (p_location_id is null or location_id = p_location_id)), 0) else 0 end,
    'inventoryItemsCount', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and (p_location_id is null or location_id = p_location_id)) else 0 end,
    'lowStock', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and coalesce(quantity,0) <= 5 and (p_location_id is null or location_id = p_location_id)) else 0 end,
    'outOfStock', case when p_include_inventory then
      (select count(*) from public.inventory_items where business_id = p_business_id and coalesce(quantity,0) = 0 and (p_location_id is null or location_id = p_location_id)) else 0 end
  );
$$;
