// Locale registry. Add a new language by:
//   1. Adding its code to LOCALES below
//   2. Adding a label to LOCALE_LABELS
//   3. Creating dict/<code>.ts and registering it in dict/index.ts
//
// TypeScript will then enforce that all dictionaries cover the same keys.

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

export const LOCALE_COOKIE = 'amixos-lang';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
