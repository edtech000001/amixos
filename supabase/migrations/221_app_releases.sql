-- 221 — App release registry, so the app can tell users a newer build exists
--
-- Two different kinds of "update" reach a user, and only one of them can be
-- detected from inside the running app:
--
--   OTA (expo-updates)  — the JS bundle. The app already knows: it downloads
--                         the update itself and only needs a restart. No table
--                         required.
--   Store build         — a new binary. The running app has no way to learn
--                         that one was published; something has to tell it.
--
-- This table is that something. One row per platform, edited by hand here in
-- the SQL editor when a build ships. Deliberately NOT the iTunes lookup API:
-- that covers iOS only, reports a version the moment Apple publishes it (which
-- can be hours before the rollout reaches everyone), and adds a third-party
-- dependency to app startup. A row we control means the prompt appears when WE
-- decide it should.
--
-- min_version exists for the case this app has not needed yet: a build that
-- cannot be skipped (a breaking API or schema change). The client currently
-- treats every update as optional; when a forced one is ever required, the
-- data is already here.

create table if not exists public.app_releases (
  platform      text primary key check (platform in ('ios', 'android')),
  -- Dotted numeric, e.g. '0.1.51'. Compared segment-by-segment as integers,
  -- NOT as text — '0.1.10' is newer than '0.1.9' but sorts before it.
  latest_version text not null,
  -- Below this, the client may refuse to continue. Null = nothing is forced.
  min_version    text,
  store_url      text not null,
  -- Shown in the prompt when set; falls back to generic copy when null.
  notes_es       text,
  notes_en       text,
  updated_at     timestamptz not null default now()
);

comment on table public.app_releases is
  'Latest shipped store build per platform. Read by the mobile update checker. '
  'Maintained by hand: update the row when a build goes live, not when it is '
  'submitted — the prompt sends people to the store, and a store page without '
  'the new build yet is worse than no prompt.';

alter table public.app_releases enable row level security;

-- Readable by everyone signed in: it is public release metadata, carries no
-- business data, and is not scoped by business_id. No write policy at all —
-- rows are managed from the SQL editor, so the service role is the only writer.
drop policy if exists "app_releases readable by authenticated" on public.app_releases;
create policy "app_releases readable by authenticated"
  on public.app_releases for select
  to authenticated
  using (true);

-- Seeded at 0.0.0 — a version no build can be behind — so nobody is prompted
-- until these rows are deliberately filled in.
--
-- Do NOT seed this from app.json's `version`. The client compares against the
-- NATIVE version (Info.plist CFBundleShortVersionString / build.gradle
-- versionName), and the two drift badly: app.json is bumped on every OTA while
-- the native files only change on a rebuild. At the time of writing app.json
-- said 0.1.50 and both native files said 0.1.0, so seeding from app.json
-- prompted every install to "update from the store" — to a placeholder URL.
--
-- The store URLs are placeholders until the app is published. The client
-- refuses to prompt while store_url is empty or still carries Apple's zeroed
-- id, so an unfinished row is inert rather than a dead button.
insert into public.app_releases (platform, latest_version, store_url)
values
  ('ios',     '0.0.0', 'https://apps.apple.com/app/id0000000000'),
  ('android', '0.0.0', 'https://play.google.com/store/apps/details?id=com.amixos.app')
on conflict (platform) do nothing;
