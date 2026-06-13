'use client';

import { useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { userNeedsOnboarding } from '@/lib/onboardingGate';

export default function AuthCallbackPage() {
  const { t } = useLang();
  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        window.location.href = `/auth/login?error=${encodeURIComponent(error)}`;
        return;
      }

      if (code) {
        // Exchange code for session (PKCE) — needs the code_verifier cookie
        // written when signInWithOAuth started. If the user lands on a
        // DIFFERENT domain than the one they started on (www vs apex,
        // vercel.app preview vs prod), that cookie is missing and the
        // exchange fails.
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError || !data.session) {
          // The code may already have been exchanged (double navigation /
          // remount) — if a session exists anyway, just continue.
          const { data: { session: existing } } = await supabase.auth.getSession();
          if (existing) {
            const needsOnboarding = await userNeedsOnboarding(supabase, existing.user.id);
            window.location.href = needsOnboarding ? '/onboarding' : '/dashboard';
            return;
          }
          console.error('OAuth code exchange failed', exchangeError);
          // Carry the real reason so the failure is diagnosable from the URL.
          const detail = encodeURIComponent(exchangeError?.message ?? 'no_session');
          window.location.href = `/auth/login?error=verification_failed&detail=${detail}`;
          return;
        }

        // Note: the Google Contacts link flow used to be handled here via
        // ?google_link=1. It now goes through /auth/google-callback (direct
        // OAuth, see web/src/app/auth/google-callback/page.tsx) — this
        // callback is purely for Supabase sign-in / sign-up.

        // Send members (owners + invited team) to the dashboard; only users
        // who belong to no business at all go through create-business onboarding.
        const needsOnboarding = await userNeedsOnboarding(supabase, data.session.user.id);
        window.location.href = needsOnboarding ? '/onboarding' : '/dashboard';
        return;
      }

      // No code — just check current session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/auth/login';
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <p className="text-sm text-gray-500">{t.auth.callback.verifying}</p>
      </div>
    </div>
  );
}
