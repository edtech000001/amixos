-- 180_pay_rate_not_null.sql
-- employees.pay_rate had DEFAULT 0 but allowed NULL, so an explicit-null write
-- (imports / API) could leave rows that crashed the Team list's
-- `payRate.toFixed(2)` render — the row only mounted when search/scroll
-- brought it into view, so it looked like "searching crashes the app".
-- Clients are now defensive too; this makes the column honest.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

update public.employees set pay_rate = 0 where pay_rate is null;
alter table public.employees alter column pay_rate set default 0;
alter table public.employees alter column pay_rate set not null;
