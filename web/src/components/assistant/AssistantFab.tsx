'use client';

import { Sparkles } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';

/** Floating launcher for the Ami panel. z-40: above banners (z-30), below the panel (z-50). */
export function AssistantFab({ onClick }: { onClick: () => void }) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.title}
      title={t.title}
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-opacity hover:opacity-90"
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}
