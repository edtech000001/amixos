'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, FileText, Clock, Calendar,
  Package, Settings, ChevronLeft, Menu, X, ClipboardList, BarChart3,
  Store as StoreIcon,
} from 'lucide-react';
import { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'inicio' as const, icon: LayoutDashboard, exact: true },
  { href: '/dashboard/trabajos', key: 'trabajos' as const, icon: ClipboardList },
  { href: '/dashboard/clientes', key: 'clientes' as const, icon: Users },
  { href: '/dashboard/facturas', key: 'facturas' as const, icon: FileText },
  { href: '/dashboard/empleados', key: 'empleados' as const, icon: Clock },
  { href: '/dashboard/calendario', key: 'calendario' as const, icon: Calendar },
  { href: '/dashboard/inventario', key: 'inventario' as const, icon: Package },
  { href: '/dashboard/reportes', key: 'reportes' as const, icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  // On settings pages the rail "drills in": hide the global desktop nav so
  // the settings tabs (which carry their own ← Back link) act as the single
  // left rail. Tienda (Module Store) lives under /ajustes but is a primary
  // destination, so it keeps the global nav.
  const isSettingsRoute =
    pathname.startsWith('/dashboard/ajustes') &&
    !pathname.startsWith('/dashboard/ajustes/tienda');
  const { business } = useApp();
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
      <div className="px-6 py-5 border-b border-gray-100">
        <BusinessSwitcher />
      </div>

      {/* Nav items. Core list first, then any enabled+available modules.
          Coming-soon modules don't appear here even if pre-enabled in DB —
          gated by useEnabledModules + filter on status. */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, key, icon: Icon, exact }) => {
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
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon size={18} color={active ? '#FFFFFF' : m.color} />
              {name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — Tienda + Ajustes + Logout grouped as admin-ish surfaces. */}
      <div className="px-3 py-4 border-t border-gray-100 flex flex-col gap-0.5">
        <Link
          href="/dashboard/ajustes/tienda"
          onClick={() => setOpen(false)}
          className={clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
            isActive('/dashboard/ajustes/tienda')
              ? 'bg-primary text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
          )}
        >
          <StoreIcon size={18} />
          {store.heading}
        </Link>
        <Link
          href="/dashboard/ajustes"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all"
        >
          <Settings size={18} />
          {t.ajustes}
        </Link>
      </div>

      {/* Platform brand — the workspace shows the customer's name up top;
          this keeps Amixos as the subtle platform mark at the foot. */}
      <div className="px-6 py-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-400">
          Powered by <span className="font-semibold text-gray-500">Amixos</span>
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on settings pages (drill-in: the settings
          tabs become the single left rail with their own Back link). */}
      {!isSettingsRoute && (
        <aside className="hidden md:flex w-60 shrink-0 border-r border-gray-100 bg-white h-screen sticky top-0 flex-col">
          <NavContent />
        </aside>
      )}

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{business?.name ?? 'Amixos'}</p>
        <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100">
          <Menu size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-white h-full shadow-xl flex flex-col">
            <div className="absolute top-3 right-3">
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}
