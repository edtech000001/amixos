'use client';

import { useCallback, useState, type ReactNode } from 'react';
import {
  type Locale,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  dictionaries,
  LangContext,
  type LangContextValue,
} from '@amixos/shared';

// Re-export the shared hook so existing imports `from '@/i18n/LangProvider'` work.
export { useLang } from '@amixos/shared';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

interface LangProviderProps {
  initialLocale: Locale;
  children: ReactNode;
}

export function LangProvider({ initialLocale, children }: LangProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') {
      document.cookie = `${LOCALE_STORAGE_KEY}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
      document.documentElement.lang = next;
    }
  }, []);

  const toggleLocale = useCallback(() => {
    const idx = LOCALES.indexOf(locale);
    const nextIdx = (idx + 1) % LOCALES.length;
    setLocale(LOCALES[nextIdx]);
  }, [locale, setLocale]);

  const value: LangContextValue = {
    locale,
    setLocale,
    toggleLocale,
    t: dictionaries[locale],
    locales: LOCALES,
    labels: LOCALE_LABELS,
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
