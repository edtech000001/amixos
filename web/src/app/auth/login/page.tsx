'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { LoginScreen, type LoginAttemptResult } from '@amixos/shared/screens/auth/LoginScreen';
import { useLang } from '@/i18n/LangProvider';
import { userNeedsOnboarding } from '@/lib/onboardingGate';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { t: full } = useLang();

  const urlError = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('error')
    : null;
  const initialError = urlError ? full.auth.login.urlError : undefined;

  const handleLogin = async (email: string, password: string): Promise<LoginAttemptResult> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const m = error.message;
        if (m.includes('Email not confirmed') || m.includes('email not confirmed')) return { ok: false, reason: 'email-not-confirmed' };
        if (m.includes('Invalid login credentials') || m.includes('invalid_credentials')) return { ok: false, reason: 'invalid-credentials' };
        if (m.includes('Too many requests')) return { ok: false, reason: 'too-many-requests' };
        if (m.includes('User not found')) return { ok: false, reason: 'user-not-found' };
        return { ok: false, reason: 'generic' };
      }

      // Honor ?next= (invite links: /auth/login?next=/invitacion/TOKEN).
      // Invited users are JOINING a business, so skip the create-business
      // onboarding and send them straight to the destination.
      const nextParam = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('next')
        : null;
      if (nextParam && nextParam.startsWith('/')) {
        window.location.href = nextParam;
        return { ok: true, needsOnboarding: false };
      }

      const { data: { session } } = await supabase.auth.getSession();
      let needsOnboarding = false;
      if (session) {
        needsOnboarding = await userNeedsOnboarding(supabase, session.user.id);
      }

      // Hard navigate so SSR session cookies are read fresh on the next page.
      window.location.href = needsOnboarding ? '/onboarding' : '/dashboard';
      return { ok: true, needsOnboarding };
    } catch (err) {
      console.error('Login error:', err);
      return { ok: false, reason: 'connection-error' };
    }
  };

  // Preserve ?next= when bouncing login → register so the invite context
  // survives the toggle.
  const nextSuffix = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('next')
    ? `?next=${encodeURIComponent(new URLSearchParams(window.location.search).get('next')!)}`
    : '';

  return (
    <LoginScreen
      onLogin={handleLogin}
      initialError={initialError}
      onForgotPasswordPress={() => router.push('/auth/forgot-password')}
      onRegisterPress={() => router.push(`/auth/register${nextSuffix}`)}
      oauthSlot={<OAuthButtons />}
    />
  );
}
