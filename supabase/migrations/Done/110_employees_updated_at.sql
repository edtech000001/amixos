-- 110_employees_updated_at.sql
-- Employees were the only core record without an updated_at column — clients,
-- jobs, and invoices all track it. Adds the column + the standard auto-update
-- trigger so "last edited" is recorded from now on, and the employees CSV
-- import can carry source-system edit timestamps.
--
-- Existing rows get updated_at = created_at (best available signal) rather
-- than now(), so a fresh migration run doesn't stamp everyone as "edited
-- today".
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.employees
  add column if not exists updated_at timestamptz;

update public.employees set updated_at = created_at where updated_at is null;

alter table public.employees
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists update_employees_updated_at on public.employees;
create trigger update_employees_updated_at
  before update on public.employees
  for each row execute procedure public.update_updated_at();
