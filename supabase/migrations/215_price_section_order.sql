-- 215 — User-defined order for price sheet sections
--
-- price_sheet_items.sort_order already orders items. Sections do not have a
-- table of their own — `category` is free text on the item — so their order
-- needs somewhere to live. A jsonb array of category names on the business
-- keeps that without inventing a table for what is effectively a display
-- preference, matching client_field_required and job_pipeline_disabled.
--
-- Names not present in the array sort after the listed ones, alphabetically, so
-- a section created after the order was saved appears predictably at the end
-- instead of vanishing or jumping to the front.

alter table public.businesses
  add column if not exists price_section_order jsonb;

comment on column public.businesses.price_section_order is
  'Ordered array of price_sheet_items.category names, e.g. ["Grain Bins","Floors"]. '
  'Drives section order on the price sheet AND in the invoice "view prices" sheet — '
  'the two read through the same helper so they can never disagree. Categories '
  'missing from the array sort last, alphabetically.';
