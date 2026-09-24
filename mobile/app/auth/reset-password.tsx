import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { createSupabaseClient } from '@/lib/supabase';
import {
  ResetPasswordScreen,
  type ResetLinkState,
  type ResetAttemptResult,
} from '@amixos/shared/screens/auth/ResetPasswordScreen';
import { classifyPasswordError } from '@amixos/shared/lib/passwordErrors';

// Deep-link landing for the password-reset email (amixos://auth/reset-password).
//
// The mobile Supabase client runs with detectSessionInUrl: false — correct for
// an app, since there is no browser URL to watch — so nothing establishes the
// recovery session automatically. This route parses the link itself.
//
// Native uses the implicit flow, so the tokens arrive in the URL FRAGMENT:
//   amixos://auth/reset-password#access_token=…&refresh_token=…&type=recovery
// expo-linking's parse() only reads the query string, so the fragment is
// pulled apart by hand below. token_hash is also accepted in case the email
// template is switched to the newer helper.
export default function ResetPasswordRoute() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<ResetLinkState>('verifying');

  useEffect(() => {
    let cancelled = false;

    const establish = async () => {
      const supabase = createSupabaseClient();
      const url = await Linking.getInitialURL();

      const readParams = (raw: string | null) => {
        const out = new Map<string, string>();
        if (!raw) return out;
        // Everything after the first '#' or '?', whichever comes first.
        const idx = Math.min(
          ...[raw.indexOf('#'), raw.indexOf('?')].filter(i => i >= 0).concat([raw.length]),
        );
        for (const pair of raw.slice(idx + 1).split(/[&#?]/)) {
          const [k, v] = pair.split('=');
          if (k && v) out.set(decodeURIComponent(k), decodeURIComponent(v));
        }
        return out;
      };

      const p = readParams(url);
      if (cancelled) return;

      if (p.get('error') || p.get('error_code')) { setLinkState('invalid'); return; }

      const accessToken = p.get('access_token');
      const refreshToken = p.get('refresh_token');
      const tokenHash = p.get('token_hash');

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) { if (!cancelled) setLinkState('invalid'); return; }
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (error) { if (!cancelled) setLinkState('invalid'); return; }
        } else {
          // Cold start can deliver the route before the URL; fall back to any
          // session the client already holds.
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) { if (!cancelled) setLinkState('invalid'); return; }
        }
      } catch {
        if (!cancelled) setLinkState('invalid');
        return;
      }

      if (!cancelled) setLinkState('ready');
    };

    establish();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (password: string): Promise<ResetAttemptResult> => {
    const supabase = createSupabaseClient();
    // No current_password: someone resetting a FORGOTTEN password cannot
    // supply it, so GoTrue is expected to exempt the recovery session. See the
    // longer note in web/src/app/auth/reset-password/page.tsx — this is the
    // one assumption in the flow not verified against the running server.
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      await supabase.auth.signOut();
      return { ok: true };
    }
    switch (classifyPasswordError(error)) {
      case 'pwned':      return { ok: false, reason: 'leaked-password' };
      case 'characters':
      case 'length':     return { ok: false, reason: 'weak-password' };
      case 'same':       return { ok: false, reason: 'same-password' };
      default:
        return { ok: false, reason: error.status === 401 || error.status === 403 ? 'expired' : 'generic' };
    }
  };

  return (
    <ResetPasswordScreen
      linkState={linkState}
      onSubmit={handleSubmit}
      onGoToLogin={() => router.replace('/auth/login')}
      onRequestNewLink={() => router.replace('/auth/forgot-password')}
    />
  );
}
