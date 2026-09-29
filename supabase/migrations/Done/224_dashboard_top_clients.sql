-- 224 — Top clients by revenue, for the dashboard Clients tile
--
-- "Who are my biggest clients" is a GROUP BY over invoices. PostgREST can't
-- express that, so the alternative is downloading every paid invoice and
-- summing on the client — which its 1000-row cap silently truncates, giving a
-- top-clients list that is wrong for exactly the businesses that have enough
-- invoices to need one.
--
-- Scoped to a start date (the caller passes the year start) rather than all
-- time: a client who was huge three years ago and has since left is not who
-- you want to see at the top of today's dashboard.
--
-- security invoker + stable, matching dashboard_stats — RLS on invoices and
-- clients decides what the caller can see, exactly as it would for a direct
-- select.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

create or replace function public.dashboard_top_clients(
  p_business_id uuid,
  p_start timestamptz,
  p_limit int default 8
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
    coalesce(sum(i.total_amount), 0) as total,
    count(i.id) as invoice_count
  from public.invoices i
  join public.clients c on c.id = i.client_id
  where i.business_id = p_business_id
    and i.status = 'paid'
    and i.paid_at >= p_start
  group by c.id, c.first_name, c.last_name, c.company
  -- Zero-value clients would pad the list with names that earned nothing.
  having coalesce(sum(i.total_amount), 0) > 0
  order by total desc
  limit greatest(p_limit, 0);
$$;

comment on function public.dashboard_top_clients(uuid, timestamptz, int) is
  'Highest-revenue clients since p_start, by PAID invoice total. Feeds the '
  'dashboard Clients tile at md/lg.';
