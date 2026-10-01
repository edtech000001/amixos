'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { isAssistantEnabled } from '@amixos/shared/assistant/config';
import { useAiConsent } from '@amixos/shared/lib/aiConsent';
import { createSupabaseClient } from '@/lib/supabase';
import { AssistantFab } from './AssistantFab';
import { AssistantPanel } from './AssistantPanel';
import { AiConsentModal } from './AiConsentModal';

/**
 * "Ami" AI assistant entry point for the web dashboard. Hidden while
 * impersonating ("Ver como" is view-only — assistant writes would be
 * rejected anyway) and until a business is loaded.
 */
export default function AssistantWidget() {
  const { business, impersonating } = useApp();
  const [open, setOpen] = useState(false);
  // App Store 5.1.2(i), mirrored on web: explicit permission before Ami
  // shares data with third-party AI. Asked on first open; withdrawable in
  // Ajustes → Cuenta. The API refuses Ami requests without it.
  const consent = useAiConsent(createSupabaseClient());
  const [askConsent, setAskConsent] = useState(false);

  // Pilot gate: only enabled businesses see Ami (api enforces the same list).
  if (!business || impersonating || !isAssistantEnabled(business.id)) return null;
  // Turned off in Ajustes → Cuenta: no button at all (the toggle brings it back).
  if (consent.state === 'off' && !open) return null;

  const openAmi = () => {
    if (consent.granted) setOpen(true);
    else setAskConsent(true);
  };

  return (
    <>
      {!open && <AssistantFab onClick={openAmi} />}
      <AssistantPanel open={open} onClose={() => setOpen(false)} businessId={business.id} />
      <AiConsentModal
        open={askConsent}
        onClose={() => setAskConsent(false)}
        onAllow={async () => {
          const ok = await consent.set(true);
          if (ok) {
            setAskConsent(false);
            setOpen(true);
          }
          return ok;
        }}
      />
    </>
  );
}
