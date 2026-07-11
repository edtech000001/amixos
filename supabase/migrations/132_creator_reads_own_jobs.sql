-- 132_creator_reads_own_jobs.sql
-- "Job not found" right after a field tech saves: the job INSERTS fine (131),
-- but field SELECT visibility requires assigned + published_to_crew — a chain
-- that breaks when the worker's employee row isn't linked to their login yet
-- (user_id null → the self-assignment can't be attributed to them). Rule that
-- can't break: you can ALWAYS see and edit a job you created.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "creator reads own jobs" on public.jobs;
create policy "creator reads own jobs" on public.jobs for select
  using (
    created_by = auth.uid()
    and public.is_business_member(business_id)
  );

drop policy if exists "creator updates own jobs" on public.jobs;
create policy "creator updates own jobs" on public.jobs for update
  using (
    created_by = auth.uid()
    and public.is_business_member(business_id)
  );
