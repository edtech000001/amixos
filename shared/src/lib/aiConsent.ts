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
// Bump AI_CONSENT_VERSION when what Ami shares (or with whom) changes: everyone
// is asked again.

import { useCallback, useEffect, useState } from 'react';

export const AI_CONSENT_VERSION = '2026-09-30';

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

/** True when this metadata holds consent to the CURRENT disclosure. */
export function hasAiConsent(meta: Record<string, unknown> | null | undefined): boolean {
  const c = meta?.ai_consent as Partial<AiConsentRecord> | null | undefined;
  return !!c && typeof c === 'object' && c.v === AI_CONSENT_VERSION;
}

/** Grant (records version + time) or withdraw consent. Existing metadata is
 *  spread so no other key (locale, names…) is lost. */
export async function setAiConsent(supabase: AuthClient, granted: boolean): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const meta = data.session?.user.user_metadata ?? {};
  const { error } = await supabase.auth.updateUser({
    data: {
      ...meta,
      ai_consent: granted ? ({ v: AI_CONSENT_VERSION, at: new Date().toISOString() } satisfies AiConsentRecord) : null,
    },
  });
  return !error;
}

/** Read + change the signed-in user's Ami consent. `granted` is null while
 *  the session is still loading. */
export function useAiConsent(supabase: AuthClient) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setGranted(hasAiConsent(data.session?.user.user_metadata));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const set = useCallback(async (next: boolean) => {
    const ok = await setAiConsent(supabase, next);
    if (ok) setGranted(next);
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { granted, set, refresh };
}
