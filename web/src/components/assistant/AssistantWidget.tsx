'use client';

import { useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { isAssistantEnabled } from '@amixos/shared/assistant/config';
import { AssistantFab } from './AssistantFab';
import { AssistantPanel } from './AssistantPanel';

/**
 * "Ami" AI assistant entry point for the web dashboard. Hidden while
 * impersonating ("Ver como" is view-only — assistant writes would be
 * rejected anyway) and until a business is loaded.
 */
export default function AssistantWidget() {
  const { business, impersonating } = useApp();
  const [open, setOpen] = useState(false);

  // Pilot gate: only enabled businesses see Ami (api enforces the same list).
  if (!business || impersonating || !isAssistantEnabled(business.id)) return null;

  return (
    <>
      {!open && <AssistantFab onClick={() => setOpen(true)} />}
      <AssistantPanel open={open} onClose={() => setOpen(false)} businessId={business.id} />
    </>
  );
}
