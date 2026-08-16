'use client';

// Shared settings rail — the single left nav while inside Settings. The global
// Sidebar hides on /dashboard/ajustes routes (drill-in), so this is the rail on
// the Ajustes hub AND its standalone sub-pages (Equipo, Actividad).
//
// Hub mode: pass activeTab + onTabClick → tabs are buttons that switch the
// in-page tab. Sub-page mode: omit them → tabs link back to the hub (?tab=) and
// the active sub-page (Equipo/Actividad) is highlighted via the current path.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ClipboardList, Users, Link2, User, Activity, ArrowLeft, FileText, LifeBuoy, Upload, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useSidebarCollapsed } from './useSidebarCollapsed';

// Same build identifier as the global Sidebar footer (app version + short SHA)
// so the footer reads identically whether or not you're drilled into Settings.
const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!v) return '';
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return sha ? `v${v} · ${sha.slice(0, 7)}` : `v${v}`;
})();

export type SettingsTab = 'negocio' | 'trabajos' | 'clientes' | 'empleados' | 'facturas' | 'facturatema' | 'conexiones' | 'importar' | 'cuenta' | 'soporte';

interface Props {
  activeTab?: SettingsTab;
  onTabClick?: (tab: SettingsTab) => void;
}

export function SettingsNav({ activeTab, onTabClick }: Props) {
  const pathname = usePathname();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const { currentRole, business } = useApp();
  // Same icon-only preference as the global Sidebar, so collapsing survives
  // the drill-in to Settings and back. Mini classes are md-gated: on mobile
  // this rail renders as a stacked top block and always stays expanded.
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  // Config tabs (business + field/template setup) are an admin act — managers
  // and below can't change settings (see ROLE_DESCRIPTIONS). `cuenta` (the
  // member's own account/password) and `soporte` stay visible to everyone.
  const isAdmin = can.manageBusinessSettings(currentRole);
  const ALL_TABS: { key: SettingsTab; label: string; icon: typeof Building2; show: boolean }[] = [
    { key: 'negocio', label: t.tabs.negocio, icon: Building2, show: isAdmin },
    { key: 'trabajos', label: t.tabs.trabajos, icon: ClipboardList, show: isAdmin },
    { key: 'clientes', label: t.tabs.clientes, icon: Users, show: isAdmin },
    { key: 'empleados', label: t.tabs.empleados, icon: Users, show: isAdmin },
    { key: 'facturas', label: t.tabs.facturas, icon: FileText, show: isAdmin },
    { key: 'conexiones', label: t.tabs.conexiones, icon: Link2, show: isAdmin },
    { key: 'importar', label: t.tabs.importar, icon: Upload, show: isAdmin },
    { key: 'cuenta', label: t.tabs.cuenta, icon: User, show: true },
    { key: 'soporte', label: t.support.heading, icon: LifeBuoy, show: true },
  ];
  const TABS = ALL_TABS.filter(tab => tab.show);

  const onActividad = pathname.startsWith('/dashboard/ajustes/actividad');
  // The role editor lives at /ajustes/equipo (reached from inside the Equipo
  // tab) — keep tabs un-highlighted while on it.
  const onEquipo = pathname.startsWith('/dashboard/ajustes/equipo');

  const itemCls = (active: boolean) =>
    `flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full ${
      collapsed ? 'md:justify-center md:px-0 px-3' : 'px-3'
    } ${active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-border-soft hover:text-ink'}`;
  const labelCls = collapsed ? 'md:hidden' : '';

  return (
    <aside className={`w-full md:shrink-0 border-b md:border-b-0 md:border-r border-border-soft bg-card md:h-screen md:sticky md:top-0 flex flex-col transition-[width] duration-200 ${collapsed ? 'md:w-[68px]' : 'md:w-60'}`}>
      {!collapsed ? (
        <div className="px-6 py-5 border-b border-border-soft">
          <BusinessSwitcher />
        </div>
      ) : (
        <>
          {/* Mobile always shows the full switcher — collapse is desktop-only. */}
          <div className="px-6 py-5 border-b border-border-soft md:hidden">
            <BusinessSwitcher />
          </div>
          <div className="hidden md:flex py-4 border-b border-border-soft items-center justify-center">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-bold" title={business?.name ?? 'Amixos'}>
              {(business?.name ?? 'A').charAt(0).toUpperCase()}
            </div>
          </div>
        </>
      )}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <Link
          href="/dashboard"
          title={collapsed ? full.common.buttons.back : undefined}
          className={`flex items-center gap-3 py-2.5 mb-1 rounded-xl text-sm font-medium text-muted hover:bg-border-soft hover:text-ink transition-all ${collapsed ? 'md:justify-center md:px-0 px-3' : 'px-3'}`}
        >
          <ArrowLeft size={18} className="text-faint" />
          <span className={labelCls}>{full.common.buttons.back}</span>
        </Link>

        {TABS.map(tabItem => {
          const Icon = tabItem.icon;
          // A tab is "active" only on the hub (no sub-page open) for the matching key.
          const active = !onActividad && !onEquipo && activeTab === tabItem.key;
          if (onTabClick) {
            return (
              <button key={tabItem.key} type="button" onClick={() => onTabClick(tabItem.key)} title={collapsed ? tabItem.label : undefined} className={itemCls(active)}>
                <Icon size={18} className={active ? 'text-white' : 'text-faint'} />
                <span className={labelCls}>{tabItem.label}</span>
              </button>
            );
          }
          return (
            <Link key={tabItem.key} href={`/dashboard/ajustes?tab=${tabItem.key}`} title={collapsed ? tabItem.label : undefined} className={itemCls(false)}>
              <Icon size={18} className="text-faint" />
              <span className={labelCls}>{tabItem.label}</span>
            </Link>
          );
        })}

        {can.seeAuditLog(currentRole) && (
          <Link href="/dashboard/ajustes/actividad" title={collapsed ? t.tabs.actividad : undefined} className={itemCls(onActividad)}>
            <Activity size={18} className={onActividad ? 'text-white' : 'text-faint'} />
            <span className={labelCls}>{t.tabs.actividad}</span>
          </Link>
        )}
      </nav>

      {/* Platform brand + theme toggle — mirrors the global Sidebar footer so
          it reads identically while drilled into Settings. */}
      {!collapsed ? (
        <div className="px-6 py-3 border-t border-border-soft flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-faint">
              Powered by <span className="font-semibold text-muted">Amixos</span>
            </p>
            {APP_VERSION && (
              <p className="text-[10px] text-faint mt-0.5">{APP_VERSION}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={toggleCollapsed}
              title={full.dashboard.sidebar.collapseSidebar}
              className="hidden md:inline-flex p-1.5 rounded-lg hover:bg-border-soft text-muted"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-6 py-3 border-t border-border-soft flex items-center justify-end md:hidden">
            <ThemeToggle />
          </div>
          <div className="py-3 border-t border-border-soft hidden md:flex flex-col items-center gap-2">
            <ThemeToggle />
            <button
              onClick={toggleCollapsed}
              title={full.dashboard.sidebar.expandSidebar}
              className="p-1.5 rounded-lg hover:bg-border-soft text-muted"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
