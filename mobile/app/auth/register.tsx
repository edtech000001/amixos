import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { RegisterScreen, type RegisterAttemptResult } from '@amixos/shared/screens/auth/RegisterScreen';
import { OAuthButtons } from '@/components/OAuthButtons';

export default function RegisterRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { locale } = useLang();

  const handleRegister = async (data: { firstName: string; lastName: string; email: string; password: string }): Promise<RegisterAttemptResult> => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      // locale lands in raw_user_meta_data → readable as {{ .Data.locale }}
      // in the Supabase email templates so confirm/reset emails can be
      // sent in the user's language.
      options: { data: { first_name: data.firstName, last_name: data.lastName, locale } },
    });
    if (error) {
      const m = error.message;
      if (m.includes('already registered') || m.includes('already been registered')) {
        return { ok: false, reason: 'already-registered' };
      }
      return { ok: false, reason: 'generic' };
    }
    router.replace('/onboarding');
    return { ok: true };
  };

  // Mobile: open marketing URLs in the system browser. Replace with the
  // production marketing-site URLs when available.
  const openExternal = (url: string) => Linking.openURL(url).catch(() => {});

  const handleOAuthSuccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let needsOnboarding = false;
    if (session) {
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .limit(1);
      needsOnboarding = !businesses || businesses.length === 0;
    }
    router.replace(needsOnboarding ? '/onboarding' : '/(tabs)');
  };

  return (
    <RegisterScreen
      onRegister={handleRegister}
      onLoginPress={() => router.push('/auth/login')}
      onTermsPress={() => openExternal('https://amixos.app/terms')}
      onPrivacyPress={() => openExternal('https://amixos.app/privacy')}
      oauthSlot={<OAuthButtons onSuccess={handleOAuthSuccess} />}
    />
  );
}
