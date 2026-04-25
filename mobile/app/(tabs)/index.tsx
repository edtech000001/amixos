import { View, Text } from 'react-native';
import { dictionaries, DEFAULT_LOCALE } from '@amixos/shared';

// Temporary smoke-test screen — proves NativeWind + i18n + shared workspace
// all wire together. Will be replaced by real dashboard in Phase D.
export default function DashboardScreen() {
  const t = dictionaries[DEFAULT_LOCALE].dashboard.home;

  return (
    <View className="flex-1 items-center justify-center bg-surface px-6">
      <Text className="text-3xl font-bold text-primary mb-2">Amixos</Text>
      <Text className="text-base text-gray-500">{t.welcome}</Text>
    </View>
  );
}
