import { View, Text, ScrollView } from 'react-native';
import { Check } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Toggle } from '../../ui';
import { MODULE_REGISTRY, type ModuleDef } from '../../modules/registry';
import { can, type Role } from '../../lib/permissions';

export interface AddonStoreScreenProps {
  // The set of currently-enabled module ids for the active business.
  // Pre-fetched by the wrapper so the screen stays purely presentational.
  enabledIds: Set<string>;
  // Role-aware: only owner/admin sees interactive toggles. Other roles see
  // the list as a read-only catalog so they understand what's available.
  currentRole: Role | null;
  loading: boolean;
  // Called when an admin toggles a module. The wrapper persists to
  // business_modules + writes the audit log entry.
  onToggle: (moduleId: string, enable: boolean) => Promise<void> | void;
}

export function AddonStoreScreen({
  enabledIds,
  currentRole,
  loading,
  onToggle,
}: AddonStoreScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.store;
  const modulesDict = full.dashboard.modules.list;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const canManage = can.manageBusinessSettings(currentRole);

  const labelFor = (m: ModuleDef): { name: string; description: string } => {
    // i18n keys are aligned with module ids by convention. The dict shape
    // is a literal union, so cast through unknown for the lookup — if a
    // new module id is added without a matching dict entry, this is the
    // first place it will break.
    const entry = (modulesDict as unknown as Record<string, { name: string; description: string } | undefined>)[m.i18nKey];
    return entry ?? { name: m.id, description: '' };
  };

  return (
    <ScrollView contentContainerClassName="px-5 pt-5 pb-32">
      {/* Heading */}
      <View className="mb-5">
        <Text className="text-2xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-0.5">{t.subtitle}</Text>
      </View>

      {loading ? (
        <View className="py-10 items-center">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : (
        <View className="flex-col gap-3">
          {MODULE_REGISTRY.map(m => {
            const Icon = m.icon;
            const enabled = enabledIds.has(m.id);
            const isComingSoon = m.status === 'coming_soon';
            const { name, description } = labelFor(m);

            return (
              <View
                key={m.id}
                className={`bg-white rounded-2xl border ${
                  enabled ? 'border-primary/30' : 'border-gray-100'
                } p-4 flex-row items-start gap-3`}
              >
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center shrink-0"
                  style={{ backgroundColor: `${m.color}15` }}
                >
                  <Icon size={20} color={m.color} />
                </View>

                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2 flex-wrap mb-0.5">
                    <Text className="text-base font-semibold text-gray-900">{name}</Text>
                    {isComingSoon ? (
                      <View className="px-2 py-0.5 rounded-full bg-amber-100">
                        <Text className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                          {t.statusComingSoon}
                        </Text>
                      </View>
                    ) : enabled ? (
                      <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100">
                        <Check size={10} color="#059669" />
                        <Text className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                          {t.enabledBadge}
                        </Text>
                      </View>
                    ) : (
                      <View className="px-2 py-0.5 rounded-full bg-gray-100">
                        <Text className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          {t.statusAvailable}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-500" numberOfLines={2}>
                    {description}
                  </Text>
                </View>

                {/* Toggle. Disabled for coming-soon modules so users
                    understand they're planned but not buildable yet, and
                    also disabled for non-admins (read-only view). */}
                <View className="ml-2">
                  <Toggle
                    value={enabled}
                    onValueChange={() => onToggle(m.id, !enabled)}
                    disabled={isComingSoon || !canManage}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
