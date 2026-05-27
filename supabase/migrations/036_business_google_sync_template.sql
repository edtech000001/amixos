-- Migration 036: Per-business Google Contacts notes-template
-- Run in Supabase SQL Editor
--
-- iPhone Contacts (and most other consumer contact apps) display Google's
-- structured "userDefined" fields nowhere — only the Notes / biography
-- field is universally visible. To work around that, this column lets
-- each business define a template that gets rendered into the Google
-- contact's biography when syncing.
--
-- Template syntax (applied per-line):
--   - `{{Field Label}}` placeholders use the custom field's display label
--     (same name shown in Ajustes → Clientes → Campos personalizados).
--   - If a line contains placeholders AND every placeholder resolves to
--     empty for that contact, the whole line is omitted. Lines without
--     any placeholders are always rendered.
--   - The client's own `notes` field is appended after the template,
--     separated by a blank line, so existing notes are never lost.
--
-- Example:
--   "Pivot Brand: {{Marca de Pivot}}
--    Grain Bin Brand: {{Marca de Granero}}"
--
-- Default is NULL → no template, biography uses the bare `notes` field
-- exactly like before (backwards-compatible).

alter table public.businesses
  add column if not exists google_sync_notes_template text;

comment on column public.businesses.google_sync_notes_template is
  'Optional template rendered into the Google Contacts biography on sync. NULL = no template, bare notes only.';
