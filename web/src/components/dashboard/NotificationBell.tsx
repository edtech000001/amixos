'use client';

// Bell + unread badge at the top of the sidebar; opens a dropdown with the
// latest alerts. The full inbox (filters, preferences) is /dashboard/notificaciones.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import {
  fetchNotifications, markAllNotificationsRead, markNotificationRead, notificationAge, notificationHref,
  unreadBadgeLabel, unreadNotificationsChanged, useUnreadNotifications,
  type NotificationRow,
} from '@amixos/shared/lib/notifications';

const PREVIEW = 8;

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const supabase = useMemo(() => createSupabaseClient(), []);
  const router = useRouter();
  const { business, user } = useApp();
  const { t: full } = useLang();
  const t = full.notifications;
  const { data: unread } = useUnreadNotifications(supabase, business?.id ?? null, user?.id ?? null);
  const label = unreadBadgeLabel(unread);

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Fresh list every time it opens (cheap: one request, newest first).
  useEffect(() => {
    if (!open || !business) return;
    let cancelled = false;
    fetchNotifications(supabase, business.id)
      .then(r => { if (!cancelled) setRows(r.slice(0, PREVIEW)); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [open, business, supabase]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (n: NotificationRow) => {
    if (!n.read_at) void markNotificationRead(supabase, n.id).then(unreadNotificationsChanged);
    setOpen(false);
    onNavigate?.();
    const href = notificationHref(n, 'web');
    if (href) router.push(href);
  };

  const readAll = async () => {
    if (!business) return;
    const now = new Date().toISOString();
    setRows(prev => prev?.map(r => (r.read_at ? r : { ...r, read_at: now })) ?? prev);
    try { await markAllNotificationsRead(supabase, business.id); } finally { unreadNotificationsChanged(); }
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={label ? `${t.title} (${label})` : t.title}
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl border border-border bg-elevated flex items-center justify-center text-muted hover:text-ink hover:bg-surface transition-colors"
      >
        <Bell size={16} />
        {label ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {label}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute z-50 top-full left-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
            <p className="text-sm font-bold text-ink">{t.title}</p>
            {rows?.some(r => !r.read_at) ? (
              <button type="button" onClick={readAll} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <CheckCheck size={14} /> {t.markAllRead}
              </button>
            ) : null}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {rows === null ? (
              <p className="px-4 py-6 text-sm text-faint text-center">…</p>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto text-faint" />
                <p className="text-sm font-semibold text-ink mt-2">{t.empty}</p>
              </div>
            ) : rows.map(n => (
              <button key={n.id} type="button" onClick={() => go(n)}
                className={clsx('w-full text-left flex items-start gap-2.5 px-4 py-3 border-b border-border-soft last:border-b-0 hover:bg-surface transition-colors',
                  !n.read_at && 'bg-primary/5')}>
                <span className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0', n.read_at ? 'bg-transparent' : 'bg-primary')} />
                <span className="flex-1 min-w-0">
                  <span className={clsx('block text-sm text-ink', !n.read_at && 'font-semibold')}>{n.title}</span>
                  {n.body ? <span className="block text-xs text-muted mt-0.5 line-clamp-2">{n.body}</span> : null}
                </span>
                <span className="text-[11px] text-faint shrink-0 mt-0.5">{notificationAge(n.created_at, t)}</span>
              </button>
            ))}
          </div>
          <Link href="/dashboard/notificaciones" onClick={() => { setOpen(false); onNavigate?.(); }}
            className="block text-center px-4 py-2.5 text-sm font-semibold text-primary border-t border-border-soft hover:bg-surface">
            {t.viewAll}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
