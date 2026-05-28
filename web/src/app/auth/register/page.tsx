'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { RegisterScreen, type RegisterAttemptResult } from '@amixos/shared/screens/auth/RegisterScreen';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { locale } = useLang();

  const handleRegister = async (data: { firstName: string; lastName: string; email: string; password: string }): Promise<RegisterAttemptResult> => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      // locale → raw_user_meta_data → {{ .Data.locale }} in email templates.
      options: { data: { first_name: data.firstName, last_name: data.lastName, locale } },
    });
    if (error) {
      const m = error.message;
      if (m.includes('already registered') || m.includes('already been registered')) {
        return { ok: false, reason: 'already-registered' };
      }
      return { ok: false, reason: 'generic' };
    }
    window.location.href = '/onboarding';
    return { ok: true };
  };

  return (
    <RegisterScreen
      onRegister={handleRegister}
      onLoginPress={() => router.push('/auth/login')}
      onTermsPress={() => router.push('/terms')}
      onPrivacyPress={() => router.push('/privacy')}
      oauthSlot={<OAuthButtons mode="register" />}
    />
  );
}
