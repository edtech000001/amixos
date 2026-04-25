import { useCallback, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dictionaries,
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  isLocale,
  LangContext,
  type LangContextValue,
  type Locale,
} from '@amixos/shared';

// Re-export the shared hook so screens can `import { useLang } from '@/lib/i18n/LangProvider'`.
export { useLang } from '@amixos/shared';

interface LangProviderProps {
  children: ReactNode;
}

// Mobile equivalent of web's LangProvider. Persists via AsyncStorage instead
// of cookies. Renders nothing until the stored locale is read so the user
// never sees a flash of the wrong language on app launch.
export function LangProvider({ children }: LangProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY).then(stored => {
      if (isLocale(stored)) setLocaleState(stored);
      setHydrated(true);
    }).catch(() => {
      setHydrated(true);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => {
      // Persistence failure isn't fatal — choice persists for the session.
    });
  }, []);

  const toggleLocale = useCallback(() => {
    const idx = LOCALES.indexOf(locale);
    setLocale(LOCALES[(idx + 1) % LOCALES.length]);
  }, [locale, setLocale]);

  if (!hydrated) {
    // Brief blank frame while AsyncStorage loads (~50ms). For a polished
    // launch, wrap in expo-splash-screen.
    return null;
  }

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
