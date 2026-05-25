'use client';

import { useEffect, useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';

/**
 * Direct Google OAuth callback. Reached from Google's authorization screen
 * with ?code=...&state=... The flow:
 *
 *   1. Read code + state from URL.
 *   2. Verify state matches what we stashed in sessionStorage before
 *      starting (CSRF protection — required by OAuth spec).
 *   3. Decode state to recover the business_id this connection is for.
 *   4. POST { business_id, code, redirect_uri } to
 *      /api/v1/google-sync/exchange-code, which does the actual code → token
 *      swap server-side (since our Web OAuth client has a secret).
 *   5. Redirect to /dashboard/ajustes?google_synced=1 — the existing
 *      detector there refreshes status and shows the backfill prompt.
 *
 * This bypasses Supabase's linkIdentity flow entirely, so the
 * "no_refresh_token on reconnect" bug Supabase had doesn't apply.
 */
export default function GoogleCallbackPage() {
  const { t } = useLang();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void handleCallback();
  }, []);

  const handleCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const stateParam = params.get('state');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Google: ${errorParam}`);
      return;
    }
    if (!code || !stateParam) {
      setError('Missing code or state');
      return;
    }

    // Verify state nonce + extract business_id.
    const storedState = sessionStorage.getItem('amixos-google-oauth-state');
    sessionStorage.removeItem('amixos-google-oauth-state');
    let businessId: string | null = null;
    try {
      const parsed = JSON.parse(atob(stateParam)) as { nonce: string; business_id: string };
      if (storedState !== parsed.nonce) {
        setError('State mismatch (possible CSRF)');
        return;
      }
      businessId = parsed.business_id;
    } catch {
      setError('Invalid state');
      return;
    }

    if (!businessId) {
      setError('Missing business in state');
      return;
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    if (!apiBaseUrl) {
      setError('NEXT_PUBLIC_API_URL not configured');
      return;
    }

    const supabase = createSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? '';
    if (!jwt) {
      window.location.href = '/auth/login';
      return;
    }

    const redirectUri = `${window.location.origin}/auth/google-callback`;
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/exchange-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          business_id: businessId,
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? `HTTP ${res.status}`);
        return;
      }
    } catch (e) {
      setError(`Network: ${e}`);
      return;
    }

    // Done — bounce to Conexiones with the success param so the existing
    // listener there picks it up and offers backfill.
    window.location.href = '/dashboard/ajustes?google_synced=1';
  };

  if (error) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-md text-center">
          <p className="text-sm font-semibold text-red-600 mb-2">
            {t.dashboard.settings.google.connectError}
          </p>
          <p className="text-xs text-gray-500 mb-4">{error}</p>
          <a
            href="/dashboard/ajustes"
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t.common.buttons.back}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500">{t.auth.callback.verifying}</p>
      </div>
    </div>
  );
}
