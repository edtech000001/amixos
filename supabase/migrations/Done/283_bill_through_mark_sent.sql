-- 283_bill_through_mark_sent.sql
-- Bill-through (240/248/250): company B's work is billed to the client on
-- company A's invoice. B's own (source) invoice sat in Draft forever. Now,
-- when A's (target) invoice leaves Draft — sent, or straight to paid — every
-- linked source invoice that is still a Draft becomes Sent, with A's sent date.
--
-- Security (same guard as 250): the source is only touched when ITS OWN
-- billed_through already names this target invoice. That stamp is written
-- when the link is made by someone who can write B's invoice, so a member of
-- A can't flip an arbitrary invoice by editing a passthrough tag in A's lines.
-- Only Draft → Sent; never un-sends, never touches paid/cancelled invoices.
--
-- Run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.bill_through_mark_source_sent()
returns trigger
language plpgsql
security definer           -- writes ANOTHER business's invoice (the source)
set search_path = public
as $$
declare
  v_target_id text := new.id::text;
  v_src text;
begin
  begin
    for v_src in
      select distinct li->'passthrough'->>'invoice_id'
        from jsonb_array_elements(coalesce(new.line_items, '[]'::jsonb)) li
       where li->'passthrough'->>'invoice_id' is not null
    loop
      update public.invoices s
         set status = 'sent',
             sent_at = coalesce(s.sent_at, new.sent_at, now())
       where s.id::text = v_src           -- text compare: a bad tag never raises
         and s.status = 'draft'
         and exists (
               select 1 from jsonb_array_elements(coalesce(s.billed_through, '[]'::jsonb)) b
                where b->>'invoice_id' = v_target_id);
    end loop;
  exception when others then
    -- Never block sending A's invoice over B's bookkeeping.
    raise warning 'bill_through_mark_source_sent: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists invoices_bill_through_mark_sent on public.invoices;
create trigger invoices_bill_through_mark_sent
  after update on public.invoices
  for each row
  when (old.status = 'draft' and new.status is distinct from 'draft')
  execute function public.bill_through_mark_source_sent();

revoke execute on function public.bill_through_mark_source_sent() from public, authenticated, anon;

-- Backfill: targets already past Draft whose linked source is still a Draft.
update public.invoices s
   set status = 'sent',
       sent_at = coalesce(s.sent_at, t.sent_at, t.updated_at, now())
  from public.invoices t
 where s.status = 'draft'
   and t.status <> 'draft'
   and exists (select 1 from jsonb_array_elements(coalesce(s.billed_through, '[]'::jsonb)) b
                where b->>'invoice_id' = t.id::text)
   and exists (select 1 from jsonb_array_elements(coalesce(t.line_items, '[]'::jsonb)) li
                where li->'passthrough'->>'invoice_id' = s.id::text);
