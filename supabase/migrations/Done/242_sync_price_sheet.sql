-- 242 — "Sync prices from another company"
--
-- A user who runs several related businesses (e.g. Pivot Builders, Champion
-- Built, Blessing Pivots) keeps ONE master price sheet and mirrors it onto the
-- others. This is the app-callable version of the old admin script
-- (supabase/scripts/clone_price_sheet.sql).
--
-- sync_price_sheet(source, target, preview) makes the TARGET's price sheet
-- match the SOURCE's (a mirror, not a merge):
--
--   Items      Matched to the target's existing items by name + category, so a
--              matching item keeps its id and is UPDATED in place (job lines
--              autopriced from it stay linked via job_items.price_item_id).
--              New items are inserted; target items the source doesn't have
--              are deleted.
--   Client     client_rates { "<client_id>": rate } — client ids are per
--   prices     business, so each source client is matched to a TARGET client:
--              same email → same phone (last 10 digits) → same first+last name
--              → same company; the first level with exactly ONE match wins.
--              No match / several matches → that price is skipped and reported.
--              Clients are never created.
--   Tiers      Not copied (retired in 197); target tier_rates cleared.
--   Design     price_sheet_template (hidden items remapped to target ids) and
--              price_section_order.
--
-- preview = true reports what WOULD happen and writes nothing.
--
-- Access: the caller must be owner/admin of BOTH businesses — it overwrites a
-- whole price sheet. SECURITY DEFINER with the check inside (the temp tables
-- and cross-business reads don't fit RLS). Run from the SQL Editor (no JWT)
-- it's an admin tool and skips the check. Each real sync is written to BOTH
-- businesses' audit log.
--
-- Returns jsonb:
--   { preview, updated, added, removed,
--     clientPrices: [{ item, client, rate, how, candidates }] }
--   how: 'email' | 'phone' | 'name' | 'company' (copied) | 'none' | 'ambiguous' (skipped)
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

drop function if exists public.clone_price_sheet(uuid, uuid);
drop function if exists public.clone_price_sheet(uuid, uuid, boolean);

create or replace function public.sync_price_sheet(p_source uuid, p_target uuid, p_preview boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_updated int;
  n_added int;
  n_removed int;
  v_report jsonb;
  v_api boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'choose two different businesses';
  end if;
  if (select count(*) from businesses where id in (p_source, p_target)) <> 2 then
    raise exception 'unknown business';
  end if;
  -- App callers must administer BOTH businesses. (SQL Editor has no JWT.)
  if v_api and not (auth.uid() is not null
                    and public.is_business_admin(p_source)
                    and public.is_business_admin(p_target)) then
    raise exception 'not allowed: you must be an owner or admin of both businesses'
      using errcode = '42501';
  end if;

  -- ── Client map: source client → target client ────────────────────────────
  drop table if exists _sps_clients;
  create temp table _sps_clients on commit drop as
  with keyed as (
    select c.business_id, c.id,
           nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') as display,
           lower(nullif(trim(c.email_office), '')) as e1,
           lower(nullif(trim(c.email_home), '')) as e2,
           nullif(right(regexp_replace(coalesce(c.phone_cell, ''), '\D', '', 'g'), 10), '') as ph,
           nullif(lower(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))), '') as nm,
           lower(nullif(trim(c.company), '')) as co,
           c.company
    from clients c
    where c.business_id in (p_source, p_target)
  ),
  src as (
    select k.* from keyed k
    where k.business_id = p_source
      and k.id::text in (
        select jsonb_object_keys(i.client_rates)
        from price_sheet_items i
        where i.business_id = p_source and jsonb_typeof(i.client_rates) = 'object'
      )
  ),
  tgt as (select k.* from keyed k where k.business_id = p_target),
  cand as (
    select s.id as sid, t.id as tid, 1 as lvl, 'email' as how
      from src s join tgt t
        on (s.e1 is not null and s.e1 in (t.e1, t.e2)) or (s.e2 is not null and s.e2 in (t.e1, t.e2))
    union all
    select s.id, t.id, 2, 'phone' from src s join tgt t on length(s.ph) = 10 and s.ph = t.ph
    union all
    select s.id, t.id, 3, 'name' from src s join tgt t on s.nm = t.nm
    union all
    select s.id, t.id, 4, 'company' from src s join tgt t on s.co = t.co
  ),
  best as (select sid, min(lvl) as lvl from cand group by sid),
  pick as (
    select c.sid, min(c.how) as how, count(distinct c.tid) as n, min(c.tid::text)::uuid as tid
    from cand c join best b on b.sid = c.sid and b.lvl = c.lvl
    group by c.sid
  )
  select s.id as sid,
         coalesce(s.display, s.company, '—') as src_name,
         case when p.n = 1 then p.tid end as tid,
         case when p.n = 1 then p.how when p.n > 1 then 'ambiguous' else 'none' end as how,
         coalesce(p.n, 0) as candidates
  from src s left join pick p on p.sid = s.id;

  -- ── Item map: source item → target item (existing id, or a new one) ──────
  drop table if exists _sps_items;
  create temp table _sps_items on commit drop as
  with s as (
    select id, lower(trim(name)) as k1, coalesce(lower(trim(category)), '') as k2,
           row_number() over (partition by lower(trim(name)), coalesce(lower(trim(category)), '') order by sort_order, id) as rn
    from price_sheet_items where business_id = p_source
  ),
  t as (
    select id, lower(trim(name)) as k1, coalesce(lower(trim(category)), '') as k2,
           row_number() over (partition by lower(trim(name)), coalesce(lower(trim(category)), '') order by sort_order, id) as rn
    from price_sheet_items where business_id = p_target
  )
  select s.id as sid, coalesce(t.id, gen_random_uuid()) as tid, (t.id is not null) as existed
  from s left join t on t.k1 = s.k1 and t.k2 = s.k2 and t.rn = s.rn;

  n_updated := (select count(*) from _sps_items where existed);
  n_added := (select count(*) from _sps_items where not existed);
  n_removed := (select count(*) from price_sheet_items x
                where x.business_id = p_target
                  and x.id not in (select m.tid from _sps_items m where m.existed));

  if not p_preview then
    delete from price_sheet_items x
    where x.business_id = p_target
      and x.id not in (select m.tid from _sps_items m where m.existed);

    update price_sheet_items x set
      name = p.name,
      category = p.category,
      pricing_mode = p.pricing_mode,
      unit_label = p.unit_label,
      rate = p.rate,
      state_rates = p.state_rates,
      sort_order = p.sort_order,
      active = p.active,
      match_terms = p.match_terms,
      is_addon = p.is_addon,
      addon_inline = p.addon_inline,
      tier_rates = null,
      client_rates = (
        select jsonb_object_agg(cm.tid::text, kv.value)
        from jsonb_each(case when jsonb_typeof(p.client_rates) = 'object' then p.client_rates else '{}'::jsonb end) kv
        join _sps_clients cm on cm.sid::text = kv.key and cm.tid is not null
      ),
      updated_at = now()
    from _sps_items m
    join price_sheet_items p on p.id = m.sid
    where x.id = m.tid and m.existed;

    insert into price_sheet_items (
      id, business_id, name, category, pricing_mode, unit_label, rate, state_rates,
      sort_order, active, match_terms, is_addon, addon_inline, tier_rates, client_rates, created_by
    )
    select
      m.tid, p_target, p.name, p.category, p.pricing_mode, p.unit_label, p.rate, p.state_rates,
      p.sort_order, p.active, p.match_terms, p.is_addon, p.addon_inline, null,
      (
        select jsonb_object_agg(cm.tid::text, kv.value)
        from jsonb_each(case when jsonb_typeof(p.client_rates) = 'object' then p.client_rates else '{}'::jsonb end) kv
        join _sps_clients cm on cm.sid::text = kv.key and cm.tid is not null
      ),
      auth.uid()
    from _sps_items m
    join price_sheet_items p on p.id = m.sid
    where not m.existed;

    update businesses b set
      price_sheet_template = case
        when jsonb_typeof(s.tpl) <> 'object' then s.tpl
        else jsonb_set(s.tpl, '{hiddenItemIds}', coalesce((
          select jsonb_agg(m.tid::text)
          from jsonb_array_elements_text(
            case when jsonb_typeof(s.tpl -> 'hiddenItemIds') = 'array' then s.tpl -> 'hiddenItemIds' else '[]'::jsonb end
          ) h
          join _sps_items m on m.sid::text = h
        ), '[]'::jsonb))
      end,
      price_section_order = s.pso
    from (select price_sheet_template as tpl, price_section_order as pso from businesses where id = p_source) s
    where b.id = p_target;
  end if;

  v_report := jsonb_build_object(
    'preview', p_preview,
    'updated', n_updated,
    'added', n_added,
    'removed', n_removed,
    'clientPrices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item', i.name, 'client', cm.src_name, 'rate', i.client_rates -> cm.sid::text,
               'how', cm.how, 'candidates', cm.candidates)
             order by (cm.tid is not null), cm.src_name, i.name)
      from price_sheet_items i
      join _sps_clients cm on i.client_rates ? cm.sid::text
      where i.business_id = p_source and jsonb_typeof(i.client_rates) = 'object'
    ), '[]'::jsonb)
  );

  if not p_preview then
    insert into audit_log (business_id, user_id, action, entity_type, details)
    values
      (p_target, auth.uid(), 'price_sheet.synced', 'price_sheet',
       jsonb_build_object('direction', 'in', 'source_business_id', p_source,
                          'source_business_name', (select name from businesses where id = p_source),
                          'updated', n_updated, 'added', n_added, 'removed', n_removed)),
      (p_source, auth.uid(), 'price_sheet.synced', 'price_sheet',
       jsonb_build_object('direction', 'out', 'target_business_id', p_target,
                          'target_business_name', (select name from businesses where id = p_target),
                          'updated', n_updated, 'added', n_added, 'removed', n_removed));
  end if;

  return v_report;
end;
$$;

-- Callable by signed-in users only (the admin check is inside); never anon.
revoke execute on function public.sync_price_sheet(uuid, uuid, boolean) from public, anon;
grant execute on function public.sync_price_sheet(uuid, uuid, boolean) to authenticated;
