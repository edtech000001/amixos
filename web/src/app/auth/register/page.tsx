'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { RegisterScreen, type RegisterAttemptResult } from '@amixos/shared/screens/auth/RegisterScreen';
import { classifyPasswordError } from '@amixos/shared/lib/passwordErrors';

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
      // The project rejects breached and low-complexity passwords server-side
      // and explains why in English; classify so the screen can say it in the
      // user's language.
      const issue = classifyPasswordError(error);
      if (issue === 'pwned') return { ok: false, reason: 'leaked-password' };
      if (issue === 'characters' || issue === 'length') return { ok: false, reason: 'weak-password' };
      return { ok: false, reason: 'generic' };
    }
    // Honor ?next= (invite links). An invited user is joining a business,
    // not creating one — send them to the invite-accept page instead of
    // onboarding. Falls back to onboarding for normal self-serve signups.
    const np = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next')
      : null;
    // Same-origin only: reject protocol-relative ("//evil.com") to avoid an
    // open-redirect (it also starts with "/").
    const safeNext = np && np.startsWith('/') && !np.startsWith('//') ? np : null;
    window.location.href = safeNext ?? '/onboarding';
    return { ok: true };
  };

  // Preserve ?next= when bouncing register → login so the invite context
  // survives the toggle.
  const nextSuffix = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('next')
    ? `?next=${encodeURIComponent(new URLSearchParams(window.location.search).get('next')!)}`
    : '';

  return (
    <RegisterScreen
      onRegister={handleRegister}
      onLoginPress={() => router.push(`/auth/login${nextSuffix}`)}
      onTermsPress={() => router.push('/terms')}
      onPrivacyPress={() => router.push('/privacy')}
      oauthSlot={<OAuthButtons mode="register" />}
    />
  );
}
