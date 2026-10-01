// Consent to send business data to Ami's AI providers (Anthropic for answers,
// Google Text-to-Speech for the spoken voice). App Store guideline 5.1.2(i):
// apps must disclose sharing personal data with third-party AI and obtain
// EXPLICIT permission first, with a way to withdraw it.
//
// Stored on the user's auth profile (user_metadata.ai_consent), so it follows
// them across phone and web. It's the user's own choice about their own
// data — not an authorization claim — so user-writable metadata is the right
// home. The API refuses Ami requests without it (api/src/routes/assistant.ts).
//
// Three states:
//   'unasked' — never answered (or answered an older disclosure): Ami's
//               button shows and the first tap asks.
//   'granted' — allowed the CURRENT disclosure: Ami opens.
//   'off'     — turned off in Ajustes → Cuenta: Ami's button is hidden.
//               ("Not now" on the first-time prompt does NOT do this.)
//
// Bump AI_CONSENT_VERSION when what Ami shares (or with whom) changes: everyone
// who allowed it is asked again. Keep the api mirror in sync.

import { useEffect, useState } from 'react';

export const AI_CONSENT_VERSION = '2026-09-30';

export type AiConsentState = 'unasked' | 'granted' | 'off';

export interface AiConsentRecord {
  v: string;
  at: string;
}

type AuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: { user: { user_metadata?: Record<string, unknown> } } | null } }>;
    updateUser: (attrs: { data: Record<string, unknown> }) => Promise<{ error: unknown }>;
  };
};

/** Read the consent state out of auth user metadata. */
export function aiConsentState(meta: Record<string, unknown> | null | undefined): AiConsentState {
  const c = meta?.ai_consent as Partial<AiConsentRecord> | false | null | undefined;
  if (c === false) return 'off';
  if (c && typeof c === 'object' && c.v === AI_CONSENT_VERSION) return 'granted';
  return 'unasked';
}

/** True when this metadata holds consent to the CURRENT disclosure. */
export function hasAiConsent(meta: Record<string, unknown> | null | undefined): boolean {
  return aiConsentState(meta) === 'granted';
}

// One shared value for the whole app, so the Ajustes toggle and Ami's
// floating button change together (each used to keep its own copy, so
// turning Ami off left the button up until a restart).
let current: AiConsentState | null = null;
const listeners = new Set<(s: AiConsentState | null) => void>();
function publish(next: AiConsentState | null) {
  current = next;
  listeners.forEach(l => l(next));
}

/** Allow (records version + time) or turn Ami off. Existing metadata is
 *  spread so no other key (locale, names…) is lost. */
export async function setAiConsent(supabase: AuthClient, granted: boolean): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const meta = data.session?.user.user_metadata ?? {};
  const { error } = await supabase.auth.updateUser({
    data: {
      ...meta,
      ai_consent: granted ? ({ v: AI_CONSENT_VERSION, at: new Date().toISOString() } satisfies AiConsentRecord) : false,
    },
  });
  if (!error) publish(granted ? 'granted' : 'off');
  return !error;
}

/** The signed-in user's Ami consent, shared across every caller. `state` is
 *  null until the session has been read. */
export function useAiConsent(supabase: AuthClient) {
  const [state, setState] = useState<AiConsentState | null>(current);
  useEffect(() => {
    listeners.add(setState);
    // Always re-read on mount: the value may have changed on another device,
    // and a different user may have signed in since it was cached.
    void supabase.auth.getSession().then(({ data }) => publish(aiConsentState(data.session?.user.user_metadata)));
    return () => { listeners.delete(setState); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    state,
    /** true / false once known; null while loading. */
    granted: state === null ? null : state === 'granted',
    set: (next: boolean) => setAiConsent(supabase, next),
  };
}
