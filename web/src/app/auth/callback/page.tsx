'use client';

import { useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';

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
        // Exchange code for session — stores in localStorage via our createClient
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError || !data.session) {
          window.location.href = '/auth/login?error=verification_failed';
          return;
        }

        // Google Contacts link flow: the user just granted the contacts scope.
        // session.provider_refresh_token is populated for THIS request only —
        // forward it to our API which stores it for future People API calls.
        const googleLink = params.get('google_link') === '1';
        if (googleLink) {
          const sessionAny = data.session as { access_token: string; provider_refresh_token?: string };
          const refreshToken = sessionAny.provider_refresh_token;
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
          if (refreshToken && apiBaseUrl) {
            try {
              await fetch(`${apiBaseUrl}/api/v1/google-sync/connect`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessionAny.access_token}`,
                },
                body: JSON.stringify({
                  refresh_token: refreshToken,
                  scopes: [
                    'openid', 'email', 'profile',
                    'https://www.googleapis.com/auth/contacts',
                  ],
                }),
              });
            } catch {
              // Surfaced in ajustes via /status — don't block the redirect.
            }
          }
          window.location.href = '/dashboard/ajustes?google_synced=1';
          return;
        }

        // Check if user has a business already
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', data.session.user.id)
          .limit(1);

        if (!businesses || businesses.length === 0) {
          window.location.href = '/onboarding';
        } else {
          window.location.href = '/dashboard';
        }
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
