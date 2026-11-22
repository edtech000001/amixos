'use client';

// Blocks the app until the signed-in user has accepted the current terms and
// privacy policy (migration 239).
//
// Deliberately SELF-CONTAINED — it reads its own session instead of useApp().
// The gate has to cover /onboarding as well as /dashboard, and onboarding
// deliberately runs outside AppProvider. Depending on that context would have
// left the one screen a brand-new user always sees as the one screen without
// consent.
//
// Who it catches: accounts created before this shipped, invited members (who
// never pass through onboarding), and everyone again after a change marked
// material in shared/legal/versions.ts.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isImpersonating, subscribeImpersonation } from '@amixos/shared/lib/impersonation';
import { createSupabaseClient } from '@/lib/supabase';
import { PolicyConsentScreen } from '@amixos/shared/screens/legal/PolicyConsentScreen';
import { fetchAcceptedVersions, recordAcceptance } from '@amixos/shared/lib/policyConsent';
import { needsConsent } from '@amixos/shared/legal/versions';

export function PolicyConsentGate() {
  const [show, setShow] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Viewing as a member: data requests carry THEIR token while the session
  // is still ours, so the check read the wrong rows and the save was refused
  // by RLS. Consent is personal — never ask (or record) it while viewing as.
  const impersonating = useSyncExternalStore(subscribeImpersonation, isImpersonating, () => false);

  useEffect(() => {
    let cancelled = false;
    if (impersonating) { setShow(false); return; }
    const check = async () => {
      try {
        const supabase = createSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const accepted = await fetchAcceptedVersions(supabase, session.user.id);
        if (cancelled) return;

        setUserId(session.user.id);
        // Anything on record means this is a re-prompt, which reads very
        // differently from a first-time ask.
        setIsUpdate(Object.keys(accepted).length > 0);
        setShow(needsConsent(accepted));
      } catch {
        // Never block on a failed check. A missed prompt is recoverable on the
        // next load; a user locked out of their business by a flaky read is not.
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [impersonating]);

  if (!show || !userId || impersonating) return null;

  return (
    <PolicyConsentScreen
      isUpdate={isUpdate}
      onAccept={async (scrolledToEnd) => {
        // Throws on failure, which keeps the screen up. A consent we failed to
        // record must not look accepted — that is worse than not asking.
        await recordAcceptance(createSupabaseClient(), userId, {
          method: isUpdate ? 'update_prompt' : 'consent_screen',
          scrolledToEnd,
          platform: 'web',
        });
        setShow(false);
      }}
      onSignOut={async () => {
        await createSupabaseClient().auth.signOut();
        window.location.href = '/auth/login';
      }}
    />
  );
}
