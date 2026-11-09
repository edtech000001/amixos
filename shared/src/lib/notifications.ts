// In-app notifications (migration 269). Rows are created server-side by
// triggers / crons with the text already rendered in the user's language;
// clients only read them, flip read_at, and edit their own preferences.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSwr } from './swrCache';

type SupabaseLike = any;

export type NotificationCategory = 'jobs' | 'invoices' | 'team' | 'inventory' | 'account';
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['jobs', 'invoices', 'team', 'inventory', 'account'];

export interface NotificationRow {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPrefs {
  push_enabled: boolean;
  muted_categories: NotificationCategory[];
}

// The server keeps at most 200 per person per company (migration 274), so one
// request loads the whole inbox — no paging UI.
export const NOTIFICATIONS_PAGE = 200;
const COLS = 'id, type, category, title, body, entity_type, entity_id, read_at, created_at';

/** One page, newest first. The inbox loads more with a button (paged, never "all"). */
export async function fetchNotifications(
  supabase: SupabaseLike, businessId: string, page = 0,
): Promise<NotificationRow[]> {
  const from = page * NOTIFICATIONS_PAGE;
  const { data, error } = await supabase
    .from('notifications')
    .select(COLS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + NOTIFICATIONS_PAGE - 1);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function fetchUnreadCount(supabase: SupabaseLike, businessId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(supabase: SupabaseLike, id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
}

/** Opening a job/invoice from anywhere counts as seeing its alerts: mark the
 *  caller's unread ones for it read (RLS limits this to their own rows).
 *  Resolves how many were cleared. */
export async function markEntityNotificationsRead(
  supabase: SupabaseLike,
  entityType: 'job' | 'invoice',
  entityId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .is('read_at', null)
    .select('id');
  if (error) return 0;
  return data?.length ?? 0;
}

/** Detail screens call this once per opened job/invoice; badges refresh only
 *  when something was actually cleared. */
export function useMarkEntityNotificationsRead(
  supabase: SupabaseLike,
  entityType: 'job' | 'invoice',
  entityId: string | null | undefined,
): void {
  useEffect(() => {
    if (!entityId) return;
    void markEntityNotificationsRead(supabase, entityType, entityId).then(n => {
      if (n > 0) unreadNotificationsChanged();
    });
    // supabase is a stable singleton per platform; keying on it would re-run every render on web.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);
}

/** "Look at it later" — puts the dot and the badge back. */
export async function markNotificationUnread(supabase: SupabaseLike, id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: null }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(supabase: SupabaseLike, businessId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .is('read_at', null);
  if (error) throw error;
}

// Every badge instance (web sidebar, mobile bell, inbox) recounts when any of
// them marks something read, and when the app comes back to the foreground.
const unreadListeners = new Set<() => void>();
export function unreadNotificationsChanged(): void {
  unreadListeners.forEach(fn => fn());
}

/** Badge count for the bell, cached per business+user. */
export function useUnreadNotifications(supabase: SupabaseLike, businessId: string | null, userId: string | null) {
  const key = businessId && userId ? `notif_unread_${businessId}_${userId}` : null;
  const swr = useSwr<number>(key, () => fetchUnreadCount(supabase, businessId!), {
    cacheKey: key,
    resetKey: key ?? '',
    focusThrottleMs: 30_000,
  });
  useUnreadSync(swr.refresh);
  return swr;
}

/** Recount when anything is marked read, and when the app returns to front. */
function useUnreadSync(refresh: (o?: { force?: boolean }) => unknown) {
  useEffect(() => {
    const force = () => { void refresh({ force: true }); };
    unreadListeners.add(force);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') void refresh(); });
    return () => { unreadListeners.delete(force); sub.remove(); };
  }, [refresh]);
}

/** Unread counts for EVERY business the user belongs to (migration 273) —
 *  badges in the business switcher. businessId → count; missing = 0. */
export function useUnreadByBusiness(supabase: SupabaseLike, userId: string | null) {
  const key = userId ? `notif_unread_by_biz_${userId}` : null;
  const swr = useSwr<Record<string, number>>(key, async () => {
    const { data, error } = await supabase.rpc('my_unread_notification_counts');
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as { business_id: string; unread: number }[]) out[r.business_id] = r.unread;
    return out;
  }, { cacheKey: key, resetKey: key ?? '', focusThrottleMs: 30_000 });
  useUnreadSync(swr.refresh);
  return swr;
}

/** "3", "99+", or '' for none. */
export function unreadBadgeLabel(n: number | null | undefined): string {
  return n ? (n > 99 ? '99+' : String(n)) : '';
}

export async function loadNotificationPrefs(
  supabase: SupabaseLike, businessId: string, userId: string,
): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from('notification_prefs')
    .select('push_enabled, muted_categories')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  return {
    push_enabled: data?.push_enabled ?? true,
    muted_categories: (data?.muted_categories ?? []) as NotificationCategory[],
  };
}

export async function saveNotificationPrefs(
  supabase: SupabaseLike, businessId: string, userId: string, prefs: NotificationPrefs,
): Promise<void> {
  const { error } = await supabase.from('notification_prefs').upsert({
    business_id: businessId,
    user_id: userId,
    push_enabled: prefs.push_enabled,
    // 'account' (billing) can't be muted — the server ignores it too.
    muted_categories: prefs.muted_categories.filter(c => c !== 'account'),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Where tapping a notification goes. Web and the Expo app use different
 *  paths for a few screens (inventory/equipment are modules on web). */
export function notificationHref(
  n: Pick<NotificationRow, 'entity_type' | 'entity_id'>,
  platform: 'web' | 'native',
): string | null {
  const web = platform === 'web';
  // Native: the detail screen lives in another tab's stack — ?from marks it a
  // visitor so back returns to the inbox and it doesn't pile up in that stack.
  const from = web ? '' : '?from=notifications';
  switch (n.entity_type) {
    case 'job': return n.entity_id ? `/dashboard/trabajos/${n.entity_id}${from}` : null;
    case 'invoice': return n.entity_id ? `/dashboard/facturas/${n.entity_id}${from}` : null;
    case 'inventory': return web ? '/dashboard/modulos/inventory' : '/dashboard/inventory';
    case 'equipment': return web ? '/dashboard/modulos/equipment' : '/dashboard/equipment';
    case 'timesheet':
    case 'member': return '/dashboard/empleados';
    case 'billing': return web ? '/dashboard/ajustes?tab=cuenta' : '/dashboard/mas/ajustes/cuenta';
    default: return null;
  }
}

export type NotificationDayGroup = 'today' | 'yesterday' | 'week' | 'earlier';

/** Split a newest-first list into Hoy / Ayer / Esta semana / Antes, by the
 *  device's local calendar day. Empty groups are dropped. */
export function groupNotificationsByDay(
  rows: NotificationRow[],
  now = new Date(),
): { key: NotificationDayGroup; rows: NotificationRow[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const day = 86_400_000;
  const order: NotificationDayGroup[] = ['today', 'yesterday', 'week', 'earlier'];
  const buckets: Record<NotificationDayGroup, NotificationRow[]> = { today: [], yesterday: [], week: [], earlier: [] };
  for (const r of rows) {
    const d = startOfDay(new Date(r.created_at));
    const key: NotificationDayGroup =
      d >= today ? 'today' : d >= today - day ? 'yesterday' : d >= today - 6 * day ? 'week' : 'earlier';
    buckets[key].push(r);
  }
  return order.filter(k => buckets[k].length).map(k => ({ key: k, rows: buckets[k] }));
}

/** "Hace 5 min" style stamp. */
export function notificationAge(
  iso: string,
  t: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string },
  now = Date.now(),
): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return t.justNow;
  if (mins < 60) return t.minutesAgo.replace('{{n}}', String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t.hoursAgo.replace('{{n}}', String(hrs));
  return t.daysAgo.replace('{{n}}', String(Math.floor(hrs / 24)));
}

/** Server-side "overdue" / "tomorrow" checks run in the business's local time
 *  (businesses.timezone, migration 269). Fill it from this device once when
 *  empty — RLS lets only owners/admins write, so other members no-op. */
const tzChecked = new Set<string>();
export function ensureBusinessTimezone(supabase: SupabaseLike, businessId: string | null | undefined): void {
  if (!businessId || tzChecked.has(businessId)) return;
  tzChecked.add(businessId);
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old engines */ }
  if (!tz) return;
  void supabase.from('businesses').update({ timezone: tz }).eq('id', businessId).is('timezone', null)
    .then(() => undefined, () => undefined);
}
