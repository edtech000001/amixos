-- 243 — Lapsed businesses: keep 12 months, warn, then delete
--
-- Before this, a business that stopped paying was locked (BillingGate) and
-- then kept FOREVER — nothing ever removed it. Policy now:
--
--   lapse ──── 12 months kept (locked, data intact, renew any time) ────┐
--                                      30 days before: scheduled for     │
--                                      deletion + email; again at 7 and 1│
--                                                                  deleted
--
-- When the clock starts ("lapse date"), by status:
--   active / past_due        not lapsed (past_due = Stripe still retrying)
--   trialing                 trial_ends_at, once it's in the past
--   none                     created_at — a business that was never activated
--   canceled / unpaid / …    businesses.lapsed_at (set by the Stripe webhook
--                            when access ends)
--
-- No clock starts before 2026-09-30, the day this policy began: a business
-- that lapsed (or sat un-activated) long before gets its full 12 months from
-- then, not an immediate deletion notice.
--
-- Deletion reuses the existing machinery (migration 230): a row in
-- business_deletions with lapsed = true, purged by the same daily
-- /account/purge-due job (storage first, then the cascade). purge_after is
-- never less than 30 days out, so every owner gets the full warning sequence.
-- Paying again cancels it (the webhook deletes the lapsed row; the sweep
-- double-checks).
--
-- The sweep only SCHEDULES and reports which warning emails are due; the API
-- sends them (it has the email provider) and records each one in
-- notices_sent, so a failed send is retried the next day.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists lapsed_at timestamptz;

comment on column public.businesses.lapsed_at is
  'When paid access ended (Stripe status canceled/unpaid/…). Set/cleared by the billing webhook. Starts the 12-month retention clock (migration 243).';

alter table public.business_deletions
  add column if not exists lapsed boolean not null default false,
  add column if not exists notices_sent int[] not null default '{}';

comment on column public.business_deletions.lapsed is
  'true = scheduled by the lapsed-business sweep (unpaid 11+ months), not by the owner. Paying again removes the row.';
comment on column public.business_deletions.notices_sent is
  'Warning emails already sent, as days-before-deletion (30, 7, 1).';

-- When a business's retention clock started, or null if it has access.
create or replace function public.business_lapse_date(b public.businesses)
returns timestamptz
language sql stable
set search_path = public
as $$
  -- greatest(…, policy start): no clock starts before this policy existed.
  -- A null status is treated as NOT lapsed (099 backfilled old rows to
  -- 'active'; anything else null is unexplained — never delete on a guess).
  select case
    when b.subscription_status is null or b.subscription_status in ('active', 'past_due') then null
    when b.subscription_status = 'trialing' then
      case when b.trial_ends_at is not null and b.trial_ends_at < now()
           then greatest(b.trial_ends_at, timestamptz '2026-09-30 00:00:00-05') end
    when b.subscription_status = 'none' then greatest(b.created_at, timestamptz '2026-09-30 00:00:00-05')
    else greatest(coalesce(b.lapsed_at, timestamptz '2026-09-30 00:00:00-05'), timestamptz '2026-09-30 00:00:00-05')
  end;
$$;

-- Daily: un-schedule businesses that paid again, schedule the ones reaching
-- 11 months lapsed, and return the warning emails that are due.
create or replace function public.sweep_lapsed_businesses(
  p_retention interval default interval '365 days',
  p_notice interval default interval '30 days'
)
returns table (
  business_id uuid,
  business_name text,
  owner_id uuid,
  purge_after timestamptz,
  notice_days int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 1. Paid again (or otherwise regained access) → cancel the lapsed deletion.
  delete from business_deletions d
  using businesses b
  where d.business_id = b.id
    and d.lapsed
    and public.business_lapse_date(b) is null;

  -- 2. Schedule: lapsed for (retention − notice) → delete at lapse + retention,
  --    but never sooner than the full notice period from today.
  insert into business_deletions (business_id, purge_after, reason, lapsed)
  select b.id,
         greatest(public.business_lapse_date(b) + p_retention, now() + p_notice),
         'lapsed',
         true
  from businesses b
  where public.business_lapse_date(b) is not null
    and public.business_lapse_date(b) <= now() - (p_retention - p_notice)
    and not exists (select 1 from business_deletions d where d.business_id = b.id);

  -- 3. Warnings due: the most urgent of 30/7/1 days not yet sent. Only one per
  --    run, so a late-scheduled business doesn't get three emails at once.
  return query
  with due as (
    select d.business_id, d.purge_after, d.notices_sent,
           greatest(0, ceil(extract(epoch from (d.purge_after - now())) / 86400))::int as days_left
    from business_deletions d
    where d.lapsed
  ),
  pick as (
    select due.*,
           (select min(t) from unnest(array[30, 7, 1]) t where t >= due.days_left) as threshold
    from due
  )
  select p.business_id, b.name, b.owner_id, p.purge_after, p.threshold
  from pick p
  join businesses b on b.id = p.business_id
  where p.threshold is not null
    and not (p.threshold = any (p.notices_sent));
end;
$$;

-- Record a sent warning (and every earlier threshold it supersedes).
create or replace function public.mark_lapse_notice_sent(p_business_id uuid, p_days int)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update business_deletions
  set notices_sent = array(
    select distinct x from unnest(notices_sent || array(select t from unnest(array[30, 7, 1]) t where t >= p_days)) x
    order by x desc
  )
  where business_id = p_business_id and lapsed;
$$;

-- Service role only (the API's daily job) — never callable from the app.
revoke execute on function public.business_lapse_date(public.businesses) from public, anon, authenticated;
revoke execute on function public.sweep_lapsed_businesses(interval, interval) from public, anon, authenticated;
revoke execute on function public.mark_lapse_notice_sent(uuid, int) from public, anon, authenticated;

-- Verify:
--   select name, subscription_status, lapsed_at, public.business_lapse_date(b)
--   from public.businesses b where public.business_lapse_date(b) is not null;
--   select * from public.business_deletions where lapsed;
