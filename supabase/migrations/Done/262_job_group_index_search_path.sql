-- 262: Pin search_path on job_group_index (Security Advisor:
-- "Function Search Path Mutable"). Every other function already sets it
-- (migration 234); 253 recreated this one without it. A fixed search_path
-- stops a caller from shadowing the tables it references with same-named
-- objects in another schema.
--
-- Applied to every overload by name, so it doesn't depend on the exact
-- argument list. Safe to re-run.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'job_group_index'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end;
$$;
