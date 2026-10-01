import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { isAssistantEnabled } from '@amixos/shared/assistant/config';
import { useLang } from '@/lib/i18n/LangProvider';
import { useAssistant } from './useAssistant';
import { AssistantFab } from './AssistantFab';
import { AssistantSheet } from './AssistantSheet';
import { AiConsentSheet } from './AiConsentSheet';
import { useAiConsent } from '@amixos/shared/lib/aiConsent';
import { createSupabaseClient } from '@/lib/supabase';

// Entry point for Ami — mounted once in dashboard/_layout so it floats over
// every screen. Owns the open flag AND the chat state (useAssistant lives
// here, not in the sheet, so the transcript survives close/reopen).
export function AssistantWidget() {
  const { business, impersonating } = useApp();
  const { t: full } = useLang();
  const [open, setOpen] = useState(false);
  const assistant = useAssistant(business?.id ?? null);
  // App Store 5.1.2(i): explicit permission before Ami shares data with
  // third-party AI. Asked on first open; withdrawable in Ajustes → Cuenta.
  const consent = useAiConsent(createSupabaseClient());
  const [askConsent, setAskConsent] = useState(false);
  const openAmi = () => {
    if (consent.granted) setOpen(true);
    else setAskConsent(true);
  };

  // Hidden while "Ver como" is active — Ami acts with the OWNER's powers,
  // which would leak past the impersonated member's permissions. Pilot gate:
  // only enabled businesses see Ami (api enforces the same list).
  if (!business || impersonating || !isAssistantEnabled(business.id)) return null;
  // Turned off in Ajustes → Cuenta: no button at all (the toggle brings it back).
  if (consent.state === 'off' && !open) return null;

  return (
    <>
      {!open && <AssistantFab onPress={openAmi} label={full.dashboard.assistant.title} />}
      <AiConsentSheet
        open={askConsent}
        onClose={() => setAskConsent(false)}
        onAllow={async () => {
          const ok = await consent.set(true);
          if (ok) {
            setAskConsent(false);
            // iOS won't present the Ami sheet while this one is animating out.
            setTimeout(() => setOpen(true), 350);
          }
          return ok;
        }}
      />
      {open && <AssistantSheet assistant={assistant} businessId={business.id} onClose={() => setOpen(false)} />}
    </>
  );
}
