-- 107_job_field_templates_member_read.sql
-- Let ALL business members READ job custom-field templates.
--
-- Migration 028 gated reads to owner/admin/manager/viewer, so FIELD crew (and
-- OFFICE) couldn't read the templates — which meant custom fields never
-- rendered for them, neither in the job form nor the job detail view, even
-- though they can create/see jobs. The templates are just field DEFINITIONS
-- (labels/types); the actual per-job VALUES stay gated by the jobs RLS, so it's
-- safe for any member to read the definitions.
--
-- Write / update / delete stay manager+/admin (unchanged from 028).
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

drop policy if exists "manager+ read job_field_templates" on public.job_field_templates;
drop policy if exists "members read job_field_templates" on public.job_field_templates;
create policy "members read job_field_templates" on public.job_field_templates for select
  using (public.is_business_member(business_id));
