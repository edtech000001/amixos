import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { RegisterScreen, type RegisterAttemptResult } from '@amixos/shared/screens/auth/RegisterScreen';
import { classifyPasswordError } from '@amixos/shared/lib/passwordErrors';
import { recordAcceptanceQuietly } from '@amixos/shared/lib/policyConsent';
import { OAuthButtons } from '@/components/OAuthButtons';
import { Captcha, type CaptchaHandle } from '@/components/Captcha';

export default function RegisterRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);
  const { locale } = useLang();

  const handleRegister = async (data: { firstName: string; lastName: string; email: string; password: string }): Promise<RegisterAttemptResult> => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      // locale lands in raw_user_meta_data → readable as {{ .Data.locale }}
      // in the Supabase email templates so confirm/reset emails can be
      // sent in the user's language.
      options: {
        data: { first_name: data.firstName, last_name: data.lastName, locale },
        captchaToken: captchaToken ?? undefined,
      },
    });
    if (error) {
      // Single-use token — a retry needs a fresh challenge or it fails on the
      // captcha instead of on whatever the user actually needs to fix.
      captcha.current?.reset();
      const m = error.message;
      if (m.includes('already registered') || m.includes('already been registered')) {
        return { ok: false, reason: 'already-registered' };
      }
      // The project rejects breached and low-complexity passwords server-side
      // and explains why in English; classify so the screen can say it in the
      // user's language.
      const issue = classifyPasswordError(error);
      if (issue === 'pwned') return { ok: false, reason: 'leaked-password' };
      if (issue === 'characters' || issue === 'length') return { ok: false, reason: 'weak-password' };
      return { ok: false, reason: 'generic' };
    }
    // The signup screen shows "Al registrarte aceptas nuestros Términos y
    // Política de privacidad" above the button — ordinary sign-in-wrap consent.
    // Record it so there is evidence of WHICH version was agreed to. Quiet by
    // design: a failed insert must not block someone from reaching the app,
    // and the consent gate catches anyone this misses.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      recordAcceptanceQuietly(supabase, session.user.id, { method: 'signup', scrolledToEnd: false, platform: Platform.OS === 'android' ? 'android' : 'ios' });
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
      onTermsPress={() => openExternal('https://amixos.com/terms')}
      onPrivacyPress={() => openExternal('https://amixos.com/privacy')}
      oauthSlot={<OAuthButtons onSuccess={handleOAuthSuccess} />}
      captchaSlot={<Captcha ref={captcha} onToken={setCaptchaToken} />}
    />
  );
}
