// Blocks the app until the signed-in user has accepted the current terms and
// privacy policy (migration 239). Mirrors web/src/components/PolicyConsentGate.tsx.
//
// Self-contained on purpose — it reads its own session rather than depending
// on AppContext, so it can cover onboarding as well as the dashboard.

import { useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth/store';
import { PolicyConsentScreen } from '@amixos/shared/screens/legal/PolicyConsentScreen';
import { fetchAcceptedVersions, recordAcceptance } from '@amixos/shared/lib/policyConsent';
import { needsConsent } from '@amixos/shared/legal/versions';

export function PolicyConsentGate() {
  const logout = useAuthStore(s => s.logout);
  const [show, setShow] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const supabase = createSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const accepted = await fetchAcceptedVersions(supabase, session.user.id);
        if (cancelled) return;

        setUserId(session.user.id);
        setIsUpdate(Object.keys(accepted).length > 0);
        setShow(needsConsent(accepted));
      } catch {
        // Never block on a failed check — see the web gate's note.
      }
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  if (!show || !userId) return null;

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, elevation: 10000 }}
    >
      <PolicyConsentScreen
        isUpdate={isUpdate}
        onAccept={async (scrolledToEnd) => {
          await recordAcceptance(createSupabaseClient(), userId, {
            method: isUpdate ? 'update_prompt' : 'consent_screen',
            scrolledToEnd,
            platform: Platform.OS === 'android' ? 'android' : 'ios',
          });
          setShow(false);
        }}
        onSignOut={() => { void logout(); }}
      />
    </View>
  );
}
