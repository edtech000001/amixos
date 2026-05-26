import type { ComponentType } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Construction } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { getModuleById } from '@amixos/shared/modules/registry';
import MapScreen from '@/modules/map/MapScreen';

// Real module components register here. Unlike web, mobile can't lazy-
// download chunks — Apple/Google forbid remote JS — so every module is
// bundled. This map gates which modules actually render their own UI vs
// fall through to the placeholder.
const MODULE_COMPONENTS: Record<string, ComponentType> = {
  map: MapScreen,
};

export default function ModuleRoute() {
  const router = useRouter();
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const { t: full } = useLang();

  const def = moduleId ? getModuleById(moduleId) : null;

  if (!def) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
          <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
            <ChevronLeft size={22} color="#111827" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-gray-500">Module not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const Cmp = MODULE_COMPONENTS[def.id];
  if (Cmp) return <Cmp />;

  const entry = (full.dashboard.modules.list as unknown as Record<string, { name: string; description: string } | undefined>)[def.i18nKey];
  const name = entry?.name ?? def.id;
  const description = entry?.description ?? '';
  const Icon = def.icon;

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
        <Text className="ml-1 text-lg font-semibold text-gray-900">{name}</Text>
      </View>
      <ScrollView contentContainerClassName="px-6 pt-10 pb-12 items-center">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mb-5"
          style={{ backgroundColor: `${def.color}15` }}
        >
          <Icon size={32} color={def.color} />
        </View>
        <Text className="text-2xl font-bold text-gray-900 mb-2 text-center">{name}</Text>
        {description ? (
          <Text className="text-sm text-gray-500 mb-6 text-center max-w-xs">{description}</Text>
        ) : null}
        <View className="items-center gap-2 mt-6 pt-6 border-t border-gray-100 w-full">
          <Construction size={20} color="#F59E0B" />
          <Text className="text-sm font-semibold text-gray-900">
            {full.dashboard.modules.placeholder.heading}
          </Text>
          <Text className="text-xs text-gray-500 text-center max-w-xs">
            {full.dashboard.modules.placeholder.body}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
