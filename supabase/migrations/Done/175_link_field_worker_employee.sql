-- 175_link_field_worker_employee.sql
-- Pivot Builders: viewing as antoniojacome1991@gmail.com (a Field member), the
-- crew picker showed only the two "no branch" employees, even though his worker
-- record "Nahun Jacome" has Home = Nebraska + shared to Georgia.
--
-- Root cause: member_location_grants() (migration 160) resolves a viewer's
-- allowed branches by matching employees.user_id = auth.uid(). The "Nahun
-- Jacome" employee was linked to the WRONG login — edtechrepairs@gmail.com
-- (0fa2f884…) instead of antoniojacome1991@gmail.com (8c17e1d6…). So when
-- viewing as antoniojacome1991 the query found no employee → empty branch
-- grants → the location lock hid every branch-assigned worker.
--
-- Fix: re-point the Nahun Jacome employee to the antoniojacome1991 login so his
-- Nebraska + Georgia grants resolve. Targeted by exact employee id.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

update public.employees
set user_id = '8c17e1d6-5be5-4457-b917-c8104ac40983'  -- antoniojacome1991@gmail.com
where id = '9af9c277-6513-4301-9b7f-daefa4f75138'       -- Nahun Jacome
  and business_id = 'd0f73474-b503-41d5-a33f-8a95fff94c17';

-- Verify: user_id should now be 8c17e1d6-5be5-4457-b917-c8104ac40983.
-- select id, first_name, last_name, user_id from public.employees
-- where id = '9af9c277-6513-4301-9b7f-daefa4f75138';
