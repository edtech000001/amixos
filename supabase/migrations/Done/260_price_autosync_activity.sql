-- 260: Price auto-sync in BOTH companies' Activity log.
--
-- 259 logged only "auto-sync on", and only in the source company. An owner of
-- the company whose prices get replaced had no record of it. Now every
-- auto-sync event is written to the Activity log of BOTH companies, saying
-- who did it and which company is on the other side:
--
--   price_sheet.autosync_on        turned on (owner/admin of both)
--   price_sheet.autosync_off       turned off (owner/admin of either side)
--   price_sheet.autosync_auto_off  switched off automatically: the person who
--                                  turned it on is no longer owner/admin of
--                                  both companies (removed, demoted, deleted)
--
-- details: { direction: 'out' (this company shares its prices) | 'in' (this
--            company follows), other_business_id, other_business_name,
--            [lost_access_name] }
--
-- Only function bodies change (same signatures as 259). Safe to re-run.
-- IMPORTANT: run manually in the Supabase SQL Editor.

-- One event → one row in each company's log.
create or replace function public._log_price_autosync(
  p_source uuid, p_target uuid, p_action text, p_actor uuid, p_lost_access_name text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (business_id, user_id, action, entity_type, details)
  select x.biz, p_actor, p_action, 'price_sheet',
         jsonb_strip_nulls(jsonb_build_object(
           'direction', x.dir,
           'other_business_id', x.other,
           'other_business_name', (select name from businesses where id = x.other),
           'lost_access_name', p_lost_access_name))
    from (values (p_source, 'out', p_target), (p_target, 'in', p_source)) as x(biz, dir, other);
$$;

revoke execute on function public._log_price_autosync(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Display name of a user, for "switched off — X no longer has access".
create or replace function public._user_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  nullif(u.raw_user_meta_data ->> 'name', ''),
                  u.email)
    from auth.users u where u.id = p_user;
$$;

revoke execute on function public._user_display_name(uuid) from public, anon, authenticated;

-- ── On / off: same rules as 259, now logged on both sides ──────────────────
create or replace function public.set_price_sheet_autosync(p_source uuid, p_target uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other text;
  v_removed int;
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
    get diagnostics v_removed = row_count;
    if v_removed > 0 then
      perform public._log_price_autosync(p_source, p_target, 'price_sheet.autosync_off', auth.uid());
    end if;
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
  if found then
    perform public._log_price_autosync(p_source, p_target, 'price_sheet.autosync_on', auth.uid());
  end if;
end;
$$;

revoke execute on function public.set_price_sheet_autosync(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_price_sheet_autosync(uuid, uuid, boolean) to authenticated;

-- ── Sync runner: stale links are dropped AND logged ────────────────────────
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
  for l in
    delete from price_sheet_autosync a
     where a.source_business_id = any (p_sources)
       and not (public._user_is_business_admin(a.enabled_by, a.source_business_id)
                and public._user_is_business_admin(a.enabled_by, a.target_business_id))
    returning a.source_business_id, a.target_business_id, a.enabled_by
  loop
    perform public._log_price_autosync(l.source_business_id, l.target_business_id,
      'price_sheet.autosync_auto_off', null, public._user_display_name(l.enabled_by));
  end loop;

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

-- ── Losing owner/admin ends that person's links — now logged ───────────────
create or replace function public.business_members_price_autosync_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  for l in
    delete from price_sheet_autosync a
     where a.enabled_by = old.user_id
       and old.business_id in (a.source_business_id, a.target_business_id)
       and not public._user_is_business_admin(old.user_id, old.business_id)
    returning a.source_business_id, a.target_business_id
  loop
    -- Actor = whoever removed / demoted them (null from the SQL Editor).
    perform public._log_price_autosync(l.source_business_id, l.target_business_id,
      'price_sheet.autosync_auto_off', auth.uid(), public._user_display_name(old.user_id));
  end loop;
  return null;
end;
$$;

revoke execute on function public.business_members_price_autosync_cleanup() from public, anon, authenticated;

-- 259's single "on" row (source side only, older details shape) → rewrite to
-- the both-sides shape so existing links read the same as new ones.
insert into audit_log (business_id, user_id, action, entity_type, details, created_at)
select a.target_business_id, l.user_id, 'price_sheet.autosync_on', 'price_sheet',
       jsonb_build_object('direction', 'in',
                          'other_business_id', a.source_business_id,
                          'other_business_name', (select name from businesses where id = a.source_business_id)),
       l.created_at
  from audit_log l
  join price_sheet_autosync a
    on a.source_business_id = l.business_id
   and a.target_business_id::text = l.details ->> 'target_business_id'
 where l.action = 'price_sheet.autosync_on'
   and not (l.details ? 'direction')
   and not exists (select 1 from audit_log x
                    where x.business_id = a.target_business_id
                      and x.action = 'price_sheet.autosync_on'
                      and x.details ->> 'other_business_id' = a.source_business_id::text);

update audit_log
   set details = jsonb_build_object('direction', 'out',
                                    'other_business_id', details ->> 'target_business_id',
                                    'other_business_name', details ->> 'target_business_name')
 where action = 'price_sheet.autosync_on'
   and not (details ? 'direction');
