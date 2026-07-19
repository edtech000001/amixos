'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, FileText, UsersRound, Calendar,
  Settings, ChevronLeft, Menu, X, ClipboardList, BarChart3,
  Store as StoreIcon,
} from 'lucide-react';
import { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';
import { LocationSwitcher } from '@/components/dashboard/LocationSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { can, type Role } from '@amixos/shared/lib/permissions';

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

export function Sidebar() {
  const pathname = usePathname();
  // Across the whole Settings section (/dashboard/ajustes — hub + Actividad)
  // the rail "drills in": hide the global desktop nav because those pages
  // render the shared SettingsNav rail instead. Tienda (Module Store) is a
  // primary destination with no settings rail, so it keeps the global nav.
  const isSettingsRoute =
    pathname.startsWith('/dashboard/ajustes') &&
    !pathname.startsWith('/dashboard/ajustes/tienda');
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.sidebar;
  const store = full.dashboard.settings.store;
  const modulesDict = full.dashboard.modules.list;
  const supabase = createSupabaseClient();
  const [open, setOpen] = useState(false);

  // Enabled + available modules show up as their own sidebar entries
  // after the core nav. Coming-soon modules are filtered out even if
  // pre-enabled in the DB — they have nothing real to navigate to.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const liveModules = enabledModules.filter(m => m.status === 'available');

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Business switcher (replaces the read-only logo + name block) */}
      <div className="px-6 py-5 border-b border-border-soft flex flex-col gap-3">
        <BusinessSwitcher />
        <LocationSwitcher />
      </div>

      {/* Nav items. Core list first, then any enabled+available modules.
          Coming-soon modules don't appear here even if pre-enabled in DB —
          gated by useEnabledModules + filter on status. */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.filter(item => item.show(currentRole)).map(({ href, key, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:bg-border-soft hover:text-ink'
              )}
            >
              <Icon size={18} />
              {t[key]}
            </Link>
          );
        })}
        {liveModules.map(m => {
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
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:bg-border-soft hover:text-ink',
              )}
            >
              {/* Inherit currentColor (gray when idle, white when active) so
                  module icons match the core nav instead of each showing their
                  own brand color. */}
              <Icon size={18} />
              {name}
            </Link>
          );
        })}
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
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              isActive('/dashboard/ajustes/tienda')
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:bg-border-soft hover:text-ink',
            )}
          >
            <StoreIcon size={18} />
            {store.heading}
          </Link>
        )}
        <Link
          href="/dashboard/ajustes"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:bg-border-soft hover:text-ink transition-all"
        >
          <Settings size={18} />
          {t.ajustes}
        </Link>
      </div>

      {/* Platform brand — the workspace shows the customer's name up top;
          this keeps Amixos as the subtle platform mark at the foot. Theme
          toggle sits here (light ↔ dark). */}
      <div className="px-6 py-3 border-t border-border-soft flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] text-faint">
            Powered by <span className="font-semibold text-muted">Amixos</span>
          </p>
          {APP_VERSION && (
            <p className="text-[10px] text-faint mt-0.5">{APP_VERSION}</p>
          )}
        </div>
        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on settings pages (drill-in: the settings
          tabs become the single left rail with their own Back link). */}
      {!isSettingsRoute && (
        <aside className="hidden md:flex w-60 shrink-0 border-r border-border-soft bg-card h-screen sticky top-0 flex-col">
          <NavContent />
        </aside>
      )}

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border-soft px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{business?.name ?? 'Amixos'}</p>
        <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-border-soft">
          <Menu size={20} className="text-muted" />
        </button>
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
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
