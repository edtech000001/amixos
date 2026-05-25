import { View, Text, ScrollView, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { MODULE_REGISTRY, type ModuleDef } from '../../modules/registry';
import { can, type Role } from '../../lib/permissions';

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
        // 2-column grid. Each card uses width 48% so they pack side-by-side
        // with a tiny gutter; flex-wrap pushes the third card onto the next
        // row. Mobile and web (via react-native-web) both honor this.
        <View className="flex-row flex-wrap justify-between">
          {MODULE_REGISTRY.map(m => {
            const Icon = m.icon;
            const enabled = enabledIds.has(m.id);
            const isComingSoon = m.status === 'coming_soon';
            const { name, description } = labelFor(m);
            const canOpen = enabled && !isComingSoon && !!onOpen;

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
                className="w-[48%] bg-white rounded-2xl border border-gray-100 p-4 mb-3"
                style={enabled ? { borderColor: `${m.color}40` } : undefined}
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
      )}
    </ScrollView>
  );
}
