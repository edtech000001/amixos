-- 241_bug_reports.sql
-- Shake-to-report-a-bug.
--
-- The existing Support screen opens a mailto:, which loses everything that
-- makes a report actionable — which screen they were on, which build, which
-- business — and arrives as prose. This stores the report with that context
-- attached automatically, so "it broke" becomes something that can be found
-- again.
--
-- Reports are per USER, not per business. A member of four businesses hitting
-- a bug is one person reporting one thing; business_id records where they
-- were, not who owns the report.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.bug_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Where they were when it happened. ON DELETE SET NULL rather than CASCADE:
  -- deleting a business must not erase the evidence of what went wrong in it.
  business_id  uuid references public.businesses(id) on delete set null,

  message      text not null check (char_length(message) between 1 and 5000),

  -- Captured automatically. All nullable — a report with no context still
  -- beats no report, and refusing one because the platform string was missing
  -- would be absurd.
  route        text,     -- e.g. /dashboard/facturas/[id]
  platform     text,     -- ios | android | web
  app_version  text,     -- expo-application nativeApplicationVersion
  build_number text,
  os_version   text,
  device_model text,
  locale       text,

  created_at   timestamptz not null default now(),

  -- Triage. Nothing reads these yet; they exist so the first report does not
  -- force a migration before it can be acted on.
  status       text not null default 'new'
                 check (status in ('new', 'triaged', 'resolved', 'wontfix')),
  admin_note   text,
  resolved_at  timestamptz
);

create index if not exists bug_reports_user on public.bug_reports (user_id, created_at desc);
create index if not exists bug_reports_triage on public.bug_reports (status, created_at desc);

alter table public.bug_reports enable row level security;

-- Users write their own and read their own. No UPDATE or DELETE policy: a
-- reporter should not be able to rewrite what they reported, and triage
-- happens with the service role.
drop policy if exists "insert own bug reports" on public.bug_reports;
create policy "insert own bug reports"
  on public.bug_reports for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "read own bug reports" on public.bug_reports;
create policy "read own bug reports"
  on public.bug_reports for select
  using (user_id = (select auth.uid()));

-- Default-deny, matching 236.
revoke all on public.bug_reports from public, anon;
grant select, insert on public.bug_reports to authenticated;
grant all on public.bug_reports to service_role;

comment on table public.bug_reports is
  'Shake-to-report bug reports. Users insert and read their own; triage is '
  'service-role only, which is why there is no UPDATE or DELETE policy. '
  'business_id is WHERE it happened, not who owns the report.';

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select created_at, platform, app_version, route, left(message, 80)
--   from public.bug_reports
--   where status = 'new'
--   order by created_at desc;
