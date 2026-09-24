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

  // useURL(), not getInitialURL(): the latter only reports a link that COLD
  // STARTED the app. Tapping the email link while Amixos is already running in
  // the background delivers it as a url event instead, and that path would
  // otherwise arrive here with nothing to parse.
  const url = Linking.useURL();

  useEffect(() => {
    let cancelled = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const establish = async () => {
      const supabase = createSupabaseClient();

      const readParams = (raw: string | null) => {
        const out = new Map<string, string>();
        if (!raw) return out;
        // Everything after the first '#' or '?', whichever comes first.
        const marks = [raw.indexOf('#'), raw.indexOf('?')].filter(i => i >= 0);
        if (!marks.length) return out;
        for (const pair of raw.slice(Math.min(...marks) + 1).split(/[&#?]/)) {
          const [k, v] = pair.split('=');
          if (k && v) out.set(decodeURIComponent(k), decodeURIComponent(v));
        }
        return out;
      };

      // useURL() reports null on the first render and fills in once the link
      // is delivered, so "no URL" is not yet "bad URL". Stay on the verifying
      // state and let the effect re-run — unless a session is already in hand,
      // or the grace period below decides nothing is coming.
      if (!url) {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) { setLinkState('ready'); return; }
        // Nothing arrived and nothing is stored. Give the link a moment, then
        // stop spinning — an indefinite spinner is worse than a wrong verdict
        // the user can act on.
        graceTimer = setTimeout(() => {
          if (!cancelled) setLinkState('invalid');
        }, 4000);
        return;
      }

      const p = readParams(url);
      if (p.get('error') || p.get('error_code')) {
        if (!cancelled) setLinkState('invalid');
        return;
      }

      const accessToken = p.get('access_token');
      const refreshToken = p.get('refresh_token');
      const tokenHash = p.get('token_hash');

      // Best effort, exactly as on web: a failure here is not the verdict,
      // because the session may already have been established another way.
      try {
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else if (tokenHash) {
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        }
      } catch {
        // Fall through to the session check.
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setLinkState(session ? 'ready' : 'invalid');
    };

    establish();
    return () => { cancelled = true; clearTimeout(graceTimer); };
  }, [url]);

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
