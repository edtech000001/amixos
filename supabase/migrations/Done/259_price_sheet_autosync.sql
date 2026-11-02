-- 259: Price sheet AUTO-SYNC.
--
-- Migration 242 lets an owner/admin copy one company's price sheet onto their
-- other companies with a button. Auto-sync keeps a target a live MIRROR of a
-- source: every change to the source's prices (add / edit / delete / reorder /
-- (de)activate, section order, sheet design) re-runs the same sync onto each
-- auto-synced target, so the user never has to press "copy" again.
--
--   price_sheet_autosync   one row per (source → target) link. A target
--                          follows at most ONE source; a business is either a
--                          source or a target, never both (no chains / loops —
--                          a synced write never re-triggers another sync).
--   _sync_price_sheet      the 242 body, minus the caller check, with audit
--                          optional (internal: triggers + the RPCs below).
--   sync_price_sheet       unchanged API: checks the caller, then the above.
--   set_price_sheet_autosync(source, target, enabled)
--                          turn a link on/off (owner/admin of BOTH). Turning
--                          it on does NOT sync by itself — the app runs the
--                          normal preview → copy first, then enables.
--   triggers               statement-level on price_sheet_items (+ row-level
--                          on businesses for section order / template) → sync
--                          every auto-synced target of the changed source.
--                          A transaction-local flag (amixos.price_autosync)
--                          stops the target writes from re-entering.
--
-- The target's price sheet is read-only in the app while it follows a source
-- (edits there would be overwritten on the next source change).
--
-- Abuse / staleness guards — a link is only as good as the person behind it:
--   • Turning a link ON needs owner/admin of BOTH companies; the link records
--     who (enabled_by). Turning it OFF needs owner/admin of EITHER company —
--     a company can always disconnect from someone else's prices.
--   • Every sync re-checks that enabled_by is STILL owner/admin of both. If
--     not (removed from a company, demoted, account deleted) the link is
--     deleted and nothing is copied.
--   • A business_members trigger deletes the person's links the moment they
--     lose owner/admin in either company, so no stale "on" is ever shown.
--   • Deleting the user or either business removes the link (cascade).
--   • Only the internal functions write the table; RLS is read-only.
--
-- Safe to re-run. IMPORTANT: run manually in the Supabase SQL Editor.

create table if not exists public.price_sheet_autosync (
  source_business_id uuid not null references public.businesses(id) on delete cascade,
  target_business_id uuid not null references public.businesses(id) on delete cascade,
  enabled_by         uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (target_business_id),
  check (source_business_id <> target_business_id)
);
create index if not exists price_sheet_autosync_source_idx on public.price_sheet_autosync (source_business_id);

alter table public.price_sheet_autosync enable row level security;

-- Members of either side see the link (the target's sheet shows "synced
-- from …"). Writes go through set_price_sheet_autosync only.
drop policy if exists "members read price_sheet_autosync" on public.price_sheet_autosync;
create policy "members read price_sheet_autosync" on public.price_sheet_autosync for select
  using (source_business_id in (select public.my_member_business_ids())
      or target_business_id in (select public.my_member_business_ids()));

-- Owner/admin check for ANY user (is_business_admin only checks the caller).
create or replace function public._user_is_business_admin(p_user uuid, p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members
     where business_id = p_business and user_id = p_user and role in ('owner', 'admin')
  );
$$;

revoke execute on function public._user_is_business_admin(uuid, uuid) from public, anon, authenticated;

-- ── Internal sync (242 body; no caller check; audit optional) ──────────────
create or replace function public._sync_price_sheet(p_source uuid, p_target uuid, p_preview boolean, p_audit boolean)
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
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'choose two different businesses';
  end if;
  if (select count(*) from businesses where id in (p_source, p_target)) <> 2 then
    raise exception 'unknown business';
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

  if not p_preview and p_audit then
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

revoke execute on function public._sync_price_sheet(uuid, uuid, boolean, boolean) from public, anon, authenticated;

-- ── Public sync: same signature + check as 242 ──────────────────────────────
create or replace function public.sync_price_sheet(p_source uuid, p_target uuid, p_preview boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_api boolean := coalesce(current_setting('request.jwt.claims', true), '') <> '';
begin
  -- App callers must administer BOTH businesses. (SQL Editor has no JWT.)
  if v_api and not (auth.uid() is not null
                    and public.is_business_admin(p_source)
                    and public.is_business_admin(p_target)) then
    raise exception 'not allowed: you must be an owner or admin of both businesses'
      using errcode = '42501';
  end if;
  return public._sync_price_sheet(p_source, p_target, p_preview, true);
end;
$$;

revoke execute on function public.sync_price_sheet(uuid, uuid, boolean) from public, anon;
grant execute on function public.sync_price_sheet(uuid, uuid, boolean) to authenticated;

-- ── Turn auto-sync on / off ─────────────────────────────────────────────────
create or replace function public.set_price_sheet_autosync(p_source uuid, p_target uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other text;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'choose two different businesses';
  end if;
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- OFF: owner/admin of EITHER side may disconnect.
  if not p_enabled then
    if not (public.is_business_admin(p_source) or public.is_business_admin(p_target)) then
      raise exception 'not allowed: you must be an owner or admin of one of these businesses'
        using errcode = '42501';
    end if;
    delete from price_sheet_autosync
     where source_business_id = p_source and target_business_id = p_target;
    return;
  end if;

  -- ON: owner/admin of BOTH.
  if not (public.is_business_admin(p_source) and public.is_business_admin(p_target)) then
    raise exception 'not allowed: you must be an owner or admin of both businesses'
      using errcode = '42501';
  end if;

  -- No chains: the source must not itself follow another company, and the
  -- target must not be a source for others.
  if exists (select 1 from price_sheet_autosync where target_business_id = p_source) then
    raise exception 'this company''s prices already sync from another company' using errcode = '22023';
  end if;
  if exists (select 1 from price_sheet_autosync where source_business_id = p_target) then
    raise exception 'the other company already syncs its prices to other companies' using errcode = '22023';
  end if;
  select b.name into v_other
    from price_sheet_autosync a join businesses b on b.id = a.source_business_id
   where a.target_business_id = p_target and a.source_business_id <> p_source;
  if v_other is not null then
    raise exception 'that company already syncs from %', v_other using errcode = '22023';
  end if;

  insert into price_sheet_autosync (source_business_id, target_business_id, enabled_by)
  values (p_source, p_target, auth.uid())
  on conflict (target_business_id) do nothing;

  insert into audit_log (business_id, user_id, action, entity_type, details)
  values (p_source, auth.uid(), 'price_sheet.autosync_on', 'price_sheet',
          jsonb_build_object('target_business_id', p_target,
                             'target_business_name', (select name from businesses where id = p_target)));
end;
$$;

revoke execute on function public.set_price_sheet_autosync(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_price_sheet_autosync(uuid, uuid, boolean) to authenticated;

-- ── Run auto-sync for a set of changed source businesses ───────────────────
create or replace function public._run_price_sheet_autosync(p_sources uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l record;
begin
  -- Already inside a sync (these are the target's own writes) → stop here.
  if coalesce(current_setting('amixos.price_autosync', true), '') = 'on' then
    return;
  end if;
  -- Links whose owner no longer administers BOTH companies are dropped, never run.
  delete from price_sheet_autosync a
   where a.source_business_id = any (p_sources)
     and not (public._user_is_business_admin(a.enabled_by, a.source_business_id)
              and public._user_is_business_admin(a.enabled_by, a.target_business_id));

  for l in
    select source_business_id, target_business_id
      from price_sheet_autosync
     where source_business_id = any (p_sources)
  loop
    perform set_config('amixos.price_autosync', 'on', true);
    begin
      perform public._sync_price_sheet(l.source_business_id, l.target_business_id, false, false);
    exception when others then
      -- Never fail the user's own edit because a mirror couldn't update.
      raise warning 'price auto-sync % -> % failed: %', l.source_business_id, l.target_business_id, sqlerrm;
    end;
    perform set_config('amixos.price_autosync', '', true);
  end loop;
end;
$$;

revoke execute on function public._run_price_sheet_autosync(uuid[]) from public, anon, authenticated;

-- Statement-level: one sync per statement, however many rows it touched.
-- (Transition tables allow only one event per trigger, hence three.)
create or replace function public.price_sheet_items_autosync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('amixos.price_autosync', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public._run_price_sheet_autosync(array(select distinct business_id from ps_old));
  else
    perform public._run_price_sheet_autosync(array(select distinct business_id from ps_new));
  end if;
  return null;
end;
$$;

revoke execute on function public.price_sheet_items_autosync() from public, anon, authenticated;

drop trigger if exists price_sheet_items_autosync_ins on public.price_sheet_items;
create trigger price_sheet_items_autosync_ins
  after insert on public.price_sheet_items
  referencing new table as ps_new
  for each statement execute function public.price_sheet_items_autosync();

drop trigger if exists price_sheet_items_autosync_upd on public.price_sheet_items;
create trigger price_sheet_items_autosync_upd
  after update on public.price_sheet_items
  referencing new table as ps_new
  for each statement execute function public.price_sheet_items_autosync();

drop trigger if exists price_sheet_items_autosync_del on public.price_sheet_items;
create trigger price_sheet_items_autosync_del
  after delete on public.price_sheet_items
  referencing old table as ps_old
  for each statement execute function public.price_sheet_items_autosync();

-- Section order / sheet design live on businesses.
create or replace function public.businesses_price_autosync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_section_order is distinct from old.price_section_order
     or new.price_sheet_template is distinct from old.price_sheet_template then
    perform public._run_price_sheet_autosync(array[new.id]);
  end if;
  return null;
end;
$$;

revoke execute on function public.businesses_price_autosync() from public, anon, authenticated;

drop trigger if exists businesses_price_autosync on public.businesses;
create trigger businesses_price_autosync
  after update of price_section_order, price_sheet_template on public.businesses
  for each row execute function public.businesses_price_autosync();

-- Losing owner/admin in either company ends that person's links at once.
create or replace function public.business_members_price_autosync_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from price_sheet_autosync a
   where a.enabled_by = old.user_id
     and old.business_id in (a.source_business_id, a.target_business_id)
     and not public._user_is_business_admin(old.user_id, old.business_id);
  return null;
end;
$$;

revoke execute on function public.business_members_price_autosync_cleanup() from public, anon, authenticated;

drop trigger if exists business_members_price_autosync_cleanup on public.business_members;
create trigger business_members_price_autosync_cleanup
  after delete or update of role, user_id, business_id on public.business_members
  for each row execute function public.business_members_price_autosync_cleanup();

notify pgrst, 'reload schema';
