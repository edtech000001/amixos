import type { ComponentType } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Construction } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { getModuleById } from '@amixos/shared/modules/registry';
import MapScreen from '@/modules/map/MapScreen';
import InventoryModuleScreen from '@/modules/inventory/InventoryScreen';
import EquipmentScreen from '@/modules/equipment/EquipmentScreen';
import ArchivosScreen from '@/modules/files/ArchivosScreen';
import SmsScreen from '@/modules/sms/SmsScreen';

// Real module components register here. Unlike web, mobile can't lazy-
// download chunks — Apple/Google forbid remote JS — so every module is
// bundled. This map gates which modules actually render their own UI vs
// fall through to the placeholder.
const MODULE_COMPONENTS: Record<string, ComponentType> = {
  map: MapScreen,
  inventory: InventoryModuleScreen,
  equipment: EquipmentScreen,
  files: ArchivosScreen,
  messaging: SmsScreen,
};

export default function ModuleRoute() {
  const router = useRouter();
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const { t: full } = useLang();
  const c = useThemeColors();

  const def = moduleId ? getModuleById(moduleId) : null;

  if (!def) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
          <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
            <ChevronLeft size={22} color={c.ink} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted">Module not found.</Text>
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
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-border-soft"
        >
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-ink">{name}</Text>
      </View>
      <ScrollView contentContainerClassName="px-6 pt-10 pb-12 items-center">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mb-5"
          style={{ backgroundColor: `${def.color}15` }}
        >
          <Icon size={32} color={def.color} />
        </View>
        <Text className="text-2xl font-bold text-ink mb-2 text-center">{name}</Text>
        {description ? (
          <Text className="text-sm text-muted mb-6 text-center max-w-xs">{description}</Text>
        ) : null}
        <View className="items-center gap-2 mt-6 pt-6 border-t border-border-soft w-full">
          <Construction size={20} color={c.warning} />
          <Text className="text-sm font-semibold text-ink">
            {full.dashboard.modules.placeholder.heading}
          </Text>
          <Text className="text-xs text-muted text-center max-w-xs">
            {full.dashboard.modules.placeholder.body}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
