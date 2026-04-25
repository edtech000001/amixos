import { Locale, LOCALES } from '../locales';
import { landing, LandingDict } from './landing';
import { auth, AuthDict } from './auth';
import { onboarding, OnboardingDict } from './onboarding';
import { common, CommonDict } from './common';

export type Dictionary = {
  landing: LandingDict;
  auth: AuthDict;
  onboarding: OnboardingDict;
  common: CommonDict;
};

export const dictionaries: Record<Locale, Dictionary> = LOCALES.reduce((acc, locale) => {
  acc[locale] = {
    landing: landing[locale],
    auth: auth[locale],
    onboarding: onboarding[locale],
    common: common[locale],
  };
  return acc;
}, {} as Record<Locale, Dictionary>);

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
