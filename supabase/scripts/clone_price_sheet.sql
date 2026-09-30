-- Mirror one business's price sheet onto others — SQL Editor version of the
-- app's "Sync prices from…" button. NOT a migration; an admin tool.
--
-- Requires migration 242 (public.sync_price_sheet). All the logic — item
-- matching, client-price remapping, what's copied and what isn't — lives and
-- is documented there, so the app and this script can never disagree.
--
-- Starts as a PREVIEW (the `true` in each call): run it, read the report,
-- then change both `true` to `false` and run again to actually copy.
--
--   Pivot Builders   d0f73474-b503-41d5-a33f-8a95fff94c17  (source)
--   Champion Built   27e313fa-fd2f-44e8-b47d-31041a16b09f
--   Blessing Pivots  bcb5bfdc-af63-4f80-a072-7077b2adaf19

with runs as (
  select 'Champion Built' as target, public.sync_price_sheet(
    'd0f73474-b503-41d5-a33f-8a95fff94c17', '27e313fa-fd2f-44e8-b47d-31041a16b09f', true) as r
  union all
  select 'Blessing Pivots', public.sync_price_sheet(
    'd0f73474-b503-41d5-a33f-8a95fff94c17', 'bcb5bfdc-af63-4f80-a072-7077b2adaf19', true)
)
-- One summary row per target…
select target,
       case when (r ->> 'preview')::boolean then 'PREVIEW (nothing changed)' else 'DONE' end as kind,
       null as item, null as client,
       format('%s updated, %s added, %s removed', r ->> 'updated', r ->> 'added', r ->> 'removed') as detail
from runs
union all
-- …then every client price: copied (and how the client matched) or skipped.
select target,
       case when cp ->> 'how' in ('none', 'ambiguous') then 'client price SKIPPED' else 'client price copied' end,
       cp ->> 'item', cp ->> 'client',
       case cp ->> 'how'
         when 'none' then 'client not found in target'
         when 'ambiguous' then (cp ->> 'candidates') || ' possible matches'
         else 'matched by ' || (cp ->> 'how')
       end || ' · ' || (cp ->> 'rate')
from runs, jsonb_array_elements(r -> 'clientPrices') cp
order by 1, 2 desc;
