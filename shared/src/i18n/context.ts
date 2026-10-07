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
  /** True when no explicit choice is stored, so the locale tracks the device.
   *  Optional: only platforms with a meaningful "device language" supply it
   *  (mobile). Undefined on web, where the picker simply omits the option. */
  followingDevice?: boolean;
  /** Forget the explicit choice and go back to tracking the device language.
   *  Without this, picking a language once pins it forever — changing the
   *  phone's language would no longer affect the app. */
  followDevice?: () => void;
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
  followingDevice: false,
  followDevice: undefined,
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
