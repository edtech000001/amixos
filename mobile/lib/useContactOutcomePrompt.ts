// "Confirm outcome after" contact logging for mobile.
//
// fireContact() opens the dialer / SMS / mail app via Linking, then records
// a pending intent. When the user returns to Amixos (AppState → 'active'),
// we ask "¿Lograste contactar?" and, on a non-cancel choice, write one row
// to client_communications with the chosen outcome. Cancelling logs nothing.
//
// Shared by the map card quick actions and the client-detail quick actions
// (incl. per-contact-person rows). See shared/lib/clientCommunications.ts.

import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, type AppStateStatus } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  logClientCommunication,
  type CommType,
  type CommOutcome,
} from '@amixos/shared/lib/clientCommunications';

type PromptLabels = {
  callTitle: string;
  smsTitle: string;
  emailTitle: string;
  connected: string;
  noAnswer: string;
  sent: string;
  dontLog: string;
};

export interface FireContactArgs {
  type: CommType;          // 'call' | 'sms' | 'email' | 'whatsapp'
  target: string;          // tel:/sms:/mailto: URL to open
  contactMethod?: string;  // the raw number / email (audit); defaults to target
  clientId: string;
  clientContactId?: string | null;
}

interface Options {
  supabase: SupabaseClient;
  businessId: string | null | undefined;
  createdBy?: string | null;
  labels: PromptLabels;
  /** Called after a row is written so the caller can refresh its view. */
  onLogged?: () => void;
}

export function useContactOutcomePrompt({
  supabase,
  businessId,
  createdBy,
  labels,
  onLogged,
}: Options) {
  // Pending contact awaiting the user's return. Held in a ref so the
  // AppState listener (registered once) always sees the latest value.
  const pending = useRef<FireContactArgs | null>(null);
  const prevState = useRef<AppStateStatus>(AppState.currentState);

  const writeOutcome = useCallback(
    async (args: FireContactArgs, outcome: CommOutcome) => {
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

  const askOutcome = useCallback(
    (args: FireContactArgs) => {
      if (args.type === 'call') {
        Alert.alert(labels.callTitle, undefined, [
          { text: labels.connected, onPress: () => writeOutcome(args, 'connected') },
          { text: labels.noAnswer, onPress: () => writeOutcome(args, 'no_answer') },
          { text: labels.dontLog, style: 'cancel' },
        ]);
      } else {
        const title = args.type === 'email' ? labels.emailTitle : labels.smsTitle;
        Alert.alert(title, undefined, [
          { text: labels.sent, onPress: () => writeOutcome(args, 'sent') },
          { text: labels.dontLog, style: 'cancel' },
        ]);
      }
    },
    [labels, writeOutcome],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = prevState.current;
      prevState.current = next;
      // Came back to the foreground with a pending contact → prompt once.
      if (next === 'active' && prev !== 'active' && pending.current) {
        const args = pending.current;
        pending.current = null;
        askOutcome(args);
      }
    });
    return () => sub.remove();
  }, [askOutcome]);

  const fireContact = useCallback((args: FireContactArgs) => {
    pending.current = args;
    Linking.openURL(args.target).catch(() => {
      // Couldn't open the handler (e.g. no SIM / no mail app) — drop the
      // pending intent so we don't prompt for a contact that never happened.
      pending.current = null;
    });
  }, []);

  return { fireContact };
}
