-- Per-add-on layout choice for autoprice.
--
-- A FLAT add-on (e.g. a $600 loading fee) can either:
--   • addon_inline = false (default) → autoprice puts it on its OWN line under
--     the matched job, keeping the job's per-unit rate clean.
--   • addon_inline = true            → autoprice FOLDS it into the matched
--     line's total (blended rate + a note), so it reads as part of that line.
--
-- Only meaningful for flat add-ons; per-unit add-ons always raise the base
-- rate. No effect on non-add-on items.
alter table public.price_sheet_items
  add column if not exists addon_inline boolean not null default false;

comment on column public.price_sheet_items.addon_inline is
  'Flat add-ons only: true = fold this surcharge into the matched line''s total (blended); false (default) = show it as its own line under the job.';
