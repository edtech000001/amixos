// Shared i18n: locale registry + typed dictionaries.
// Platform-agnostic — web wraps this in a Context provider with cookie persistence;
// mobile should wrap it with AsyncStorage / SecureStore persistence.

export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  isLocale,
} from './locales';
export type { Locale } from './locales';

export { dictionaries, getDictionary } from './dict';
export type { Dictionary } from './dict';

export { LangContext, useLang } from './context';
export type { LangContextValue } from './context';

export type { LandingDict } from './dict/landing';
export type { AuthDict } from './dict/auth';
export type { OnboardingDict } from './dict/onboarding';
export type { CommonDict } from './dict/common';
export type { DashboardDict } from './dict/dashboard';
export type { ProposalDict } from './dict/proposal';
