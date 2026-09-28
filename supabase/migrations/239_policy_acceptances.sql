-- 239_policy_acceptances.sql
-- Record WHICH version of the terms and privacy policy each user accepted,
-- and when.
--
-- The signup screens have always shown "Al registrarte aceptas nuestros
-- Términos y Política de privacidad" with working links, which is the ordinary
-- sign-in-wrap pattern. What was missing is the record: nothing could answer
-- "what did this customer agree to, and when?" — the only part that matters if
-- it is ever disputed.
--
-- APPEND-ONLY. Rows are never updated or deleted, not even when a user accepts
-- a newer version: the history IS the evidence. Accepting the 2026-09-22 terms
-- and then the 2027-01-15 terms leaves two rows, and that sequence is the
-- thing worth having.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.user_policy_acceptances (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- 'privacy' | 'terms'. Text rather than an enum so adding a document later
  -- (a DPA, a module-specific agreement) is an insert, not a migration.
  doc          text not null check (doc in ('privacy', 'terms')),
  -- Dated version string, matching shared/src/legal/versions.ts.
  version      text not null,
  accepted_at  timestamptz not null default now(),
  -- How the consent was given. 'signup' is the notice above the button;
  -- 'consent_screen' is the scroll-through gate. Distinguishing them matters:
  -- one is implied consent, the other is explicit and evidenced.
  method       text not null default 'signup'
                 check (method in ('signup', 'consent_screen', 'update_prompt')),
  -- True only when the user actually reached the end of the document. This is
  -- what "they saw it" rests on, so it is recorded rather than assumed.
  scrolled_to_end boolean not null default false,
  -- Which app recorded it, purely for diagnosing a gap later.
  platform     text
);

-- One row per user/doc/version. Re-accepting the same version (a reinstall, a
-- second device) must not pile up duplicates and confuse the history.
create unique index if not exists user_policy_acceptances_unique
  on public.user_policy_acceptances (user_id, doc, version);

-- The read path is always "everything this user has accepted".
create index if not exists user_policy_acceptances_user
  on public.user_policy_acceptances (user_id, doc);

alter table public.user_policy_acceptances enable row level security;

-- Users read and insert their OWN rows. No update and no delete policy exists,
-- which is what makes the table append-only for everyone but the service role:
-- a consent record a user can rewrite is not evidence of anything.
drop policy if exists "read own policy acceptances" on public.user_policy_acceptances;
create policy "read own policy acceptances"
  on public.user_policy_acceptances for select
  using (user_id = (select auth.uid()));

drop policy if exists "insert own policy acceptances" on public.user_policy_acceptances;
create policy "insert own policy acceptances"
  on public.user_policy_acceptances for insert
  with check (user_id = (select auth.uid()));

-- Default-deny, matching 236: authenticated may use the table through its
-- policies; anon has no business here at all.
revoke all on public.user_policy_acceptances from public, anon;
grant select, insert on public.user_policy_acceptances to authenticated;
grant all on public.user_policy_acceptances to service_role;

comment on table public.user_policy_acceptances is
  'Append-only record of which terms/privacy version each user accepted. '
  'No UPDATE or DELETE policy exists on purpose — the history is the evidence. '
  'Versions are the dated strings in shared/src/legal/versions.ts; bump those '
  'whenever the document text changes.';

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select doc, version, method, count(*)
--   from public.user_policy_acceptances
--   group by 1,2,3 order by 1,2;
--
-- Users who have NOT accepted the current versions (the consent gate's audience):
--   select u.email
--   from auth.users u
--   where not exists (
--     select 1 from public.user_policy_acceptances a
--     where a.user_id = u.id and a.doc = 'terms' and a.version = '2026-09-22'
--   );
