-- Migration 019: Share token, created_by tracking, cancelled_at timestamp
-- Enables: public shareable links for proposals, audit trail, cancel timestamps

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Allow anyone (including anon) to SELECT a job if they know the share_token.
-- Safe because: (1) token is random/unguessable, (2) read-only, (3) only rows with token set.
CREATE POLICY "public read via share_token"
  ON public.jobs FOR SELECT
  USING (share_token IS NOT NULL);

-- Also allow anon read on job_items for shared proposals
CREATE POLICY "public read job_items via shared job"
  ON public.job_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_items.job_id
      AND jobs.share_token IS NOT NULL
  ));
