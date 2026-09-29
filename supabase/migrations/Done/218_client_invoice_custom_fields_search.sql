-- 218 — Searchable custom fields for clients and invoices
--
-- Migration 209 did this for jobs and deliberately stopped there, to watch the
-- trigram index behave on real data before repeating it. It behaved, so this
-- closes the same gap on the other two tables that carry custom_fields.
--
-- Until now, searching a client or an invoice by a value the user themselves
-- added found nothing, with no indication anything had been skipped.
--
-- Reuses jsonb_values_text() from 209 (values only, never keys — casting
-- custom_fields::text wholesale would make "type" match the KEY project_type on
-- every row). That function must already exist; 209 runs first.

-- ── Guard: fail loudly rather than half-apply ────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'jsonb_values_text'
  ) then
    raise exception 'jsonb_values_text() is missing — run 209_job_custom_fields_search.sql first';
  end if;
end $$;

-- ── Clients ─────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists custom_fields_text text
  generated always as (public.jsonb_values_text(custom_fields)) stored;

-- Trigram, because the search is ILIKE '%term%'. Without it that degrades to a
-- sequential scan and gets slower as the business grows — the exact failure the
-- pagination rule in CLAUDE.md warns about, in a different disguise.
create index if not exists clients_custom_fields_text_trgm_idx
  on public.clients using gin (custom_fields_text gin_trgm_ops);

-- ── Invoices ────────────────────────────────────────────────────────────────
alter table public.invoices
  add column if not exists custom_fields_text text
  generated always as (public.jsonb_values_text(custom_fields)) stored;

create index if not exists invoices_custom_fields_text_trgm_idx
  on public.invoices using gin (custom_fields_text gin_trgm_ops);

-- NOTE: pg_trgm must be enabled — 209 already required it, so if that ran this
-- will too. Editing jsonb_values_text() later does NOT recompute these columns;
-- existing rows keep their stored value until updated. Backfill deliberately.


-- ── Keep the invoice tab badges in step ─────────────────────────────────────
-- invoice_tab_counts carries its OWN copy of the search predicate, so adding an
-- arm to the client query alone would make the badges disagree with the list:
-- an invoice found by a custom field would show in the rows but not the count.
-- Re-created verbatim from 183 with the one extra arm.
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
language sql stable security invoker set search_path = public as $func$
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
        or i.custom_fields_text ilike '%' || p_search_term || '%'
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
$func$;
