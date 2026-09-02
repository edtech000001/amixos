-- 213 — Hand-picked cover images for file entries
--
-- Migration 212 renders page 1 of a stored PDF. That covers uploads, but not
-- LINK entries: a link has a url and no storage_path, so there are no bytes to
-- rasterize and its preview is correctly marked `unsupported`. Rendering the
-- page a link points at would mean the server fetching arbitrary user-supplied
-- URLs — a classic SSRF surface — so instead the user picks the cover.
--
-- The image reuses `thumbnail_path`, so the grid needs no second code path:
-- generated and hand-picked covers are read identically.

alter table public.file_entries
  add column if not exists thumbnail_manual boolean not null default false;

comment on column public.file_entries.thumbnail_manual is
  'True when the cover was uploaded by a person rather than rendered from the '
  'file. Protects the choice: any future "regenerate previews" action must skip '
  'these, or it would silently destroy hand-picked covers.';

-- The backfill already skips rows with a thumbnail_path, so a manual cover is
-- safe from it without further work. This column exists for the regenerate
-- case, which by definition ignores the existing path.
