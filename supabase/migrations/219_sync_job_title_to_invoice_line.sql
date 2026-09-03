-- 219 — Renaming a job updates its draft invoice line immediately
--
-- A job that bills as ONE line has that line named after it, and
-- rebuildInvoiceLineItems() already keeps the two in step. But it only runs
-- when the invoice screen loads, so between renaming a job and next opening the
-- invoice the two disagree — and if you print or send in that window, the
-- customer gets the old name.
--
-- This moves the rule into the database so it fires on the write itself. That
-- also covers every path at once — web, mobile, the offline outbox replay, the
-- assistant, the CSV importer — instead of each client remembering to do it.
--
-- The client-side rebuild stays: it does more than titles (re-derives items,
-- prices, add-ons). This just removes the lag on the one field a user watches.

create or replace function public.sync_job_title_to_invoice_line()
returns trigger
language plpgsql
-- SECURITY DEFINER so the sync cannot half-apply: whoever may rename the job
-- may not separately hold write access to the invoice row. The body is
-- deliberately narrow — it only ever copies THIS job's title onto a line
-- already linked to THIS job, on the invoice the job itself points at. It
-- cannot touch any other row, invoice, or field.
security definer
set search_path = public
as $$
begin
  if new.invoice_id is null then
    return new;
  end if;

  update public.invoices i
  set line_items = (
    select jsonb_agg(
             case
               when (li ->> 'job_id') = new.id::text
                    and coalesce((li ->> 'addon')::boolean, false) = false
                 then jsonb_set(li, '{description}', to_jsonb(new.title))
               else li
             end
             order by ord
           )
    -- WITH ORDINALITY + ORDER BY: jsonb_agg has no inherent order, and the
    -- invoice's line order is user-visible (they can sort it). Rebuilding the
    -- array unordered would silently reshuffle the document.
    from jsonb_array_elements(i.line_items) with ordinality as t(li, ord)
  )
  where i.id = new.invoice_id
    -- Draft only. A sent invoice is a document the customer already has;
    -- rewriting its text afterwards is worse than a stale name. Mirrors the
    -- guard in rebuildInvoiceLineItems().
    and i.status = 'draft'
    and jsonb_typeof(i.line_items) = 'array'
    -- Only when the job bills as exactly ONE non-add-on line. An itemized job's
    -- lines carry their own meaning ("Travel fee", "4 Tower Assembly"); naming
    -- them all after the job would destroy real content.
    and (
      select count(*)
      from jsonb_array_elements(i.line_items) e
      where (e ->> 'job_id') = new.id::text
        and coalesce((e ->> 'addon')::boolean, false) = false
    ) = 1;

  return new;
end;
$$;

comment on function public.sync_job_title_to_invoice_line() is
  'Keeps a single-line draft invoice''s description in step with its job title, '
  'immediately rather than on the next invoice open. Mirrors the single-line rule '
  'in rebuildInvoiceLineItems() — change both together.';

drop trigger if exists jobs_sync_title_to_invoice_line on public.jobs;

create trigger jobs_sync_title_to_invoice_line
  after update of title on public.jobs
  for each row
  -- Only when the title actually changed. Without this every job update (status,
  -- hours, a photo) would rewrite the invoice's whole line_items array.
  when (old.title is distinct from new.title)
  execute function public.sync_job_title_to_invoice_line();
