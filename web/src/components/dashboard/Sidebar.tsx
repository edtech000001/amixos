'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, FileText, UsersRound, Calendar,
  Settings, ChevronLeft, Menu, X, ClipboardList, BarChart3,
  Store as StoreIcon, PanelLeftClose, PanelLeftOpen, Bell,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useSidebarCollapsed } from './useSidebarCollapsed';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';
import { LocationSwitcher } from '@/components/dashboard/LocationSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { can, type Role } from '@amixos/shared/lib/permissions';
import { Tooltip } from '@amixos/shared/ui/Tooltip';
import { useUnreadNotifications } from '@amixos/shared/lib/notifications';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { Logo } from '@amixos/shared/ui/Logo';

// Build identifier for the footer: app version (from package.json, injected via
// next.config) + the short git commit SHA (auto-set by Vercel on deploy). Falls
// back to just the version locally where no SHA is present.
const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!v) return '';
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return sha ? `v${v} · ${sha.slice(0, 7)}` : `v${v}`;
})();

// Each nav item declares which roles may see it (mirrors the read-side RLS).
// `inicio` + `trabajos` are universal — a field worker lands on their own home
// and still reaches their assigned-jobs list. The rest follow their `can.*`
// capability so a member never sees a section the DB would return empty.
const NAV_ITEMS: {
  href: string;
  key: 'inicio' | 'trabajos' | 'clientes' | 'facturas' | 'empleados' | 'calendario' | 'reportes';
  icon: typeof LayoutDashboard;
  exact?: boolean;
  show: (role: Role | null) => boolean;
}[] = [
  { href: '/dashboard', key: 'inicio', icon: LayoutDashboard, exact: true, show: () => true },
  { href: '/dashboard/trabajos', key: 'trabajos', icon: ClipboardList, show: () => true },
  { href: '/dashboard/clientes', key: 'clientes', icon: Users, show: can.seeAllClients },
  { href: '/dashboard/facturas', key: 'facturas', icon: FileText, show: can.seeInvoices },
  { href: '/dashboard/empleados', key: 'empleados', icon: UsersRound, show: can.seeEmployees },
  { href: '/dashboard/calendario', key: 'calendario', icon: Calendar, show: can.seeAllJobs },
  { href: '/dashboard/reportes', key: 'reportes', icon: BarChart3, show: can.seeReports },
];

/**
 * The active item's blue pill, as ONE element that slides between items
 * (mobile dock parity). It measures the item marked data-active inside its
 * parent <nav> and moves there; the edge on the side it's heading to travels
 * fast and the trailing edge follows a beat later, so it stretches toward the
 * new item and settles — the "liquid" feel. Hidden when no item in this nav
 * is active (e.g. a bottom-section page).
 */
function SlidingHighlight({ activeKey, mini }: { activeKey: string; mini: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<{ top: number; height: number } | null>(null);

  // Positioned by top + HEIGHT (from the item alone). A `bottom` offset
  // depended on the nav's height — which shrinks after the switchers above it
  // load, and is measured differently once the nav scrolls — and collapsed
  // the pill to 0px on businesses with many modules.
  const place = (el: HTMLDivElement, top: number, height: number) => {
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    el.style.opacity = '1';
    last.current = { top, height };
  };

  // Not placed yet (nav items render after the role loads) → place it after
  // any render, without animating.
  useLayoutEffect(() => {
    if (last.current) return;
    const el = ref.current;
    const item = el?.parentElement?.querySelector<HTMLElement>('[data-active="true"]');
    if (el && item) place(el, item.offsetTop, item.offsetHeight);
  });

  useLayoutEffect(() => {
    const el = ref.current;
    const nav = el?.parentElement;
    if (!el || !nav) return;
    const moveTo = (item: HTMLElement | null, animate: boolean) => {
      if (!item) { el.style.opacity = '0'; last.current = null; return; }
      const top = item.offsetTop;
      const height = item.offsetHeight;
      const prev = last.current;
      if (prev && prev.top === top && prev.height === height) return; // already there
      if (prev && animate && typeof el.animate === 'function') {
        // Liquid: the LEADING edge reaches the new item first (the pill
        // stretches across the gap), then the trailing edge catches up with
        // a slight overshoot and the pill settles to the item's size.
        const down = top > prev.top;
        const mid = down
          ? { top: prev.top + (top - prev.top) * 0.2, bottom: top + height }
          : { top, bottom: prev.top + prev.height - (prev.top - top) * 0.2 };
        el.animate(
          [
            { top: `${prev.top}px`, height: `${prev.height}px` },
            { top: `${mid.top}px`, height: `${mid.bottom - mid.top}px`, offset: 0.4 },
            { top: `${top}px`, height: `${height}px` },
          ],
          { duration: 460, easing: 'cubic-bezier(0.3, 1.15, 0.4, 1)' },
        );
      }
      place(el, top, height);
    };
    // The route has caught up: drop the click-time color overrides below.
    nav.querySelectorAll<HTMLElement>('a[data-active]').forEach(a => { a.style.color = ''; a.style.backgroundColor = ''; });
    moveTo(nav.querySelector<HTMLElement>('[data-active="true"]'), true);

    // Move on the CLICK, not when the route finishes loading (that lag made
    // the slide feel dead). The route change then lands on the same spot.
    const onClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab etc.
      const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-active]');
      if (!a || !nav.contains(a)) return;
      moveTo(a, true);
      // Swap the text colors with the pill (the classes follow once the route
      // updates): white on the new item, the idle gray on the old one.
      const idle = nav.querySelector<HTMLElement>('a[data-active="false"]');
      const idleColor = idle ? getComputedStyle(idle).color : '';
      nav.querySelectorAll<HTMLElement>('a[data-active="true"]').forEach(o => { if (o !== a) o.style.color = idleColor; });
      a.style.color = '#fff';
      // Until the route lands the clicked item is still "inactive", so its
      // hover:bg-border-soft paints OVER the pill — a near-white box in light
      // mode for a beat. Keep it see-through so the blue shows at once.
      a.style.backgroundColor = 'transparent';
    };
    nav.addEventListener('click', onClick);

    // Items can shift (modules load above, labels translate): re-align
    // without animating when the nav's layout really changes.
    let size = `${nav.clientWidth}x${nav.scrollHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${nav.clientWidth}x${nav.scrollHeight}`;
      if (next === size) return;
      size = next;
      moveTo(nav.querySelector<HTMLElement>('[data-active="true"]'), false);
    });
    ro.observe(nav);
    return () => { nav.removeEventListener('click', onClick); ro.disconnect(); };
  }, [activeKey, mini]);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-3 right-3 rounded-xl bg-primary shadow-sm"
      style={{ opacity: 0 }}
    />
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // Across the whole Settings section (/dashboard/ajustes — hub + Actividad)
  // the rail "drills in": hide the global desktop nav because those pages
  // render the shared SettingsNav rail instead. Tienda (Module Store) is a
  // primary destination with no settings rail, so it keeps the global nav.
  const isSettingsRoute =
    pathname.startsWith('/dashboard/ajustes') &&
    !pathname.startsWith('/dashboard/ajustes/tienda');
  const { business, currentRole, user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.sidebar;
  const store = full.dashboard.settings.store;
  const modulesDict = full.dashboard.modules.list;
  const supabase = createSupabaseClient();
  const [open, setOpen] = useState(false);
  const { data: unreadCount } = useUnreadNotifications(supabase, business?.id ?? null, user?.id ?? null);
  const unreadLabel = unreadCount ? (unreadCount > 99 ? '99+' : String(unreadCount)) : '';
  // Desktop icon-only mode — shared with SettingsNav (one preference).
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  // Enabled + available modules show up as their own sidebar entries
  // after the core nav. Coming-soon modules are filtered out even if
  // pre-enabled in the DB — they have nothing real to navigate to.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  // Equipment/rentals are role-gated (their own permissions); other modules
  // stay visible to any member where enabled.
  const liveModules = enabledModules.filter(
    m => m.status === 'available'
      && (m.id !== 'equipment' || can.viewEquipment(currentRole))
      && (m.id !== 'rentals' || can.viewRentals(currentRole)),
  );
  // Tool modules (map, inventory, equipment…) stay inline with the core nav;
  // INDUSTRY modules are full apps of their own and get a labeled "Apps"
  // section between the tools and the store.
  const toolModules = liveModules.filter(m => m.category !== 'industry');
  const industryApps = liveModules.filter(m => m.category === 'industry');

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  // Called as a plain function, NOT rendered as <NavContent/>: defined inside
  // Sidebar it's a new component type every render, so React unmounted and
  // rebuilt the whole sidebar (switchers included) on every navigation — and
  // the sliding highlight could never animate.
  const NavContent = ({ mini = false }: { mini?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Business switcher (replaces the read-only logo + name block). In
          icon-only mode the switchers hide — expand to switch. */}
      {!mini ? (
        // Logo + bell on a slim row of their own so the company switcher gets
        // the full width (long names wrap instead of "The Pivo…").
        <div className="px-4 pt-4 pb-5 border-b border-border-soft flex flex-col gap-3">
          <div className="flex items-center justify-between pl-1">
            <Logo variant="side" width={96} />
            <NotificationBell onNavigate={() => setOpen(false)} />
          </div>
          <BusinessSwitcher />
          <LocationSwitcher />
        </div>
      ) : (
        <div className="py-4 border-b border-border-soft flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-bold" title={business?.name ?? 'Amixos'}>
            {(business?.name ?? 'A').charAt(0).toUpperCase()}
          </div>
          <NotificationBell />
        </div>
      )}

      {/* Nav items. Core list first, then any enabled+available modules.
          Coming-soon modules don't appear here even if pre-enabled in DB —
          gated by useEnabledModules + filter on status. */}
      <nav className="relative flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <SlidingHighlight activeKey={pathname} mini={mini} />
        {NAV_ITEMS.filter(item => item.show(currentRole)).map(({ href, key, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              title={mini ? t[key] : undefined}
              data-active={active}
              className={clsx(
                'relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                mini ? 'justify-center px-0' : 'px-3',
                // The blue pill is SlidingHighlight; the item just sits on it.
                active
                  ? 'text-white'
                  : 'text-muted hover:bg-border-soft hover:text-ink'
              )}
            >
              <Icon size={18} />
              {!mini && t[key]}
            </Link>
          );
        })}
        {toolModules.map(m => {
          const href = `/dashboard/modulos/${m.id}`;
          const active = isActive(href);
          const Icon = m.icon;
          const entry = (modulesDict as unknown as Record<string, { name: string } | undefined>)[m.i18nKey];
          const name = entry?.name ?? m.id;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              title={mini ? name : undefined}
              data-active={active}
              className={clsx(
                'relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                mini ? 'justify-center px-0' : 'px-3',
                active
                  ? 'text-white'
                  : 'text-muted hover:bg-border-soft hover:text-ink',
              )}
            >
              {/* Inherit currentColor (gray when idle, white when active) so
                  module icons match the core nav instead of each showing their
                  own brand color. */}
              <Icon size={18} />
              {!mini && name}
            </Link>
          );
        })}
        {industryApps.length > 0 ? (
          <>
            {mini ? (
              <div className="mx-3 my-2 border-t border-border-soft" />
            ) : (
              <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {t.appsSection}
              </p>
            )}
            {industryApps.map(m => {
              const href = `/dashboard/modulos/${m.id}`;
              const active = isActive(href);
              const Icon = m.icon;
              const entry = (modulesDict as unknown as Record<string, { name: string } | undefined>)[m.i18nKey];
              const name = entry?.name ?? m.id;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  title={mini ? name : undefined}
                  data-active={active}
                  className={clsx(
                    'relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    mini ? 'justify-center px-0' : 'px-3',
                    active
                      ? 'text-white'
                      : 'text-muted hover:bg-border-soft hover:text-ink',
                  )}
                >
                  <Icon size={18} />
                  {!mini && name}
                </Link>
              );
            })}
          </>
        ) : null}
      </nav>

      {/* Bottom — Tienda + Ajustes + Logout grouped as admin-ish surfaces.
          Tienda (enabling modules) is a business-settings act → admins only.
          Ajustes stays visible to everyone since it also holds the personal
          account tab; the settings rail itself gates the config tabs. */}
      <div className="px-3 py-4 border-t border-border-soft flex flex-col gap-0.5">
        {can.manageBusinessSettings(currentRole) && (
          <Link
            href="/dashboard/ajustes/tienda"
            onClick={() => setOpen(false)}
            title={mini ? store.heading : undefined}
            className={clsx(
              'flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              mini ? 'justify-center px-0' : 'px-3',
              isActive('/dashboard/ajustes/tienda')
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:bg-border-soft hover:text-ink',
            )}
          >
            <StoreIcon size={18} />
            {!mini && store.heading}
          </Link>
        )}
        <Link
          href="/dashboard/ajustes"
          onClick={() => setOpen(false)}
          title={mini ? t.ajustes : undefined}
          className={clsx(
            'flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:bg-border-soft hover:text-ink transition-all',
            mini ? 'justify-center px-0' : 'px-3',
          )}
        >
          <Settings size={18} />
          {!mini && t.ajustes}
        </Link>
      </div>

      {/* Platform brand — the workspace shows the customer's name up top;
          this keeps Amixos as the subtle platform mark at the foot. Theme
          toggle sits here (light ↔ dark). */}
      {!mini ? (
        <div className="px-6 py-3 border-t border-border-soft flex items-center justify-between gap-3">
          {/* Brand lives in the logo at the top; the footer keeps just the version. */}
          <p className="text-[10px] text-faint">{APP_VERSION}</p>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Tooltip tip="collapseSidebar">
              <button
                onClick={toggleCollapsed}
                className="hidden md:inline-flex p-1.5 rounded-lg hover:bg-border-soft text-muted"
              >
                <PanelLeftClose size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className="py-3 border-t border-border-soft flex flex-col items-center gap-2">
          <ThemeToggle />
          <Tooltip tip="expandSidebar">
            <button
              onClick={toggleCollapsed}
              className="p-1.5 rounded-lg hover:bg-border-soft text-muted"
            >
              <PanelLeftOpen size={16} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on settings pages (drill-in: the settings
          tabs become the single left rail with their own Back link). */}
      {!isSettingsRoute && (
        <aside className={clsx(
          'hidden md:flex shrink-0 border-r border-border-soft bg-card h-screen sticky top-0 flex-col transition-[width] duration-200',
          collapsed ? 'w-[68px]' : 'w-60',
        )}>
          {NavContent({ mini: collapsed })}
        </aside>
      )}

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border-soft px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{business?.name ?? 'Amixos'}</p>
        <div className="flex items-center gap-1">
          <Link href="/dashboard/notificaciones" aria-label={full.notifications.title} className="relative p-1.5 rounded-lg hover:bg-border-soft">
            <Bell size={20} className="text-muted" />
            {unreadLabel ? (
              <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadLabel}
              </span>
            ) : null}
          </Link>
          <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-border-soft">
            <Menu size={20} className="text-muted" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-card h-full shadow-xl flex flex-col">
            <div className="absolute top-3 right-3">
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-border-soft">
                <X size={18} className="text-muted" />
              </button>
            </div>
            {NavContent({})}
          </aside>
        </div>
      )}
    </>
  );
}
