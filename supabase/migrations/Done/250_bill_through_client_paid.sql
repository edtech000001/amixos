-- 250_bill_through_client_paid.sql
-- "The client paid the other company — collect your share."
--
-- Bill-through (240/248): company B's work is billed to the client on company
-- A's invoice. B's own (source) invoice stays unpaid until A pays B. Nothing
-- told B when the CLIENT had paid A, so B's share sat with A unnoticed.
--
-- Now, when A's (target) invoice becomes PAID, the link stored on B's source
-- invoice (billed_through[].invoice_id = A's invoice) gets `client_paid_at`.
-- It's removed again if A's invoice goes back to unpaid. Partial payments
-- don't stamp — only a fully paid target (decided 2026-10-25).
--
-- Like 248 this lives in the DATABASE: an invoice can be marked paid from
-- several places (detail screen, record payment, list actions, web + mobile),
-- and B's members may not be able to read A's invoices at all.
--
-- Also: invoices_collect_from_partners(business) — B's unpaid invoices whose
-- client has already paid the other company (dashboard card).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

-- ── 1. Stamp / unstamp the source link when the target's paid state flips ──
create or replace function public.stamp_bill_through_client_paid()
returns trigger
language plpgsql
security definer           -- writes ANOTHER business's invoice (the source)
set search_path = public
as $$
declare
  v_target_id text := new.id::text;
  v_was_paid boolean := old.status = 'paid';
  v_is_paid  boolean := new.status = 'paid';
  v_paid_at  text;
  v_src text;
begin
  if v_was_paid = v_is_paid then
    return new;
  end if;
  v_paid_at := to_char(coalesce(new.paid_at, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  -- Text comparisons only (as in 248): a malformed id in a json tag must
  -- never raise and block marking the invoice paid.
  for v_src in
    select distinct li->'passthrough'->>'invoice_id'
      from jsonb_array_elements(coalesce(new.line_items, '[]'::jsonb)) li
     where li->'passthrough'->>'invoice_id' is not null
  loop
    update public.invoices s
       set billed_through = coalesce((
             select jsonb_agg(
                      case
                        when b->>'invoice_id' is distinct from v_target_id then b
                        when v_is_paid then b || jsonb_build_object('client_paid_at', v_paid_at)
                        else b - 'client_paid_at'
                      end)
               from jsonb_array_elements(s.billed_through) b
           ), '[]'::jsonb)
     where s.id::text = v_src
       and jsonb_array_length(coalesce(s.billed_through, '[]'::jsonb)) > 0;
  end loop;

  return new;
end;
$$;

drop trigger if exists invoices_stamp_bill_through_paid on public.invoices;
create trigger invoices_stamp_bill_through_paid
  after update of status on public.invoices
  for each row
  when (old.status is distinct from new.status)
  execute function public.stamp_bill_through_client_paid();

-- Trigger functions are never callable by clients (see 237).
revoke execute on function public.stamp_bill_through_client_paid() from public, authenticated, anon;

-- ── 2. Backfill: targets that are ALREADY paid ─────────────────────────────
update public.invoices s
   set billed_through = (
         select jsonb_agg(
                  case
                    when t.id is not null and t.status = 'paid'
                      then b || jsonb_build_object('client_paid_at',
                             to_char(coalesce(t.paid_at, t.updated_at, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                    else b
                  end)
           from jsonb_array_elements(s.billed_through) b
           left join public.invoices t on t.id::text = b->>'invoice_id'
       )
 where jsonb_array_length(coalesce(s.billed_through, '[]'::jsonb)) > 0
   and exists (
         select 1
           from jsonb_array_elements(s.billed_through) b
           join public.invoices t on t.id::text = b->>'invoice_id'
          where t.status = 'paid' and b->>'client_paid_at' is null
       );

-- ── 3. Dashboard: "owed by your other companies" ───────────────────────────
-- Security INVOKER: RLS decides which of this business's invoices the caller
-- sees. Reads only the caller's own business's rows (the stamp carries the
-- other company's name/number, so A's invoice is never read).
create or replace function public.invoices_collect_from_partners(p_business_id uuid)
returns table (
  id uuid,
  invoice_number text,
  total_amount numeric,
  partner_business_name text,
  partner_invoice_number text,
  client_paid_at text
)
language sql stable security invoker set search_path = public as $$
  select i.id,
         i.invoice_number,
         i.total_amount,
         b->>'business_name',
         b->>'invoice_number',
         b->>'client_paid_at'
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.billed_through, '[]'::jsonb)) b
   where i.business_id = p_business_id
     and i.status not in ('paid', 'cancelled')
     and b->>'client_paid_at' is not null
   order by b->>'client_paid_at' desc;
$$;

revoke all on function public.invoices_collect_from_partners(uuid) from public, anon;
grant execute on function public.invoices_collect_from_partners(uuid) to authenticated, service_role;
