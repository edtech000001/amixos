'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  type Locale,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  dictionaries,
  type Dictionary,
} from '@amixos/shared';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

type LangContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: Dictionary;
  locales: readonly Locale[];
  labels: Record<Locale, string>;
};

const LangContext = createContext<LangContextValue | null>(null);

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

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang must be used inside <LangProvider>');
  }
  return ctx;
}
