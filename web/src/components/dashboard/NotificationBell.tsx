'use client';

// Bell + unread badge at the top of the sidebar; opens a dropdown with the
// latest alerts. The full inbox (filters, preferences) is /dashboard/notificaciones.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import {
  fetchNotifications, groupNotificationsByDay, markAllNotificationsRead, markNotificationRead, notificationAge, notificationHref,
  unreadBadgeLabel, unreadNotificationsChanged, useUnreadNotifications,
  type NotificationRow,
} from '@amixos/shared/lib/notifications';

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
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const btnRef = useRef<HTMLButtonElement>(null);
  // The menu is portalled to <body> (like BusinessSwitcher): rendered inside
  // the sticky sidebar it painted UNDER the page content. Anchor to the button.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: r.left });
    setOpen(true);
  };

  // Fresh list every time it opens (cheap: one request, newest first).
  useEffect(() => {
    if (!open || !business) return;
    let cancelled = false;
    fetchNotifications(supabase, business.id)
      .then(r => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [open, business, supabase]);

  // Outside clicks land on the backdrop; Escape and resizing close it too.
  // While open the page behind can't scroll (wheel over the backdrop, or the
  // list hitting its end, would otherwise scroll the dashboard).
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => setOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      html.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
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
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
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

      {open && pos ? createPortal(
        <>
        {/* Same dim + blur layer as the business switcher; click closes. */}
        <div aria-hidden onMouseDown={() => setOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" style={{ zIndex: 9998 }} />
        <div
          style={{ position: 'fixed', top: pos.top, left: Math.max(16, Math.min(pos.left, window.innerWidth - 376)), zIndex: 9999 }}
          className="w-[360px] max-w-[calc(100vw-2rem)] bg-elevated border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <p className="text-sm font-bold text-ink">{t.title}</p>
            <div className="flex items-center gap-1">
              {rows?.some(r => !r.read_at) ? (
                <button type="button" onClick={readAll} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/5">
                  <CheckCheck size={14} /> {t.markAllRead}
                </button>
              ) : null}
              {/* Straight to the on/off switches (the page's preferences panel). */}
              <Link href="/dashboard/notificaciones" onClick={() => { setOpen(false); onNavigate?.(); }}
                title={t.prefsTitle} aria-label={t.prefsTitle}
                className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface">
                <Settings size={16} />
              </Link>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-3 border-b border-border-soft">
            {(['all', 'unread'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={clsx('px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                  filter === f ? 'bg-primary text-white border-primary' : 'bg-card text-muted border-border hover:text-ink')}>
                {f === 'all' ? t.filterAll : t.filterUnread}
              </button>
            ))}
          </div>
          <div className="max-h-[min(520px,calc(100vh-160px))] overflow-y-auto overscroll-contain pb-1">
            {rows === null ? (
              <p className="px-4 py-6 text-sm text-faint text-center">…</p>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto text-faint" />
                <p className="text-sm font-semibold text-ink mt-2">{t.empty}</p>
              </div>
            ) : filter === 'unread' && !rows.some(r => !r.read_at) ? (
              <p className="px-4 py-8 text-sm text-muted text-center">{t.emptyUnread}</p>
            ) : groupNotificationsByDay(filter === 'unread' ? rows.filter(r => !r.read_at) : rows).map(g => (
              <section key={g.key}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">{t.groups[g.key]}</p>
              {g.rows.map(n => (
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
              </section>
            ))}
          </div>
        </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}
