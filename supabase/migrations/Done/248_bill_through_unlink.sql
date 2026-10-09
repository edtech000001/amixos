-- Bill-through links were write-once (migration 240).
--
-- The relationship is stored on BOTH sides and nothing kept them in step:
--
--   source.billed_through[]          → { business_id, invoice_id } of the TARGET
--   target.line_items[].passthrough  → { business_id, invoice_id } of the SOURCE
--
-- `billed_through` was only ever appended to — no code in the app, and no
-- trigger here, ever removed a stamp. So deleting the passthrough line at the
-- target (or deleting the target invoice outright) left the source invoice
-- still claiming "Billed through X · INV-…", with no way to correct it from
-- the UI. The banner asserts that someone else is collecting the money, so a
-- stale one is worse than cosmetic.
--
-- The fix lives in the DATABASE rather than the remove button, because the
-- line can disappear from several places — the invoice editor, line removal,
-- deleting the whole invoice, on either platform. A trigger on the target
-- covers all of them and can't be forgotten by a future code path.
--
-- Direction of ownership: the TARGET's lines are the source of truth. A stamp
-- survives only while a line at the target still points back.

-- ── 1. Keep the two sides in step ──────────────────────────────────────────

create or replace function public.sync_bill_through_links()
returns trigger
language plpgsql
security definer           -- clears a stamp on ANOTHER business's invoice
set search_path = public
as $$
declare
  v_target_id text;
  v_old_sources text[];
  v_new_sources text[];
  v_src text;
begin
  v_target_id := coalesce(old.id, new.id)::text;

  -- Compared as TEXT throughout, never cast to uuid: a malformed id in a
  -- json tag would otherwise raise and block the invoice edit entirely.
  select coalesce(array_agg(distinct li->'passthrough'->>'invoice_id'), '{}')
    into v_old_sources
    from jsonb_array_elements(coalesce(old.line_items, '[]'::jsonb)) li
   where li->'passthrough'->>'invoice_id' is not null;

  if tg_op = 'DELETE' then
    v_new_sources := '{}';
  else
    select coalesce(array_agg(distinct li->'passthrough'->>'invoice_id'), '{}')
      into v_new_sources
      from jsonb_array_elements(coalesce(new.line_items, '[]'::jsonb)) li
     where li->'passthrough'->>'invoice_id' is not null;
  end if;

  foreach v_src in array v_old_sources loop
    if not (v_src = any(v_new_sources)) then
      -- This source no longer has any line here: drop its stamp for us.
      update public.invoices s
         set billed_through = coalesce((
               select jsonb_agg(b)
                 from jsonb_array_elements(s.billed_through) b
                where b->>'invoice_id' is distinct from v_target_id
             ), '[]'::jsonb)
       where s.id::text = v_src
         and jsonb_array_length(coalesce(s.billed_through, '[]'::jsonb)) > 0;
    end if;
  end loop;

  return coalesce(new, old);
end;
$$;

-- No recursion: the update above touches a DIFFERENT row and leaves its
-- line_items alone, so the WHEN clause below filters the resulting event out.
drop trigger if exists invoices_sync_bill_through_upd on public.invoices;
create trigger invoices_sync_bill_through_upd
  after update of line_items on public.invoices
  for each row
  when (old.line_items is distinct from new.line_items)
  execute function public.sync_bill_through_links();

drop trigger if exists invoices_sync_bill_through_del on public.invoices;
create trigger invoices_sync_bill_through_del
  after delete on public.invoices
  for each row
  execute function public.sync_bill_through_links();

-- Trigger functions are never called directly (see migration 237).
revoke execute on function public.sync_bill_through_links() from public, authenticated, anon;

-- ── 2. Repair the stamps that already went stale ───────────────────────────
-- Keeps only stamps whose target still carries a line pointing back here.

update public.invoices s
   set billed_through = coalesce((
         select jsonb_agg(b)
           from jsonb_array_elements(s.billed_through) b
          where exists (
            select 1
              from public.invoices t,
                   jsonb_array_elements(coalesce(t.line_items, '[]'::jsonb)) li
             where t.id::text = b->>'invoice_id'
               and li->'passthrough'->>'invoice_id' = s.id::text
          )
       ), '[]'::jsonb)
 where jsonb_array_length(coalesce(s.billed_through, '[]'::jsonb)) > 0;
