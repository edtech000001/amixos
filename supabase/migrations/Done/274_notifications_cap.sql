-- 274_notifications_cap.sql
-- The inbox is "what needs attention now" — the Activity log is the long-term
-- history. Keep each person's alerts small enough that the app loads them all
-- in one request (no paging):
--   * 30 days (was 90 in notifications_hourly)
--   * at most 200 per person per company — the oldest go first.
-- Runs every 15 min with the other notification checks (pg_cron, 270).

create or replace function public.notifications_trim()
returns integer language plpgsql security definer set search_path = public as $$
declare n_old integer; n_cap integer;
begin
  delete from public.notifications where created_at < now() - interval '30 days';
  get diagnostics n_old = row_count;

  delete from public.notifications n
  using (
    select id from (
      select id, row_number() over (partition by user_id, business_id order by created_at desc, id desc) as rn
      from public.notifications
    ) ranked
    where rn > 200
  ) extra
  where n.id = extra.id;
  get diagnostics n_cap = row_count;

  return n_old + n_cap;
end;
$$;

revoke execute on function public.notifications_trim() from public, anon, authenticated;

select cron.schedule('amixos-notification-trim', '*/15 * * * *', $$select public.notifications_trim()$$);

-- Trim right away so existing inboxes are inside the cap.
select public.notifications_trim();
