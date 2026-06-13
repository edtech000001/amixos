import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { MODULE_REGISTRY, type ModuleDef, type ModuleCategory } from '../../modules/registry';
import { can, type Role } from '../../lib/permissions';

type CategoryFilter = ModuleCategory | 'all';

export interface AddonStoreScreenProps {
  // The set of currently-enabled module ids for the active business.
  // Pre-fetched by the wrapper so the screen stays purely presentational.
  enabledIds: Set<string>;
  // Role-aware: only owner/admin sees interactive controls. Other roles see
  // the catalog as read-only so they still understand what's available.
  currentRole: Role | null;
  loading: boolean;
  // Called when the user confirms enabling/disabling a module. Wrappers
  // are expected to have already shown a confirmation dialog before
  // calling this — keeps the shared screen platform-agnostic (mobile
  // uses Alert, web uses confirm()/Modal).
  onToggle: (moduleId: string, enable: boolean) => Promise<void> | void;
  // Called when the user taps the card body (not the action button) to
  // open the module's page. Only invoked when module is available + enabled.
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
    // i18n keys are aligned with module ids by convention. The dict shape
    // is a literal union, so cast through unknown for the lookup — if a
    // new module id is added without a matching dict entry, this is the
    // first place it will break.
    const entry = (modulesDict as unknown as Record<string, { name: string; description: string } | undefined>)[m.i18nKey];
    return entry ?? { name: m.id, description: '' };
  };

  // Diacritic-stripping normalizer — matches the autocomplete trick used
  // elsewhere so "industria" finds modules titled "Industría", etc.
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() => {
    const q = norm(search.trim());
    // Group rank: 0 = enabled, 1 = available (not enabled), 2 = coming-soon.
    // Within each group, preserve registry order (curated) so featured
    // modules stay near the top.
    const rank = (m: ModuleDef): number => {
      if (m.status === 'coming_soon') return 2;
      return enabledIds.has(m.id) ? 0 : 1;
    };
    const list = MODULE_REGISTRY.filter(m => {
      if (category !== 'all' && m.category !== category) return false;
      if (!q) return true;
      const { name, description } = labelFor(m);
      return norm(name).includes(q) || norm(description).includes(q);
    });
    // Stable sort by rank — Array#sort is stable in ES2019+ (RN's Hermes
    // and modern V8 both honor it), so equal ranks keep registry order.
    return [...list].sort((a, b) => rank(a) - rank(b));
    // labelFor depends on the i18n dict — re-derive when the locale changes
    // by keying on `modulesDict`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, enabledIds, modulesDict]);

  const CATEGORIES: Array<{ key: CategoryFilter; label: string }> = [
    { key: 'all',      label: t.categoryAll },
    { key: 'tools',    label: t.categoryTools },
    { key: 'industry', label: t.categoryIndustry },
  ];

  // In the "All" view, split into labeled sections so add-on tools read
  // distinctly from full industry verticals. A specific filter renders one
  // unlabeled group (the active chip already names it).
  const groups: Array<{ key: string; label: string | null; items: ModuleDef[] }> =
    category === 'all'
      ? [
          { key: 'tools', label: t.categoryTools, items: filtered.filter(m => m.category === 'tools') },
          { key: 'industry', label: t.categoryIndustry, items: filtered.filter(m => m.category === 'industry') },
        ].filter(g => g.items.length > 0)
      : [{ key: category, label: null, items: filtered }];

  return (
    <ScrollView contentContainerClassName="px-5 pt-5 pb-32">
      {/* Heading */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-0.5">{t.subtitle}</Text>
      </View>

      {/* Search bar — diacritic-aware substring match against name + description. */}
      <View className="flex-row items-center gap-2 mb-3 rounded-2xl bg-white border border-gray-200 px-4 py-2.5">
        <Search size={16} color="#9CA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t.searchPlaceholder}
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-sm text-gray-900"
        />
      </View>

      {/* Category filter chips. Horizontal scroll so we can grow the
         categorization later without UI churn. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pb-1 pr-5"
        className="mb-3 -mx-5 px-5"
      >
        {CATEGORIES.map(c => {
          const active = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              className={`px-3.5 py-1.5 rounded-full ${
                active ? 'bg-primary' : 'bg-white border border-gray-200'
              }`}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-700'}`}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View className="py-10 items-center">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : (
        filtered.length === 0 ? (
          <View className="py-10 items-center">
            <Text className="text-sm text-gray-500">{t.noResults}</Text>
          </View>
        ) : (
        // Single column — one card per row (w-full) so each module's name +
        // description has room to read instead of being cramped two-up.
        <View className="gap-5">
          {groups.map(g => (
            <View key={g.key}>
              {g.label ? (
                <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">{g.label}</Text>
              ) : null}
              {g.items.map(m => {
            const Icon = m.icon;
            const dbEnabled = enabledIds.has(m.id);
            const isComingSoon = m.status === 'coming_soon';
            // Visual "enabled" state ignores DB state for coming-soon
            // modules. A leftover business_modules row from when a module
            // was prematurely enabled shouldn't make the card pretend it's
            // active — the user can't use the module yet either way.
            const enabled = dbEnabled && !isComingSoon;
            const { name, description } = labelFor(m);
            const canOpen = enabled && !!onOpen;

            // Button label + style change based on state. We show the
            // action the button performs (Activar when off, Desactivar
            // when on) rather than the current state.
            const buttonLabel = isComingSoon
              ? t.statusComingSoon
              : enabled
                ? t.disable
                : t.enable;
            const buttonStyle = isComingSoon
              ? 'bg-gray-100 border border-gray-200'
              : enabled
                ? 'bg-white border border-gray-200'
                : 'bg-primary';
            const buttonText = isComingSoon
              ? 'text-gray-400'
              : enabled
                ? 'text-gray-900'
                : 'text-white';

            return (
              <View
                key={m.id}
                className={`w-full bg-white rounded-2xl ${enabled ? 'border-2' : 'border'} border-gray-100 p-4 mb-3`}
                style={enabled ? { borderColor: '#4ADE80' } : undefined}
              >
                <Pressable
                  onPress={canOpen ? () => onOpen?.(m.id) : undefined}
                  disabled={!canOpen}
                  className="mb-3"
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View
                      className="w-12 h-12 rounded-2xl items-center justify-center"
                      style={{ backgroundColor: `${m.color}15` }}
                    >
                      <Icon size={22} color={m.color} />
                    </View>
                    {/* Status pill in the top-right corner of the card. */}
                    {isComingSoon ? (
                      <View className="px-2 py-0.5 rounded-full bg-amber-100">
                        <Text className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">
                          {t.statusComingSoon}
                        </Text>
                      </View>
                    ) : enabled ? (
                      <View className="flex-row items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-100">
                        <Check size={9} color="#059669" />
                        <Text className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">
                          {t.enabledBadge}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text className="text-base font-semibold text-gray-900 mb-0.5" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text className="text-xs text-gray-500 leading-snug" numberOfLines={3}>
                    {description}
                  </Text>
                </Pressable>

                {/* Action button. Replaces the old Toggle so the affordance
                    matches the user's mental model of "this is something
                    I activate" rather than a settings switch. */}
                <Pressable
                  onPress={() => onToggle(m.id, !enabled)}
                  disabled={isComingSoon || !canManage}
                  className={`rounded-xl py-2.5 items-center ${buttonStyle} ${
                    isComingSoon || !canManage ? 'opacity-60' : ''
                  }`}
                >
                  <Text className={`text-xs font-semibold ${buttonText}`}>{buttonLabel}</Text>
                </Pressable>
              </View>
            );
              })}
            </View>
          ))}
        </View>
        )
      )}
    </ScrollView>
  );
}
