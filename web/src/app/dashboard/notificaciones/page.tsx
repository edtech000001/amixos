'use client';

export const dynamic = 'force-dynamic';

import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { SkeletonRow } from '@amixos/shared/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import {
  visibleNotificationCategories, fetchNotifications, groupNotificationsByDay, loadNotificationPrefs,
  markAllNotificationsRead, markNotificationRead, markNotificationUnread, notificationAge, notificationHref,
  saveNotificationPrefs, unreadNotificationsChanged, useUnreadNotifications,
  type NotificationCategory, type NotificationPrefs, type NotificationRow,
} from '@amixos/shared/lib/notifications';

export default function NotificacionesPage() {
  const supabase = useMemo(() => createSupabaseClient(), []);
  const router = useRouter();
  const { business, user } = useApp();
  // Inventory / Equipment switches only while that module is on.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const categories = useMemo(() => visibleNotificationCategories(enabledModules.map(m => m.id)), [enabledModules]);
  const { t: full } = useLang();
  const t = full.notifications;
  const unread = useUnreadNotifications(supabase, business?.id ?? null, user?.id ?? null);

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState('');

  // The server caps the inbox at 200 per person per company (migration 274),
  // so one request is the whole list.
  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      setRows(await fetchNotifications(supabase, business.id));
    } finally {
      setLoading(false);
    }
  }, [business, supabase]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!business || !user) return;
    loadNotificationPrefs(supabase, business.id, user.id).then(setPrefs).catch(() => setPrefs(null));
  }, [business, user, supabase]);

  const open = async (n: NotificationRow) => {
    if (!n.read_at) {
      setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
      unread.mutate(c => Math.max(0, (c ?? 1) - 1));
      void markNotificationRead(supabase, n.id).then(unreadNotificationsChanged);
    }
    const href = notificationHref(n, 'web');
    if (href) router.push(href);
  };

  const toggleRead = async (n: NotificationRow) => {
    const nextRead = n.read_at ? null : new Date().toISOString();
    setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: nextRead } : r)));
    try {
      if (nextRead) await markNotificationRead(supabase, n.id);
      else await markNotificationUnread(supabase, n.id);
    } catch {
      setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: n.read_at } : r)));
    }
    unreadNotificationsChanged();
  };

  const readAll = async () => {
    if (!business) return;
    const now = new Date().toISOString();
    setRows(prev => prev.map(r => (r.read_at ? r : { ...r, read_at: now })));
    unread.mutate(() => 0);
    try { await markAllNotificationsRead(supabase, business.id); } finally { unreadNotificationsChanged(); }
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    if (!business || !user || !prefs) return;
    const prev = prefs;
    setPrefs(next);
    setPrefsError('');
    try { await saveNotificationPrefs(supabase, business.id, user.id, next); }
    catch { setPrefs(prev); setPrefsError(t.saveError); }
  };
  const toggleCategory = (c: NotificationCategory, on: boolean) => {
    if (!prefs) return;
    const muted = new Set(prefs.muted_categories);
    if (on) muted.delete(c); else muted.add(c);
    void updatePrefs({ ...prefs, muted_categories: Array.from(muted) });
  };

  const hasUnread = rows.some(r => !r.read_at);
  const shown = filter === 'unread' ? rows.filter(r => !r.read_at) : rows;
  const groups = groupNotificationsByDay(shown);

  return (
    <div className="p-6 flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 w-full bg-card rounded-2xl border border-border-soft shadow-sm">
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-border-soft">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell size={18} className="text-primary" />
            </div>
            <h1 className="text-xl font-bold text-ink">{t.title}</h1>
          </div>
          {hasUnread ? (
            <button onClick={readAll} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <CheckCheck size={16} /> {t.markAllRead}
            </button>
          ) : null}
        </div>

        {rows.length > 0 ? (
          <div className="flex gap-2 px-6 pt-4">
            {(['all', 'unread'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  filter === f ? 'bg-primary text-white border-primary' : 'bg-card text-muted border-border hover:text-ink')}>
                {f === 'all' ? t.filterAll : t.filterUnread}
              </button>
            ))}
          </div>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center px-6">
            <Bell size={36} className="mx-auto text-faint" />
            <p className="text-sm font-semibold text-ink mt-3">{t.empty}</p>
            <p className="text-sm text-muted mt-1">{t.emptyHint}</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted px-6">{t.emptyUnread}</p>
        ) : (
          <div className="pt-2">
          {groups.map(g => (
          <section key={g.key}>
          <h2 className="px-6 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{t.groups[g.key]}</h2>
          <ul>
            {g.rows.map(n => (
              <li key={n.id} className="relative group">
                <button
                  onClick={() => open(n)}
                  className={clsx(
                    'w-full text-left flex items-start gap-3 px-6 py-4 border-b border-border-soft last:border-b-0 hover:bg-surface transition-colors',
                    !n.read_at && 'bg-primary/5',
                  )}
                >
                  <span className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0', n.read_at ? 'bg-transparent' : 'bg-primary')} />
                  <span className="flex-1 min-w-0">
                    <span className={clsx('block text-sm text-ink', !n.read_at && 'font-semibold')}>{n.title}</span>
                    {n.body ? <span className="block text-sm text-muted mt-0.5">{n.body}</span> : null}
                  </span>
                  <span className="text-xs text-faint shrink-0 mt-0.5">{notificationAge(n.created_at, t)}</span>
                </button>
                {/* Sibling, not nested (no button inside a button); shows on hover/focus. */}
                <button
                  onClick={() => toggleRead(n)}
                  className="absolute right-6 bottom-3 text-xs font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  {n.read_at ? t.markUnread : t.markRead}
                </button>
              </li>
            ))}
          </ul>
          </section>
          ))}
          </div>
        )}
      </div>

      <div className="w-full lg:w-96 shrink-0 bg-card rounded-2xl border border-border-soft shadow-sm p-6">
        <h2 className="text-base font-bold text-ink">{t.prefsTitle}</h2>
        <p className="text-sm text-muted mt-0.5 mb-4">{t.prefsHint}</p>
        {prefs ? (
          <div className="flex flex-col divide-y divide-border-soft">
            <div className="flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{t.pushLabel}</span>
                <span className="block text-xs text-muted mt-0.5">{t.pushHint}</span>
              </span>
              <Toggle checked={prefs.push_enabled} onChange={v => updatePrefs({ ...prefs, push_enabled: v })} />
            </div>
            {categories.map(c => (
              <div key={c} className="flex items-start justify-between gap-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-ink">{t.categories[c]}</span>
                  <span className="block text-xs text-muted mt-0.5">
                    {c === 'account' ? t.accountAlwaysOn : t.categoryHints[c]}
                  </span>
                </span>
                <Toggle
                  checked={c === 'account' || !prefs.muted_categories.includes(c)}
                  disabled={c === 'account'}
                  onChange={v => toggleCategory(c, v)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}</div>
        )}
        {prefsError ? <p className="text-sm text-red-600 mt-3">{prefsError}</p> : null}
      </div>
    </div>
  );
}
