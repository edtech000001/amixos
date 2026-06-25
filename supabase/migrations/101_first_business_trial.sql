-- 101_first_business_trial.sql
-- Trials are per-OWNER, granted once — only a user's FIRST business gets the
-- 14-day trial. Additional businesses (and any business created after the owner
-- has already used a trial) start at subscription_status='none' and must
-- subscribe. A persistent per-user flag remembers the trial was used even if the
-- business is later deleted (re-trial guard).
--
-- Server-enforced via a BEFORE INSERT trigger on businesses, so neither the web
-- nor mobile client can bypass it. Replaces the blanket trial default from 099.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- Per-user trial ledger. Written only by the SECURITY DEFINER trigger below;
-- gating reads businesses.subscription_status, so clients never touch this.
create table if not exists public.user_trial_state (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  has_used_trial boolean not null default false,
  first_trial_at timestamptz
);
alter table public.user_trial_state enable row level security;

-- Grandfather existing owners: mark trial used so a NEW business of theirs
-- doesn't hand out another free trial. (Their existing businesses were set to
-- 'active' in 099.)
insert into public.user_trial_state (user_id, has_used_trial, first_trial_at)
  select distinct owner_id, true, now()
  from public.businesses
  where owner_id is not null
  on conflict (user_id) do update set has_used_trial = true;

-- New businesses no longer auto-trial via column default — the trigger decides.
alter table public.businesses alter column subscription_status set default 'none';
alter table public.businesses alter column trial_ends_at drop default;

create or replace function public.grant_first_business_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used boolean;
begin
  if new.owner_id is null then
    new.subscription_status := coalesce(new.subscription_status, 'none');
    new.trial_ends_at := null;
    return new;
  end if;

  select has_used_trial into v_used
  from public.user_trial_state
  where user_id = new.owner_id;

  if coalesce(v_used, false) = false
     and coalesce(new.subscription_status, 'none') in ('none', 'trialing') then
    -- First ever business for this owner → grant the 14-day trial + mark used.
    new.subscription_status := 'trialing';
    new.trial_ends_at := now() + interval '14 days';
    insert into public.user_trial_state (user_id, has_used_trial, first_trial_at)
      values (new.owner_id, true, now())
      on conflict (user_id) do update
        set has_used_trial = true,
            first_trial_at = coalesce(public.user_trial_state.first_trial_at, now());
  else
    -- Re-trial guard / additional business → no free trial.
    new.subscription_status := coalesce(nullif(new.subscription_status, 'trialing'), 'none');
    new.trial_ends_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_grant_first_business_trial on public.businesses;
create trigger trg_grant_first_business_trial
  before insert on public.businesses
  for each row execute function public.grant_first_business_trial();
