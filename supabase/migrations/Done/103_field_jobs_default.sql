-- 103: Field role can manage its (assigned) jobs by default.
--
-- The field role's built-in default now grants create/edit/delete on jobs
-- (view stays 'assigned'), matching shared/src/lib/permissions.ts. RLS resolves
-- defaults via public.default_role_permissions(role) when a business has no
-- business_roles override, so we redefine that function with the new field row.
--
-- Businesses that already customized the field role keep their override
-- (business_roles row); only those on the built-in default are affected.
--
-- Estimates stay a UI-level capability (createEstimates) and are not enforced
-- here — RLS only governs resource CRUD, and an estimate is a job covered by
-- the jobs.create grant above.

create or replace function public.default_role_permissions(role text)
returns jsonb language sql immutable as $$
  select case role
    when 'owner' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true}}}'::jsonb
    when 'admin' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true}}}'::jsonb
    when 'manager' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"all","create":true,"edit":true,"delete":false}}}'::jsonb
    when 'office' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'field' then
      '{"resources":{"clients":{"view":"assigned","create":false,"edit":false,"delete":false},"jobs":{"view":"assigned","create":true,"edit":true,"delete":true},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'viewer' then
      '{"resources":{"clients":{"view":"all","create":false,"edit":false,"delete":false},"jobs":{"view":"all","create":false,"edit":false,"delete":false},"invoices":{"view":"all","create":false,"edit":false,"delete":false},"employees":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    else
      '{"resources":{"clients":{"view":"none","create":false,"edit":false,"delete":false},"jobs":{"view":"none","create":false,"edit":false,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
  end;
$$;
