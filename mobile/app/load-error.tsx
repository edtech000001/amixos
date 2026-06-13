import { useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudOff } from 'lucide-react-native';
import { useAuthStore } from '@/lib/auth/store';
import { useLang } from '@/lib/i18n/LangProvider';
import { Button } from '@amixos/shared/ui';

// Shown by the route gate when the business fetch FAILED (vs returned zero
// businesses). Keeps an existing user out of onboarding — the most common
// cause is a not-yet-run DB migration leaving a referenced column missing.
// "Retry" just re-runs refetchBusiness; once it succeeds the gate routes the
// user back to the dashboard automatically.
export default function LoadErrorRoute() {
  const { t: full } = useLang();
  const t = full.common.loadError;
  const refetchBusiness = useAuthStore((s) => s.refetchBusiness);
  const logout = useAuthStore((s) => s.logout);
  const [retrying, setRetrying] = useState(false);

  const onRetry = async () => {
    setRetrying(true);
    await refetchBusiness();
    setRetrying(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-5">
          <CloudOff size={28} color="#4F46E5" />
        </View>
        <Text className="text-xl font-bold text-gray-900 text-center">{t.title}</Text>
        <Text className="text-sm text-gray-500 text-center mt-2 leading-5">{t.body}</Text>

        <View className="w-full mt-8 gap-3">
          <Button onPress={onRetry} loading={retrying} fullWidth>
            <Text className="text-white font-semibold">{t.retry}</Text>
          </Button>
          <Button variant="secondary" onPress={logout} fullWidth>
            <Text className="text-gray-700 font-semibold">{t.signOut}</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
