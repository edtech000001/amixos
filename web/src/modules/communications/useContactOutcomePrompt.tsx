'use client';

// "Confirm outcome after" contact logging for web.
//
// fireContact() opens the user's mail/dialer via the tel:/mailto: scheme,
// then waits for the browser window to regain focus (the user came back
// from their mail client) and shows a small modal asking whether the
// contact went through. On a non-cancel choice we write one row to
// client_communications. Cancelling logs nothing.
//
// On desktop, call/text schemes may not hand off (no dialer) — those flows
// are covered by manual entry in the CommunicationLog. Email (mailto) is the
// reliable web path. Mirrors mobile/lib/useContactOutcomePrompt.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLang } from '@amixos/shared/i18n';
import {
  logClientCommunication,
  type CommType,
  type CommOutcome,
} from '@amixos/shared/lib/clientCommunications';
import { Modal } from '@/components/ui/Modal';

export interface FireContactArgs {
  type: CommType;          // 'call' | 'sms' | 'email' | 'whatsapp'
  target: string;          // tel:/sms:/mailto: URL to open
  contactMethod?: string;  // raw number / email (audit); defaults to target
  clientId: string;
  clientContactId?: string | null;
}

interface Options {
  supabase: SupabaseClient;
  businessId: string | null | undefined;
  createdBy?: string | null;
  onLogged?: () => void;
}

export function useContactOutcomePrompt({
  supabase,
  businessId,
  createdBy,
  onLogged,
}: Options): { fireContact: (args: FireContactArgs) => void; prompt: ReactNode } {
  const { t: full } = useLang();
  const t = full.dashboard.clients.detail.commLog.prompt;

  const pending = useRef<FireContactArgs | null>(null);
  const wasBlurred = useRef(false);
  const [promptArgs, setPromptArgs] = useState<FireContactArgs | null>(null);

  const writeOutcome = useCallback(
    async (args: FireContactArgs, outcome: CommOutcome) => {
      setPromptArgs(null);
      if (!businessId) return;
      await logClientCommunication(supabase, {
        businessId,
        clientId: args.clientId,
        clientContactId: args.clientContactId ?? null,
        type: args.type,
        direction: 'outbound',
        outcome,
        contactMethod: args.contactMethod ?? args.target,
        createdBy,
      });
      onLogged?.();
    },
    [supabase, businessId, createdBy, onLogged],
  );

  // The user left for their mail/dialer (blur) and came back (focus) →
  // surface the outcome prompt. Requiring a prior blur avoids prompting on
  // the spurious focus that can fire right after the click.
  useEffect(() => {
    const onBlur = () => { if (pending.current) wasBlurred.current = true; };
    const onFocus = () => {
      if (pending.current && wasBlurred.current) {
        const args = pending.current;
        pending.current = null;
        wasBlurred.current = false;
        setPromptArgs(args);
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const fireContact = useCallback((args: FireContactArgs) => {
    pending.current = args;
    wasBlurred.current = false;
    // mailto:/tel: trigger the OS handler without navigating the page away.
    window.location.href = args.target;
  }, []);

  const isCall = promptArgs?.type === 'call';
  const title = !promptArgs
    ? ''
    : isCall
      ? t.callTitle
      : promptArgs.type === 'email'
        ? t.emailTitle
        : t.smsTitle;

  const prompt: ReactNode = (
    <Modal
      open={promptArgs !== null}
      onClose={() => setPromptArgs(null)}
      title={title}
      size="sm"
    >
      {promptArgs ? (
        <div className="flex flex-col gap-2">
          {isCall ? (
            <>
              <button
                onClick={() => writeOutcome(promptArgs, 'connected')}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
              >
                {t.connected}
              </button>
              <button
                onClick={() => writeOutcome(promptArgs, 'no_answer')}
                className="w-full rounded-xl bg-border-soft px-4 py-3 text-sm font-medium text-ink hover:bg-border transition-colors"
              >
                {t.noAnswer}
              </button>
            </>
          ) : (
            <button
              onClick={() => writeOutcome(promptArgs, 'sent')}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
            >
              {t.sent}
            </button>
          )}
          <button
            onClick={() => setPromptArgs(null)}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium text-muted hover:bg-surface transition-colors"
          >
            {t.dontLog}
          </button>
        </div>
      ) : null}
    </Modal>
  );

  return { fireContact, prompt };
}
