import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Briefcase,
  Calendar,
  Package,
  Settings,
  Store as StoreIcon,
  ChevronRight,
  LogOut,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';

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
  const { signOut, business } = useApp();
  const sb = t.dashboard.sidebar;
  const store = t.dashboard.settings.store;

  // The Más menu intentionally does NOT auto-add enabled modules. Modules
  // are reached through the Tienda page directly (tap a card → open the
  // module). Keeps this surface stable regardless of which modules a
  // business has on.
  const items: MenuItem[] = [
    {
      key: 'empleados',
      label: sb.empleados,
      description: sb.descriptions.empleados,
      icon: Briefcase,
      path: '/dashboard/mas/empleados',
    },
    {
      key: 'calendario',
      label: sb.calendario,
      description: sb.descriptions.calendario,
      icon: Calendar,
      path: '/dashboard/mas/calendario',
    },
    {
      key: 'inventario',
      label: sb.inventario,
      description: sb.descriptions.inventario,
      icon: Package,
      path: '/dashboard/mas/inventario',
    },
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

  const confirmSignOut = () => {
    Alert.alert(sb.logout, '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: sb.logout, style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView contentContainerClassName="p-6">
        <Text className="text-2xl font-bold text-gray-900 mb-1">{sb.mas}</Text>
        {business?.name ? (
          <Text className="text-sm text-gray-500 mb-6">{business.name}</Text>
        ) : null}

        {/* Card group — matches the Ajustes index layout exactly: 10×10
            icon tile in primary tint, bold name on top, small description
            below, chevron on the right. Padding + dividers mirror that
            page so the two feel like one surface. */}
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  if (item.path) router.push(item.path as any);
                  else item.onPress?.();
                }}
                className={`flex-row items-center gap-3 px-4 py-4 active:bg-gray-50 ${
                  i < items.length - 1 ? 'border-b border-gray-50' : ''
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

        <Pressable
          onPress={confirmSignOut}
          className="flex-row items-center gap-3 px-4 py-4 mt-4 bg-white rounded-2xl border border-gray-100 active:bg-red-50"
        >
          <View className="w-10 h-10 rounded-xl bg-red-50 items-center justify-center">
            <LogOut size={18} color="#EF4444" />
          </View>
          <Text className="flex-1 text-base font-semibold text-red-600">{sb.logout}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
