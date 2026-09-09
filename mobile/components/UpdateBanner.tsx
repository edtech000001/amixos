// The update prompt. Bottom-anchored (one-hand reach) and NOT dismissible: an
// update can carry a schema or API change the running bundle does not know
// about, so "later" is not a safe answer. It stays until they restart.
//
// It still never acts on its own — see lib/updates/useAppUpdate.ts for why
// restarting is always a deliberate tap. Persistent is not the same as forced:
// the user picks the moment, they just cannot make the prompt go away.
//
// Hidden entirely while a form is focused. Someone filling in a job does not
// need to know a new bundle exists, and a "Restart" button next to their
// half-typed work is a trap. It reappears the moment they leave the form.

import { Pressable, Text, View, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw, Download } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useAppUpdate } from '@/lib/updates/useAppUpdate';
import { useAuthStore } from '@/lib/auth/store';

export function UpdateBanner() {
  const { t } = useLang();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { otaReady, storeUpdate, suppressed, restart } = useAppUpdate();
  // Signed-out screens are login and onboarding: nothing to lose by restarting,
  // but also nobody to inform, and app_releases is only readable once signed
  // in. Keep those screens clean.
  const signedIn = useAuthStore(s => s.user !== null);
  const u = t.common.appUpdate;

  if (!signedIn || suppressed || (!otaReady && !storeUpdate)) return null;

  const isOta = otaReady;
  const title = isOta ? u.otaTitle : u.storeTitle;
  const body = isOta ? u.otaBody : storeUpdate?.notes || u.storeBody;
  const action = isOta ? u.restartBtn : u.storeBtn;

  return (
    // Clears the dock. `pointerEvents` is on the wrapper so the rest of the
    // screen stays tappable around the card.
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 84 }}
      className="px-3"
    >
      <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
        <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
          {isOta ? <RefreshCw size={17} color={c.primary} /> : <Download size={17} color={c.primary} />}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{title}</Text>
          <Text className="text-xs text-faint mt-0.5" numberOfLines={2}>{body}</Text>
        </View>
        <Pressable
          onPress={() => {
            if (isOta) void restart();
            else if (storeUpdate) void Linking.openURL(storeUpdate.url);
          }}
          className="px-3 py-2 rounded-xl bg-primary active:opacity-80"
        >
          <Text className="text-xs font-semibold text-white">{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}
