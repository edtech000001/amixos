'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import {
  ResetPasswordScreen,
  type ResetLinkState,
  type ResetAttemptResult,
} from '@amixos/shared/screens/auth/ResetPasswordScreen';
import { classifyPasswordError } from '@amixos/shared/lib/passwordErrors';

// Landing page for the link in the password-reset email
// (forgot-password/page.tsx sets this as `redirectTo`).
//
// The link can arrive in three shapes and we accept all of them, because which
// one Supabase sends depends on the client's flow type and the email template:
//   • ?code=…                    PKCE — what @supabase/ssr uses today
//   • ?token_hash=…&type=recovery  the newer template helper
//   • #access_token=…&refresh_token=…  implicit, older templates
// Getting this wrong strands the user on a screen that cannot work, with an
// email link they cannot re-use, so breadth is worth more than brevity here.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<ResetLinkState>('verifying');

  useEffect(() => {
    const establish = async () => {
      const supabase = createSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      // Supabase reports a dead or already-used link this way.
      if (params.get('error') || hash.get('error')) { setLinkState('invalid'); return; }

      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      // Every branch below is BEST EFFORT, and a failure is not decisive.
      // createBrowserClient runs with detectSessionInUrl: true (the auth-js
      // default), so the client consumes the ?code= while it initializes —
      // before this effect ever runs. Our own exchange then fails on an
      // already-spent code, which is success wearing an error's clothes.
      // /auth/callback survives the same race only because it re-checks the
      // session; this does the same, and asks the session last, once.
      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (tokenHash) {
          await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      } catch {
        // Fall through — the session check below is the real verdict.
      }

      // The only question that matters: is there a usable session now?
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLinkState('invalid'); return; }

      // Strip the token from the address bar so it is not left in history or
      // leaked through a Referer header on the next navigation.
      window.history.replaceState({}, '', '/auth/reset-password');
      setLinkState('ready');
    };

    establish();
  }, []);

  const handleSubmit = async (password: string): Promise<ResetAttemptResult> => {
    const supabase = createSupabaseClient();
    // No current_password here even though the project requires it for a
    // normal change: someone resetting a FORGOTTEN password by definition
    // cannot supply it, so GoTrue is expected to exempt the recovery session.
    // That exemption is the one assumption in this flow that was not verified
    // against the running server — if a reset ever fails here with a
    // "current password" complaint, the cause is the "Require current password
    // when updating" toggle in Authentication → Sign In / Providers → Email.
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      // The recovery session is a real session — sign out so the next step is
      // a deliberate login with the new password.
      await supabase.auth.signOut();
      return { ok: true };
    }
    switch (classifyPasswordError(error)) {
      case 'pwned':      return { ok: false, reason: 'leaked-password' };
      case 'characters':
      case 'length':     return { ok: false, reason: 'weak-password' };
      case 'same':       return { ok: false, reason: 'same-password' };
      default:
        // 401/403 here means the recovery session expired while the form was
        // open — a retry cannot succeed, so say so plainly.
        return { ok: false, reason: error.status === 401 || error.status === 403 ? 'expired' : 'generic' };
    }
  };

  return (
    <ResetPasswordScreen
      linkState={linkState}
      onSubmit={handleSubmit}
      onGoToLogin={() => router.push('/auth/login')}
      onRequestNewLink={() => router.push('/auth/forgot-password')}
    />
  );
}
