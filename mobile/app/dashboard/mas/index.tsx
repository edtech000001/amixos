import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  UsersRound,
  Calendar,
  Settings,
  Store as StoreIcon,
  ChevronRight,
  HardHat,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';

interface MenuItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path?: string;
  onPress?: () => void;
}

export default function MasMenu() {
  const router = useRouter();
  const { t } = useLang();
  const { business } = useApp();
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

  const moduleItems: MenuItem[] = liveModules.map(m => {
    const entry = (modulesDict as unknown as Record<string, { name: string; description: string } | undefined>)[m.i18nKey];
    return {
      key: `module-${m.id}`,
      label: entry?.name ?? m.id,
      description: entry?.description ?? '',
      icon: m.icon,
      path: `/dashboard/mas/modulos/${m.id}`,
    };
  });

  // Core tools + any enabled modules — the "what you do" group.
  const mainItems: MenuItem[] = [
    // "Mis Trabajos" — Project-Leader shortcut. Empty list for users who
    // aren't the lead on any job (RLS-friendly), so safe to always show.
    {
      key: 'misTrabajos',
      label: sb.misTrabajos,
      description: sb.descriptions.misTrabajos,
      icon: HardHat,
      path: '/dashboard/trabajos/mis-trabajos',
    },
    {
      key: 'empleados',
      label: sb.empleados,
      description: sb.descriptions.empleados,
      icon: UsersRound,
      path: '/dashboard/mas/empleados',
    },
    {
      key: 'calendario',
      label: sb.calendario,
      description: sb.descriptions.calendario,
      icon: Calendar,
      path: '/dashboard/mas/calendario',
    },
    // Enabled modules slot in after core nav so the "what's on" group is
    // contiguous. Empty when no modules are active.
    ...moduleItems,
  ];

  // Configuration surfaces — visually separated from the tools above.
  const settingsItems: MenuItem[] = [
    {
      key: 'tienda',
      label: store.heading,
      description: sb.descriptions.tienda,
      icon: StoreIcon,
      path: '/dashboard/mas/ajustes/tienda',
    },
    {
      key: 'ajustes',
      label: sb.ajustes,
      description: sb.descriptions.ajustes,
      icon: Settings,
      path: '/dashboard/mas/ajustes',
    },
  ];

  // Card group — matches the Ajustes index layout: 10×10 icon tile in
  // primary tint, bold name, small description, chevron on the right.
  const renderGroup = (groupItems: MenuItem[]) => (
    <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {groupItems.map((item, i) => {
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (item.path) router.push(item.path as any);
              else item.onPress?.();
            }}
            className={`flex-row items-center gap-3 px-4 py-4 active:bg-gray-50 ${
              i < groupItems.length - 1 ? 'border-b border-gray-50' : ''
            }`}
          >
            <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
              <Icon size={18} color="#4F46E5" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-900">{item.label}</Text>
              <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                {item.description}
              </Text>
            </View>
            <ChevronRight size={18} color="#9CA3AF" />
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 pt-6 pb-32">
        <Text className="text-2xl font-bold text-gray-900 mb-1">{sb.mas}</Text>
        {business?.name ? (
          <Text className="text-sm text-gray-500 mb-6">{business.name}</Text>
        ) : null}

        {renderGroup(mainItems)}
        <View className="mt-4">{renderGroup(settingsItems)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
