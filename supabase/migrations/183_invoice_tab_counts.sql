-- 183_invoice_tab_counts.sql
-- Invoice list badges in ONE scan — replaces six parallel count:'exact'
-- queries per list load (same pattern as job_tab_counts in 181).
--
-- SECURITY INVOKER: counts reflect exactly the rows the caller's RLS allows.
-- Search semantics mirror invoicesQuery.searchOrClause: invoice_number ilike,
-- exact amount match, pre-resolved client/invoice id lists.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.invoice_tab_counts(
  p_business_id uuid,
  p_location_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_search_term text default null,
  p_search_amount numeric default null,
  p_client_ids uuid[] default null,
  p_invoice_ids uuid[] default null
) returns table(tab text, cnt bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select i.status
    from public.invoices i
    where i.business_id = p_business_id
      and (p_location_id is null or i.location_id = p_location_id)
      and (p_date_from is null or i.issue_date >= p_date_from)
      and (p_date_to   is null or i.issue_date <= p_date_to)
      and (
        p_search_term is null
        or i.invoice_number ilike '%' || p_search_term || '%'
        or (p_search_amount is not null and i.total_amount = p_search_amount)
        or (p_client_ids  is not null and i.client_id = any(p_client_ids))
        or (p_invoice_ids is not null and i.id        = any(p_invoice_ids))
      )
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
$$;
