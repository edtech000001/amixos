'use client';

import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { Toggle } from '@/components/ui/Toggle';
import { isAssistantEnabled } from '@amixos/shared/assistant/config';
import { useAiConsent } from '@amixos/shared/lib/aiConsent';

/**
 * Ajustes → Cuenta: give or withdraw consent for Ami to share data with
 * third-party AI (App Store 5.1.2(i) requires an easy way to withdraw).
 * Only shown where Ami is available. Mobile twin: AiConsentSection.
 */
export function AiConsentCard() {
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.assistant.consent;
  const consent = useAiConsent(createSupabaseClient());

  if (!business || !isAssistantEnabled(business.id) || consent.granted === null) return null;
  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{t.settingTitle}</h2>
          <p className="text-xs text-faint mt-1">{t.settingHint}</p>
          <p className={`text-xs font-medium mt-2 ${consent.granted ? 'text-emerald-600' : 'text-muted'}`}>
            {consent.state === 'granted' ? t.settingOn : consent.state === 'off' ? t.settingOff : t.settingUnasked}
          </p>
        </div>
        <Toggle checked={consent.granted} onChange={next => void consent.set(next)} aria-label={t.settingTitle} />
      </div>
    </div>
  );
}
