import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NativeModules, Platform } from 'react-native';
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
import { createSupabaseClient } from '@/lib/supabase';
import { syncUserLocale } from '@amixos/shared/lib/userLocale';

// Re-export the shared hook so screens can `import { useLang } from '@/lib/i18n/LangProvider'`.
export { useLang } from '@amixos/shared';

// Read the device's preferred locale without pulling in expo-localization
// (avoids a native rebuild). Falls back to DEFAULT_LOCALE if the platform
// doesn't expose anything usable.
/**
 * The phone's language, used ONLY to seed the very first launch.
 *
 * Two sources, because the first one can come back empty. SettingsManager and
 * I18nManager are legacy bridge modules; when they are unavailable this
 * returned '' and fell through to DEFAULT_LOCALE — which is 'es'. A silent
 * failure therefore looked exactly like a deliberate Spanish default, on an
 * English phone, with nothing to indicate which had happened.
 *
 * Intl is the fallback: Hermes ships it, it needs no native module and no
 * dependency, and it reports the same locale the OS gives the app.
 */
function getDeviceLocale(): Locale {
  let raw = '';
  if (Platform.OS === 'ios') {
    const settings = NativeModules.SettingsManager?.settings;
    raw = settings?.AppleLocale || settings?.AppleLanguages?.[0] || '';
  } else {
    raw = NativeModules.I18nManager?.localeIdentifier || '';
  }

  if (!raw) {
    try {
      raw = Intl.DateTimeFormat().resolvedOptions().locale || '';
    } catch {
      raw = '';
    }
  }

  const code = String(raw).toLowerCase().split(/[_-]/)[0];
  return isLocale(code) ? (code as Locale) : DEFAULT_LOCALE;
}

interface LangProviderProps {
  children: ReactNode;
}

// Mobile equivalent of web's LangProvider. Persists via AsyncStorage instead
// of cookies. Renders nothing until the stored locale is read so the user
// never sees a flash of the wrong language on app launch.
export function LangProvider({ children }: LangProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);
  // No stored choice ⇒ the locale tracks the device. Surfaced so the settings
  // picker can show "Automatic" as the ACTIVE option rather than guessing.
  const [followingDevice, setFollowingDevice] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY).then(stored => {
      if (isLocale(stored)) {
        setLocaleState(stored);
        setFollowingDevice(false);
      } else {
        // First launch: seed from device locale so users see their language.
        setLocaleState(getDeviceLocale());
      }
      setHydrated(true);
    }).catch(() => {
      setLocaleState(getDeviceLocale());
      setHydrated(true);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setFollowingDevice(false);
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => {
      // Persistence failure isn't fatal — choice persists for the session.
    });
    // Also persist to the profile so Supabase renders auth emails in the
    // language just chosen. This is what lets an existing OAuth user, who
    // never had a locale recorded, fix their emails by switching in Ajustes.
    void syncUserLocale(createSupabaseClient(), next);
  }, []);

  /** Drop the explicit choice so the app tracks the phone again. Without this
   *  the picker is a one-way door: once a language is stored it wins on every
   *  later launch and changing the phone's language does nothing. */
  const followDevice = useCallback(() => {
    const device = getDeviceLocale();
    setLocaleState(device);
    setFollowingDevice(true);
    AsyncStorage.removeItem(LOCALE_STORAGE_KEY).catch(() => {});
    // Keep the profile in step so auth emails follow the same language.
    void syncUserLocale(createSupabaseClient(), device);
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
    followingDevice,
    followDevice,
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
