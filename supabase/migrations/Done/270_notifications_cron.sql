-- 270_notifications_cron.sql
-- Runs the notification pipeline from inside Supabase — no external scheduler.
--
--   * New notification rows → the database calls the API dispatcher right away
--     (pg_net, after commit) → push in ~1–2 s.
--   * Every 15 min (pg_cron): notifications_hourly() — overdue flip, job
--     tomorrow, missed clock-out, equipment expiring. (Name kept from 269; it's
--     safe to run as often as you like — every alert is deduped.)
--   * Every 10 min (pg_cron): a backup dispatch call, so a push whose instant
--     call was lost (API restarting during a deploy) still goes out.
--
-- ONE-TIME SETUP (run separately in the SQL editor, NOT committed — it holds the
-- secret). Same CRON_SECRET the API already uses:
--   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
--   select vault.create_secret('https://amixos-api-314622478971.us-central1.run.app', 'notif_api_url');
-- Until both exist, the dispatch call is a silent no-op (the bell still works).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Ask the API to send pending pushes. Never raises: a notification problem must
-- not fail the insert that triggered it.
create or replace function public.notif_kick_dispatch()
returns void language plpgsql security definer set search_path = public as $$
declare api_url text; secret text;
begin
  select decrypted_secret into api_url from vault.decrypted_secrets where name = 'notif_api_url';
  select decrypted_secret into secret  from vault.decrypted_secrets where name = 'cron_secret';
  if api_url is null or secret is null then return; end if;
  perform net.http_post(
    url := rtrim(api_url, '/') || '/api/v1/notifications/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'notif_kick_dispatch: %', sqlerrm;
end;
$$;

create or replace function public.notif_dispatch_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notif_kick_dispatch();
  return null;
end;
$$;

-- Per STATEMENT, not per row: one notify_users() call inserting 5 rows makes
-- one HTTP call. pg_net sends after the transaction commits, so the API sees
-- the rows.
drop trigger if exists notif_dispatch on public.notifications;
create trigger notif_dispatch
  after insert on public.notifications
  for each statement execute function public.notif_dispatch_trg();

revoke execute on function public.notif_kick_dispatch() from public, anon, authenticated;
revoke execute on function public.notif_dispatch_trg() from public, anon, authenticated;

-- Schedules (cron.schedule with a name replaces an existing job of that name).
select cron.schedule('amixos-notification-checks', '*/15 * * * *', $$select public.notifications_hourly()$$);
select cron.schedule('amixos-notification-push-retry', '*/10 * * * *', $$select public.notif_kick_dispatch()$$);

-- Verify after running:
--   select jobname, schedule, active from cron.job where jobname like 'amixos-notification%';
--   select * from cron.job_run_details order by start_time desc limit 5;   -- after 15 min
--   select id, status_code, error_msg from net._http_response order by created desc limit 5;
