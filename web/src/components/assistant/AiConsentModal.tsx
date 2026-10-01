'use client';

import { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';

/**
 * Explicit permission before Ami shares anything with third-party AI
 * (App Store 5.1.2(i) — kept identical on web). Shown the first time someone
 * opens Ami; nothing is sent until they click Allow. Withdrawable in
 * Ajustes → Cuenta. Mobile twin: AiConsentSheet.
 */
export function AiConsentModal({
  open,
  onAllow,
  onClose,
}: {
  open: boolean;
  onAllow: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant.consent;
  const [saving, setSaving] = useState(false);

  const allow = async () => {
    setSaving(true);
    await onAllow();
    setSaving(false);
  };

  const point = (text: string) => (
    <li className="flex gap-2.5 text-sm text-ink">
      <Check size={15} className="text-primary shrink-0 mt-0.5" />
      <span>{text}</span>
    </li>
  );

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title={t.title} size="md">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-primary" />
          </div>
          <p className="text-sm text-muted">{t.intro}</p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {point(t.sends)}
          {point(t.providers)}
          {point(t.notTraining)}
        </ul>
        <p className="text-xs text-faint">{t.changeLater}</p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted hover:bg-border-soft disabled:opacity-50">
            {t.decline}
          </button>
          <button type="button" onClick={() => void allow()} disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {saving ? '…' : t.allow}
          </button>
        </div>
      </div>
    </Modal>
  );
}
