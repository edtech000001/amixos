'use client';

import { createContext, useContext } from 'react';
import { dictionaries, type Dictionary } from './dict';
import { LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type Locale } from './locales';

// Shared React Context — lives here so universal screens can call useLang()
// regardless of which platform's Provider is mounted.
//
// Each platform supplies its own Provider implementation:
//   - web: cookies + document.documentElement.lang (web/src/i18n/LangProvider)
//   - mobile: AsyncStorage (mobile/lib/i18n/LangProvider)
// Both populate the same context so consumers (shared screens) see the same
// useLang() return shape on both platforms.

export type LangContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: Dictionary;
  locales: readonly Locale[];
  labels: Record<Locale, string>;
};

// Default value: the dictionary for DEFAULT_LOCALE, no-op setters. This lets
// universal components render outside of a Provider (e.g. for Storybook or
// testing) without crashing — they just won't react to locale changes.
const defaultValue: LangContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  toggleLocale: () => {},
  t: dictionaries[DEFAULT_LOCALE],
  locales: LOCALES,
  labels: LOCALE_LABELS,
};

export const LangContext = createContext<LangContextValue>(defaultValue);

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** Tooltip vocabulary for icon-only buttons.
 *
 *  Most screens narrow `t` to their own dict slice (`t.dashboard.files`), which
 *  puts `t.common.tips` out of reach without also keeping the full dictionary
 *  around. This is the shortcut: `const tip = useTips()` → `tip.edit`. */
export function useTips() {
  return useContext(LangContext).t.common.tips;
}
