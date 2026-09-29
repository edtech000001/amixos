-- 214 — Cover images for folders
--
-- Files got covers in 212 (rendered from page 1) and 213 (hand-picked). Folders
-- have nothing to render from, so theirs is always a picture the user chooses.
-- Both folder tables get the column: file_categories are the top-level folders
-- and file_folders the nested ones, and a cover has to work at every level or
-- the grid looks half-finished.

alter table public.file_categories
  add column if not exists cover_path text;

alter table public.file_folders
  add column if not exists cover_path text;

comment on column public.file_categories.cover_path is
  'Storage path of a hand-picked cover image, in the same private bucket as the '
  'folder contents. Null renders the folder icon.';

comment on column public.file_folders.cover_path is
  'Storage path of a hand-picked cover image, in the same private bucket as the '
  'folder contents. Null renders the folder icon.';

-- NOTE: no RLS changes. Covers live under the same business-scoped path prefix
-- as everything else in the module, so the existing storage policies already
-- cover them — someone who cannot read the folder cannot read its picture.
