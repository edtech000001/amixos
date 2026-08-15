import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Settings,
  Store as StoreIcon,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { can } from '@amixos/shared/lib/permissions';
import { eligibleDockApps, effectiveDockKeys } from '@/lib/dockApps';
import { useDockStore } from '@/lib/dockStore';

interface MenuItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path?: string;
  onPress?: () => void;
  /** Omitted = visible to everyone. */
  show?: boolean;
}

export default function MasMenu() {
  const router = useRouter();
  const { t } = useLang();
  const c = useThemeColors();
  const { business, currentRole } = useApp();
  const sb = t.dashboard.sidebar;
  const store = t.dashboard.settings.store;
  const modulesDict = t.dashboard.modules.list;
  const supabase = createSupabaseClient();

  // Enabled + AVAILABLE modules show up as cards in the Más list (so
  // they're one tap from anywhere, not buried behind Tienda). Coming-soon
  // modules are filtered out even if their business_modules row is on —
  // they have nothing usable to open yet.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const liveModules = enabledModules.filter(m => m.status === 'available');

  const toModuleItem = (m: (typeof liveModules)[number]): MenuItem => {
    const entry = (modulesDict as unknown as Record<string, { name: string; description: string } | undefined>)[m.i18nKey];
    return {
      key: `module-${m.id}`,
      label: entry?.name ?? m.id,
      description: entry?.description ?? '',
      icon: m.icon,
      path: `/dashboard/mas/modulos/${m.id}`,
      // Equipment/rentals are role-gated (their own permissions); members
      // without view don't see the card. Other modules stay visible to any member.
      show: m.id === 'equipment' ? can.viewEquipment(currentRole)
        : m.id === 'rentals' ? can.viewRentals(currentRole)
        : true,
    };
  };
  // Tool modules stay in the main group; INDUSTRY modules are full apps of
  // their own and get a labeled "Apps" group between the tools and Tienda.
  const moduleItems: MenuItem[] = liveModules.filter(m => m.category !== 'industry').map(toModuleItem);
  const appItems: MenuItem[] = liveModules.filter(m => m.category === 'industry').map(toModuleItem)
    .filter(item => item.show !== false);

  // Apps the user can pin to the dock but hasn't — surfaced here so removing
  // one from the dock (Navegación) never makes it unreachable. Pinned apps are
  // reached via the dock, so they're omitted here.
  const dockKeys = useDockStore(s => s.keys);
  const pinned = new Set(effectiveDockKeys(dockKeys, currentRole));
  const unpinnedItems: MenuItem[] = eligibleDockApps(currentRole)
    .filter(a => !pinned.has(a.key))
    .map(a => ({
      key: a.key,
      label: sb[a.labelKey],
      description: sb.descriptions[a.labelKey],
      icon: a.Icon,
      path: a.path,
    }));

  // Core tools + any enabled modules — the "what you do" group.
  const mainItems: MenuItem[] = [
    // Apps not pinned to the dock (Clientes, Trabajos, Facturas, Calendario,
    // Empleados, Inventario — minus whatever is in the dock).
    ...unpinnedItems,
    // Enabled modules slot in after core nav so the "what's on" group is
    // contiguous. Empty when no modules are active.
    ...moduleItems,
  ].filter(item => item.show !== false);

  // Configuration surfaces — visually separated from the tools above.
  // Tienda (enabling modules) is admin-only; Ajustes stays for everyone
  // (it holds the personal account tab — config tabs are gated inside).
  const settingsItems: MenuItem[] = [
    {
      key: 'tienda',
      label: store.heading,
      description: sb.descriptions.tienda,
      icon: StoreIcon,
      path: '/dashboard/mas/ajustes/tienda',
      show: can.manageBusinessSettings(currentRole),
    },
    {
      key: 'ajustes',
      label: sb.ajustes,
      description: sb.descriptions.ajustes,
      icon: Settings,
      path: '/dashboard/mas/ajustes',
    },
  ].filter(item => item.show !== false);

  // Card group — matches the Ajustes index layout: 10×10 icon tile in
  // primary tint, bold name, small description, chevron on the right.
  const renderGroup = (groupItems: MenuItem[]) => (
    <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
      {groupItems.map((item, i) => {
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              // navigate (not push): a double-tap must not stack two copies
              // of the same screen — same fix family as the dock debounce.
              if (item.path) router.navigate(item.path as any);
              else item.onPress?.();
            }}
            className={`flex-row items-center gap-3 px-4 py-4 active:bg-surface ${
              i < groupItems.length - 1 ? 'border-b border-border-soft' : ''
            }`}
          >
            <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
              <Icon size={18} color={c.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{item.label}</Text>
              <Text className="text-xs text-muted mt-0.5" numberOfLines={2}>
                {item.description}
              </Text>
            </View>
            <ChevronRight size={18} color={c.faint} />
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 pt-6 pb-44">
        <Text className="text-2xl font-bold text-ink mb-1">{sb.mas}</Text>
        {business?.name ? (
          <Text className="text-sm text-muted mb-6">{business.name}</Text>
        ) : null}

        {renderGroup(mainItems)}
        {appItems.length > 0 ? (
          <View className="mt-5">
            <Text className="text-xs font-bold text-muted uppercase tracking-wide px-1 mb-2">
              {sb.appsSection}
            </Text>
            {renderGroup(appItems)}
          </View>
        ) : null}
        <View className="mt-4">{renderGroup(settingsItems)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
