import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { isAssistantEnabled } from '@amixos/shared/assistant/config';
import { useLang } from '@/lib/i18n/LangProvider';
import { useAssistant } from './useAssistant';
import { AssistantFab } from './AssistantFab';
import { AssistantSheet } from './AssistantSheet';

// Entry point for Ami — mounted once in dashboard/_layout so it floats over
// every screen. Owns the open flag AND the chat state (useAssistant lives
// here, not in the sheet, so the transcript survives close/reopen).
export function AssistantWidget() {
  const { business, impersonating } = useApp();
  const { t: full } = useLang();
  const [open, setOpen] = useState(false);
  const assistant = useAssistant(business?.id ?? null);

  // Hidden while "Ver como" is active — Ami acts with the OWNER's powers,
  // which would leak past the impersonated member's permissions. Pilot gate:
  // only enabled businesses see Ami (api enforces the same list).
  if (!business || impersonating || !isAssistantEnabled(business.id)) return null;

  return (
    <>
      {!open && <AssistantFab onPress={() => setOpen(true)} label={full.dashboard.assistant.title} />}
      {open && <AssistantSheet assistant={assistant} businessId={business.id} onClose={() => setOpen(false)} />}
    </>
  );
}
