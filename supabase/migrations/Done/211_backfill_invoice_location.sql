-- 211 — Backfill invoices.location_id
--
-- WHY: the invoices list filters with `.eq('location_id', <branch>)`, and `.eq`
-- never matches NULL. So every branch-less invoice disappears the moment any
-- branch is selected and only reappears on "all branches" — the rows look lost.
--
-- HOW THEY GOT THAT WAY:
--   * the mobile job screen inserted invoices without location_id at all
--     (fixed in code alongside this migration), and
--   * CSV imports only set it when the file carried a branch column, which
--     historical imports generally did not.
--
-- Five passes, most-trustworthy evidence first: the invoice's own jobs, the
-- client's branch links, single-branch businesses, then the client's own
-- invoice and job history. Each only ever touches rows that are still NULL, so
-- the passes can't fight each other and the whole file is safe to re-run.
--
-- Read the NOTICE output: it reports what each pass claimed and what is left.

-- ── Pass 1 — from the invoice's own jobs ─────────────────────────────────────
-- The strongest evidence: the work itself is already filed to a branch.
--
-- An invoice can cover jobs from more than one branch, so this needs a rule.
-- Majority by job count wins. Ties break to the branch of the NEWEST job,
-- which is the same rule the app already applies when it bills several jobs at
-- once (createInvoicesFromJobs sorts newest-first and takes the first job's
-- branch). A final sort on the uuid keeps a two-way tie deterministic rather
-- than letting the planner decide.
do $$
declare n int;
begin
  with job_votes as (
    select
      j.invoice_id,
      j.location_id,
      count(*)                                              as jobs,
      max(coalesce(j.scheduled_date, '0001-01-01'::date))   as newest
    from public.jobs j
    where j.invoice_id is not null
      and j.location_id is not null
    group by j.invoice_id, j.location_id
  ),
  ranked as (
    select
      invoice_id,
      location_id,
      row_number() over (
        partition by invoice_id
        order by jobs desc, newest desc, location_id
      ) as rk
    from job_votes
  )
  update public.invoices i
     set location_id = r.location_id
    from ranked r
   where r.invoice_id = i.id
     and r.rk = 1
     and i.location_id is null;
  get diagnostics n = row_count;
  raise notice 'pass 1 (from attached jobs): % invoices', n;
end $$;

-- ── Pass 2 — from the client's branch ───────────────────────────────────────
-- For invoices with no jobs to learn from (imported history, manual invoices).
-- Clients are shared across branches by design, so this only fires when the
-- client is linked to exactly ONE non-archived branch — then there is no
-- competing answer. A client spanning branches is left alone deliberately:
-- guessing there would file real money under the wrong branch.
do $$
declare n int;
begin
  with single_branch_clients as (
    -- No min(uuid) in Postgres; having count(*) = 1 guarantees one row, so
    -- take it out of the array directly.
    select cl.client_id, (array_agg(cl.location_id))[1] as location_id
    from public.client_locations cl
    join public.locations l on l.id = cl.location_id
    where not l.archived
    group by cl.client_id
    having count(*) = 1
  )
  update public.invoices i
     set location_id = s.location_id
    from single_branch_clients s
   where s.client_id = i.client_id
     and i.location_id is null;
  get diagnostics n = row_count;
  raise notice 'pass 2 (from single-branch client): % invoices', n;
end $$;

-- ── Pass 3 — single-branch businesses ───────────────────────────────────────
-- A business with exactly one active branch has no ambiguity to resolve: every
-- invoice belongs to it, and leaving NULL only hides rows behind the filter.
-- Businesses with two or more branches are skipped — there is nothing to infer
-- from, and a wrong branch is worse than an unfiled one.
do $$
declare n int;
begin
  with solo as (
    -- Same as above: exactly one row per group, so index the array.
    select business_id, (array_agg(id))[1] as location_id
    from public.locations
    where not archived
    group by business_id
    having count(*) = 1
  )
  update public.invoices i
     set location_id = s.location_id
    from solo s
   where s.business_id = i.business_id
     and i.location_id is null;
  get diagnostics n = row_count;
  raise notice 'pass 3 (single-branch business): % invoices', n;
end $$;

-- ── Pass 4 — from the client's own history ──────────────────────────────────
-- For invoices whose client was never linked to a branch at all (no
-- client_locations rows), so pass 2 had nothing to read. The client's actual
-- history still answers the question: if every OTHER invoice of theirs that is
-- already filed sits in one branch, this one belongs there too.
--
-- Requires count(distinct) = 1, so a client who has worked with more than one
-- branch is skipped rather than guessed. array_agg indexing again because
-- Postgres has no min(uuid).
do $$
declare n int;
begin
  with client_branch as (
    select
      i2.client_id,
      (array_agg(distinct i2.location_id))[1] as location_id
    from public.invoices i2
    where i2.location_id is not null
      and i2.client_id is not null
    group by i2.client_id
    having count(distinct i2.location_id) = 1
  )
  update public.invoices i
     set location_id = cb.location_id
    from client_branch cb
   where cb.client_id = i.client_id
     and i.location_id is null;
  get diagnostics n = row_count;
  raise notice 'pass 4a (client history, other invoices agree): % invoices', n;
end $$;

-- Same idea from the other direction: the client's JOBS. A job carries the
-- branch that actually did the work, so where the client has jobs and they all
-- name one branch, that is the branch. Runs after 4a and only on what is still
-- NULL, so where both sources exist the invoice evidence wins.
do $$
declare n int;
begin
  with client_branch as (
    select
      j.client_id,
      (array_agg(distinct j.location_id))[1] as location_id
    from public.jobs j
    where j.location_id is not null
      and j.client_id is not null
    group by j.client_id
    having count(distinct j.location_id) = 1
  )
  update public.invoices i
     set location_id = cb.location_id
    from client_branch cb
   where cb.client_id = i.client_id
     and i.location_id is null;
  get diagnostics n = row_count;
  raise notice 'pass 4b (client history, jobs agree): % invoices', n;
end $$;

-- ── What's left ─────────────────────────────────────────────────────────────
-- Remaining NULLs are genuinely ambiguous: a multi-branch business, no jobs
-- attached, and a client that works with more than one branch. They stay
-- unfiled rather than guessed. Note they are still invisible under a branch
-- filter — if the count here is meaningful, the better answer is a UI change
-- (surface "N sin sucursal") rather than inventing a branch for them.
do $$
declare
  left_null int;
  total     int;
begin
  select count(*) filter (where location_id is null), count(*)
    into left_null, total
    from public.invoices;
  raise notice 'remaining unfiled: % of % invoices', left_null, total;
end $$;

-- Per-business breakdown of what remains, so the leftovers are reviewable:
--
--   select b.name,
--          count(*) filter (where i.location_id is null) as unfiled,
--          count(*)                                      as invoices
--   from public.invoices i
--   join public.businesses b on b.id = i.business_id
--   group by b.name
--   having count(*) filter (where i.location_id is null) > 0
--   order by unfiled desc;
