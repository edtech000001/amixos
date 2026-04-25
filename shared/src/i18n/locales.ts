// Locale registry. Add a new language by:
//   1. Adding its code to LOCALES below
//   2. Adding a label to LOCALE_LABELS
//   3. Creating dict/<code> entries and registering them in each dict file
//
// TypeScript will then enforce that all dictionaries cover the same keys.

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

// Storage key shared by web (cookie) and mobile (async storage).
export const LOCALE_STORAGE_KEY = 'amixos-lang';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
