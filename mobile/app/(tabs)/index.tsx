import { View, Text, Pressable } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';

// Smoke-test screen — proves NativeWind, i18n, and the shared workspace
// all wire together. Will be replaced by the real dashboard in Phase D.
export default function DashboardScreen() {
  const { t, locale, labels, toggleLocale } = useLang();

  return (
    <View className="flex-1 items-center justify-center bg-surface px-6">
      <Text className="text-3xl font-bold text-primary mb-2">Amixos</Text>
      <Text className="text-base text-gray-500 mb-1">{t.dashboard.home.welcome}</Text>
      <Text className="text-sm text-gray-400 mb-8">{t.landing.hero.sub}</Text>

      <Pressable
        onPress={toggleLocale}
        className="bg-primary rounded-xl px-5 py-3 active:opacity-70"
      >
        <Text className="text-white font-semibold">
          {labels[locale]} → {labels[locale === 'es' ? 'en' : 'es']}
        </Text>
      </Pressable>
    </View>
  );
}
