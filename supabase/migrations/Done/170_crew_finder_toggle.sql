-- Toggle for the "Suggest crew" (Crew Finder) button on the job form.
--
-- Companies that do distance/availability-based crewing want it; companies that
-- just assign their same team every time find it noise. Default true (current
-- behavior); they can turn it off in Settings > Jobs.
alter table public.businesses
  add column if not exists crew_finder_enabled boolean not null default true;

comment on column public.businesses.crew_finder_enabled is
  'Show the "Suggest crew" (Crew Finder) button on the job form. Off = a company that just assigns its own team.';
