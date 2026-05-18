import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Building2,
  Briefcase,
  Users,
  User as UserIcon,
  Cloud,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';

interface SettingsItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  path: string;
}

export default function AjustesIndex() {
  const router = useRouter();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const items: SettingsItem[] = [
    {
      key: 'negocio',
      label: t.tabs.negocio,
      description: t.business.subtitle,
      icon: Building2,
      path: '/dashboard/mas/ajustes/negocio',
    },
    {
      key: 'trabajos',
      label: t.tabs.trabajos,
      description: t.pipeline.subtitle,
      icon: Briefcase,
      path: '/dashboard/mas/ajustes/trabajos',
    },
    {
      key: 'clientes',
      label: t.tabs.clientes,
      description: t.requiredFields.subtitle,
      icon: Users,
      path: '/dashboard/mas/ajustes/clientes',
    },
    {
      key: 'cuenta',
      label: t.tabs.cuenta,
      description: t.account.subtitle,
      icon: UserIcon,
      path: '/dashboard/mas/ajustes/cuenta',
    },
    {
      key: 'conexiones',
      label: t.tabs.conexiones,
      description: t.google.subtitle,
      icon: Cloud,
      path: '/dashboard/mas/ajustes/conexiones',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-gray-900">{t.title}</Text>
      </View>

      <ScrollView contentContainerClassName="px-6 pt-6 pb-36">
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.path as never)}
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
      </ScrollView>
    </SafeAreaView>
  );
}
