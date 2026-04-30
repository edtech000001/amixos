import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Briefcase,
  Calendar,
  Package,
  ChevronRight,
  LogOut,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  onPress?: () => void;
}

export default function MasMenu() {
  const router = useRouter();
  const { t } = useLang();
  const { signOut, business } = useApp();
  const sb = t.dashboard.sidebar;

  const items: MenuItem[] = [
    { key: 'empleados', label: sb.empleados, icon: Briefcase, path: '/dashboard/mas/empleados' },
    { key: 'calendario', label: sb.calendario, icon: Calendar, path: '/dashboard/mas/calendario' },
    { key: 'inventario', label: sb.inventario, icon: Package, path: '/dashboard/mas/inventario' },
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
        <Text className="text-2xl font-bold text-gray-900 mb-1">Más</Text>
        {business?.name ? (
          <Text className="text-sm text-gray-500 mb-6">{business.name}</Text>
        ) : null}

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
                className={`flex-row items-center gap-3 px-5 py-4 active:bg-gray-50 ${
                  i < items.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                  <Icon size={18} className="text-primary" />
                </View>
                <Text className="flex-1 text-sm font-medium text-gray-900">{item.label}</Text>
                <ChevronRight size={16} color="#9CA3AF" />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={confirmSignOut}
          className="flex-row items-center gap-3 px-5 py-4 mt-4 bg-white rounded-2xl border border-gray-100 active:bg-red-50"
        >
          <View className="w-9 h-9 rounded-xl bg-red-50 items-center justify-center">
            <LogOut size={18} color="#EF4444" />
          </View>
          <Text className="flex-1 text-sm font-medium text-red-600">{sb.logout}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
