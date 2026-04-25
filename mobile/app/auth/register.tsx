import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { RegisterScreen, type RegisterAttemptResult } from '@amixos/shared/screens/auth/RegisterScreen';

export default function RegisterRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();

  const handleRegister = async (data: { firstName: string; lastName: string; email: string; password: string }): Promise<RegisterAttemptResult> => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { first_name: data.firstName, last_name: data.lastName } },
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

  return (
    <RegisterScreen
      onRegister={handleRegister}
      onLoginPress={() => router.push('/auth/login')}
      onTermsPress={() => openExternal('https://amixos.app/terms')}
      onPrivacyPress={() => openExternal('https://amixos.app/privacy')}
    />
  );
}
