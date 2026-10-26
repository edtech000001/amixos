-- 251_invoice_list_filters_sort.sql
-- Invoice list: date field choice, quick filters, and sorts.
--
--   invoices.amount_paid          Σ invoice_payments.amount, trigger-maintained
--                                 (for "Partially paid": some paid, not paid).
--   invoices.collect_from_partner Generated: a bill-through link carries
--                                 client_paid_at (migration 250) — "Collect
--                                 from partner".
--   indexes                       for the new sorts / filters.
--   invoice_tab_counts            + p_date_field ('issue'|'due'|'paid') and
--                                 p_quick (filter keys) so the tab badges match
--                                 the filtered list. The old signature is
--                                 dropped (otherwise calls become ambiguous).
--
-- Quick filter keys (mirror shared/src/lib/invoicesQuery.ts applyQuickFilters):
--   recent_paid     status paid, paid in the last 30 days
--   recent_updated  edited in the last 7 days
--   reminded        reminder_count > 0
--   not_reminded    sent/overdue and never reminded
--   due_soon        unpaid, due today … +7 days
--   partial         not paid, amount_paid > 0
--   collect         collect_from_partner, not paid/cancelled
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

-- ── 1. amount_paid ──────────────────────────────────────────────────────────
alter table public.invoices
  add column if not exists amount_paid numeric not null default 0;

create or replace function public.invoices_sync_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[
    case when tg_op in ('INSERT','UPDATE') then new.invoice_id end,
    case when tg_op in ('UPDATE','DELETE') then old.invoice_id end
  ], null);
  update public.invoices i
     set amount_paid = coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id = i.id), 0)
   where i.id = any(v_ids);
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_payments_sync_amount_paid on public.invoice_payments;
create trigger invoice_payments_sync_amount_paid
  after insert or update or delete on public.invoice_payments
  for each row execute function public.invoices_sync_amount_paid();

-- Trigger functions are never callable by clients (see 237).
revoke execute on function public.invoices_sync_amount_paid() from public, authenticated, anon;

-- Backfill.
update public.invoices i
   set amount_paid = s.total
  from (select invoice_id, sum(amount) as total from public.invoice_payments group by invoice_id) s
 where s.invoice_id = i.id and i.amount_paid is distinct from s.total;

-- ── 2. collect_from_partner (generated) ────────────────────────────────────
alter table public.invoices
  add column if not exists collect_from_partner boolean
  generated always as (jsonb_path_exists(coalesce(billed_through, '[]'::jsonb), '$[*].client_paid_at')) stored;

-- ── 3. Indexes for the new sorts / filters ─────────────────────────────────
create index if not exists invoices_business_due_idx     on public.invoices (business_id, due_date);
create index if not exists invoices_business_paid_idx    on public.invoices (business_id, paid_at);
create index if not exists invoices_business_updated_idx on public.invoices (business_id, updated_at);
create index if not exists invoices_business_total_idx   on public.invoices (business_id, total_amount);

-- ── 4. Tab counts aware of the date field + quick filters ──────────────────
drop function if exists public.invoice_tab_counts(uuid, uuid, date, date, text, numeric, uuid[], uuid[]);

create or replace function public.invoice_tab_counts(
  p_business_id uuid,
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_search_term text default null,
  p_search_amount numeric default null,
  p_client_ids uuid[] default null,
  p_invoice_ids uuid[] default null,
  p_date_field text default 'issue',
  p_quick text[] default null
) returns table(tab text, cnt bigint)
language sql stable security invoker set search_path = public as $func$
  with base as (
    select i.status
    from public.invoices i
    where i.business_id = p_business_id
      and (p_location_id is null or i.location_id = p_location_id)
      and (p_date_from is null or (case p_date_field
             when 'due'  then i.due_date
             when 'paid' then (i.paid_at)::date
             else i.issue_date end) >= p_date_from)
      and (p_date_to is null or (case p_date_field
             when 'due'  then i.due_date
             when 'paid' then (i.paid_at)::date
             else i.issue_date end) <= p_date_to)
      and (
        p_search_term is null
        or i.invoice_number ilike '%' || p_search_term || '%'
        or i.custom_fields_text ilike '%' || p_search_term || '%'
        or (p_search_amount is not null and i.total_amount = p_search_amount)
        or (p_client_ids  is not null and i.client_id = any(p_client_ids))
        or (p_invoice_ids is not null and i.id        = any(p_invoice_ids))
      )
      and (p_quick is null or (
            (not ('recent_paid' = any(p_quick)) or (i.status = 'paid' and i.paid_at >= now() - interval '30 days'))
        and (not ('recent_updated' = any(p_quick)) or i.updated_at >= now() - interval '7 days')
        and (not ('reminded' = any(p_quick)) or coalesce(i.reminder_count, 0) > 0)
        and (not ('not_reminded' = any(p_quick)) or (coalesce(i.reminder_count, 0) = 0 and i.status in ('sent','overdue')))
        and (not ('due_soon' = any(p_quick)) or (i.status in ('draft','sent','overdue') and i.due_date between current_date and current_date + 7))
        and (not ('partial' = any(p_quick)) or (i.status <> 'paid' and coalesce(i.amount_paid, 0) > 0))
        and (not ('collect' = any(p_quick)) or (i.collect_from_partner and i.status not in ('paid','cancelled')))
      ))
  ), agg as (
    select
      count(*)                                        as all_cnt,
      count(*) filter (where status = 'draft')        as draft_cnt,
      count(*) filter (where status = 'sent')         as sent_cnt,
      count(*) filter (where status = 'paid')         as paid_cnt,
      count(*) filter (where status = 'overdue')      as overdue_cnt,
      count(*) filter (where status = 'total_loss')   as total_loss_cnt
    from base
  )
  select t.tab, t.cnt from agg cross join lateral (values
    ('all', all_cnt), ('draft', draft_cnt), ('sent', sent_cnt),
    ('paid', paid_cnt), ('overdue', overdue_cnt), ('total_loss', total_loss_cnt)
  ) t(tab, cnt);
$func$;

revoke all on function public.invoice_tab_counts(uuid, uuid, date, date, text, numeric, uuid[], uuid[], text, text[]) from public, anon;
grant execute on function public.invoice_tab_counts(uuid, uuid, date, date, text, numeric, uuid[], uuid[], text, text[]) to authenticated, service_role;
