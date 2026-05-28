'use client';

// Web-only AddonStoreScreen — plain HTML + Tailwind. Same exported API as
// AddonStoreScreen.tsx so the web page wrapper is untouched and the bundler
// resolves this .web.tsx variant automatically. Module icons come from the
// registry (lucide-react-native) and render as SVG via react-native-svg.

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useLang } from '../../i18n';
import { MODULE_REGISTRY, type ModuleDef, type ModuleCategory } from '../../modules/registry';
import { can, type Role } from '../../lib/permissions';

type CategoryFilter = ModuleCategory | 'all';

export interface AddonStoreScreenProps {
  enabledIds: Set<string>;
  currentRole: Role | null;
  loading: boolean;
  onToggle: (moduleId: string, enable: boolean) => Promise<void> | void;
  onOpen?: (moduleId: string) => void;
}

export function AddonStoreScreen({
  enabledIds,
  currentRole,
  loading,
  onToggle,
  onOpen,
}: AddonStoreScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.store;
  const modulesDict = full.dashboard.modules.list;
  const canManage = can.manageBusinessSettings(currentRole);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const labelFor = (m: ModuleDef): { name: string; description: string } => {
    const entry = (modulesDict as unknown as Record<string, { name: string; description: string } | undefined>)[m.i18nKey];
    return entry ?? { name: m.id, description: '' };
  };

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return MODULE_REGISTRY.filter(m => {
      if (category !== 'all' && m.category !== category) return false;
      if (!q) return true;
      const { name, description } = labelFor(m);
      return norm(name).includes(q) || norm(description).includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, modulesDict]);

  const CATEGORIES: Array<{ key: CategoryFilter; label: string }> = [
    { key: 'all',      label: t.categoryAll },
    { key: 'tools',    label: t.categoryTools },
    { key: 'industry', label: t.categoryIndustry },
  ];

  return (
    <div className="px-5 lg:px-6 pt-5 pb-10">
      {/* Heading */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t.heading}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t.subtitle}</p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Category chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {CATEGORIES.map(c => {
          const active = category === c.key;
          return (
            <button
              type="button"
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                active ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 flex items-center justify-center">
          <p className="text-sm text-gray-500">{t.noResults}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(m => {
            const Icon = m.icon;
            const dbEnabled = enabledIds.has(m.id);
            const isComingSoon = m.status === 'coming_soon';
            const enabled = dbEnabled && !isComingSoon;
            const { name, description } = labelFor(m);
            const canOpen = enabled && !!onOpen;

            const buttonLabel = isComingSoon ? t.statusComingSoon : enabled ? t.disable : t.enable;
            const buttonStyle = isComingSoon
              ? 'bg-gray-100 border border-gray-200'
              : enabled
                ? 'bg-white border border-gray-200'
                : 'bg-primary';
            const buttonText = isComingSoon ? 'text-gray-400' : enabled ? 'text-gray-900' : 'text-white';

            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col"
                style={enabled ? { borderColor: `${m.color}40` } : undefined}
              >
                <div
                  onClick={canOpen ? () => onOpen?.(m.id) : undefined}
                  className={`mb-3 ${canOpen ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: `${m.color}15` }}
                    >
                      <Icon size={22} color={m.color} />
                    </div>
                    {isComingSoon ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-[9px] font-bold text-amber-700 uppercase tracking-wider">
                        {t.statusComingSoon}
                      </span>
                    ) : enabled ? (
                      <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 uppercase tracking-wider">
                        <Check size={9} className="text-emerald-600" />
                        {t.enabledBadge}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-base font-semibold text-gray-900 mb-0.5 truncate">{name}</p>
                  <p className="text-xs text-gray-500 leading-snug line-clamp-3">{description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onToggle(m.id, !enabled)}
                  disabled={isComingSoon || !canManage}
                  className={`mt-auto rounded-xl py-2.5 text-xs font-semibold transition-opacity ${buttonStyle} ${buttonText} ${
                    isComingSoon || !canManage ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                >
                  {buttonLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
