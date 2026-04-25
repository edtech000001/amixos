'use client';

import { Globe } from 'lucide-react';
import { useLang } from './LangProvider';

interface LangSwitcherProps {
  variant?: 'inline' | 'compact';
  className?: string;
}

// Compact: shows the *next* locale label (e.g. "English" when current is es).
// Inline: shows "Switch to <name>" / "Cambiar a <name>".
export function LangSwitcher({ variant = 'compact', className = '' }: LangSwitcherProps) {
  const { locale, locales, labels, setLocale, t } = useLang();

  const idx = locales.indexOf(locale);
  const nextLocale = locales[(idx + 1) % locales.length];

  const text =
    variant === 'inline'
      ? `${t.common.langSwitcher.switchTo} ${labels[nextLocale]}`
      : labels[nextLocale];

  return (
    <button
      onClick={() => setLocale(nextLocale)}
      className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${className}`}
      aria-label={`${t.common.langSwitcher.switchTo} ${labels[nextLocale]}`}
    >
      <Globe size={15} />
      {text}
    </button>
  );
}
