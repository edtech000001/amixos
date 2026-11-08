import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { assistantScreenHref } from '@amixos/shared/assistant/screens';
import { useAppHref } from '@/lib/sectionNav';
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
  // Minimized = the call keeps running as a floating pill while the user
  // moves around the app (the sheet stays mounted underneath it).
  const [mini, setMini] = useState(false);
  const callActiveRef = useRef(false);
  const router = useRouter();
  const appHref = useAppHref();
  // Ami asked to open a screen: go there, and get out of the way — shrink to
  // the pill mid-call (keep talking), otherwise close the chat.
  const assistant = useAssistant(business?.id ?? null, (action) => {
    router.push(assistantScreenHref(action, 'native', appHref) as never);
    if (callActiveRef.current) setMini(true);
    else setOpen(false);
  });
  const closeAmi = () => { setMini(false); setOpen(false); };
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
      {open && (
        <AssistantSheet
          assistant={assistant}
          businessId={business.id}
          onClose={closeAmi}
          mini={mini}
          onMinimize={() => setMini(true)}
          onExpand={() => setMini(false)}
          callActiveRef={callActiveRef}
        />
      )}
    </>
  );
}
