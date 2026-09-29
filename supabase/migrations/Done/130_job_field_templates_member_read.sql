-- 130_job_field_templates_member_read.sql
-- Field workers see the SAME job detail screen as admins, but the custom-field
-- section was invisible to them: job_field_templates was readable by
-- manager+ only (028), so the field labels never loaded even though the
-- values sit right on the job row they CAN read. Open template READS to all
-- business members — writes stay manager+.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "manager+ read job_field_templates" on public.job_field_templates;
drop policy if exists "members read job_field_templates" on public.job_field_templates;

create policy "members read job_field_templates" on public.job_field_templates for select
  using (public.is_business_member(business_id));
