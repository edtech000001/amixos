'use client';

import { BotMessageSquare } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';

/** Launcher for the Ami panel, docked to the right edge as a half-tab so it
 *  doesn't cover content (slides fully out on hover). z-40: above banners
 *  (z-30), below the panel (z-50). */
export function AssistantFab({ onClick }: { onClick: () => void }) {
  const { t: full } = useLang();
  const t = full.dashboard.assistant;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.title}
      title={t.title}
      className="fixed bottom-6 right-0 z-40 flex h-12 w-11 items-center justify-center rounded-l-2xl bg-primary/90 pr-1 text-white shadow-lg transition-transform translate-x-1.5 hover:translate-x-0 hover:bg-primary"
    >
      <BotMessageSquare className="h-5 w-5" />
    </button>
  );
}
