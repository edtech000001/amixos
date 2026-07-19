import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, AlertTriangle } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useAuthStore } from '@/lib/auth/store';
import {
  trialDaysLeft,
  isTrialExpired,
  isInTrial,
  type SubscriptionInfo,
} from '@amixos/shared/lib/subscription';

// Slim trial banner shown at the top of the dashboard home — ONLY while the
// active business is trialing (still counting down) or its trial has expired.
// Tapping opens the WEB billing page (iOS/Android can't sell digital subs
// in-app). Returns null for any active/paid/none state.
export function TrialBanner() {
  const { locale } = useLang();
  const en = locale === 'en';
  const router = useRouter();
  const c = useThemeColors();
  const business = useAuthStore((s) => s.business);

  if (!business) return null;

  const sub: SubscriptionInfo = {
    plan: business.plan,
    subscription_status: business.subscription_status,
    trial_ends_at: business.trial_ends_at,
    current_period_end: business.current_period_end,
  };

  const trialing = isInTrial(sub);
  const expired = isTrialExpired(sub);
  // Additional businesses (no trial granted) land at 'none' — prompt to pick a
  // plan instead of leaving them silently un-activated.
  const needsPlan = sub.subscription_status === 'none';
  if (!trialing && !expired && !needsPlan) return null;

  // iOS: App Store guideline 3.1.1 bars in-app links to an external purchase
  // flow for digital subs — navigate INTERNALLY to the account screen instead.
  // Android keeps opening the web billing page.
  const open = () => {
    if (Platform.OS === 'ios') {
      router.push('/dashboard/mas/ajustes/cuenta');
      return;
    }
    Linking.openURL(
      `${process.env.EXPO_PUBLIC_WEB_URL}/dashboard/ajustes?tab=cuenta`,
    ).catch(() => {});
  };

  if (expired || needsPlan) {
    return (
      <Pressable
        onPress={open}
        className="mx-4 mb-3 flex-row items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-500/10 px-4 py-3 active:opacity-80"
      >
        <AlertTriangle size={18} color={c.warning} />
        <Text className="flex-1 text-sm font-semibold text-amber-800">
          {needsPlan
            ? en
              ? 'Choose a plan to activate this business'
              : 'Elige un plan para activar este negocio'
            : en
              ? 'Your trial ended · Subscribe'
              : 'Tu prueba terminó · Suscríbete'}
        </Text>
      </Pressable>
    );
  }

  const days = trialDaysLeft(sub) ?? 0;
  return (
    <Pressable
      onPress={open}
      className="mx-4 mb-3 flex-row items-center gap-2.5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 active:opacity-80"
    >
      <Clock size={18} color={c.primary} />
      <Text className="flex-1 text-sm font-semibold text-primary">
        {en
          ? `${days} ${days === 1 ? 'day' : 'days'} left in your trial · Subscribe`
          : `Te quedan ${days} ${days === 1 ? 'día' : 'días'} de prueba · Suscríbete`}
      </Text>
    </Pressable>
  );
}
