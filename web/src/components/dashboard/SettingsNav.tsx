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
import { Building2, ClipboardList, Users, Link2, User, Activity, ArrowLeft, FileText, LifeBuoy, Upload, DollarSign } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';

export type SettingsTab = 'negocio' | 'trabajos' | 'clientes' | 'empleados' | 'precios' | 'facturas' | 'facturatema' | 'conexiones' | 'importar' | 'cuenta' | 'soporte';

interface Props {
  activeTab?: SettingsTab;
  onTabClick?: (tab: SettingsTab) => void;
}

export function SettingsNav({ activeTab, onTabClick }: Props) {
  const pathname = usePathname();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const { currentRole } = useApp();

  // Config tabs (business + field/template setup) are an admin act — managers
  // and below can't change settings (see ROLE_DESCRIPTIONS). `cuenta` (the
  // member's own account/password) and `soporte` stay visible to everyone.
  const isAdmin = can.manageBusinessSettings(currentRole);
  const ALL_TABS: { key: SettingsTab; label: string; icon: typeof Building2; show: boolean }[] = [
    { key: 'negocio', label: t.tabs.negocio, icon: Building2, show: isAdmin },
    { key: 'trabajos', label: t.tabs.trabajos, icon: ClipboardList, show: isAdmin },
    { key: 'clientes', label: t.tabs.clientes, icon: Users, show: isAdmin },
    { key: 'empleados', label: t.tabs.empleados, icon: Users, show: isAdmin },
    { key: 'precios', label: t.tabs.precios, icon: DollarSign, show: isAdmin },
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
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full ${
      active ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <aside className="w-full md:w-60 md:shrink-0 border-b md:border-b-0 md:border-r border-gray-100 bg-white md:h-screen md:sticky md:top-0 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-100">
        <BusinessSwitcher />
      </div>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 mb-1 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all"
        >
          <ArrowLeft size={18} className="text-gray-400" />
          {full.common.buttons.back}
        </Link>

        {TABS.map(tabItem => {
          const Icon = tabItem.icon;
          // A tab is "active" only on the hub (no sub-page open) for the matching key.
          const active = !onActividad && !onEquipo && activeTab === tabItem.key;
          if (onTabClick) {
            return (
              <button key={tabItem.key} type="button" onClick={() => onTabClick(tabItem.key)} className={itemCls(active)}>
                <Icon size={18} className={active ? 'text-white' : 'text-gray-400'} />
                {tabItem.label}
              </button>
            );
          }
          return (
            <Link key={tabItem.key} href={`/dashboard/ajustes?tab=${tabItem.key}`} className={itemCls(false)}>
              <Icon size={18} className="text-gray-400" />
              {tabItem.label}
            </Link>
          );
        })}

        {can.seeAuditLog(currentRole) && (
          <Link href="/dashboard/ajustes/actividad" className={itemCls(onActividad)}>
            <Activity size={18} className={onActividad ? 'text-white' : 'text-gray-400'} />
            {t.tabs.actividad}
          </Link>
        )}
      </nav>

      {/* Platform brand — mirrors the global Sidebar footer so the Amixos
          mark stays visible while drilled into Settings. */}
      <div className="px-6 py-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-400">
          Powered by <span className="font-semibold text-gray-500">Amixos</span>
        </p>
      </div>
    </aside>
  );
}
