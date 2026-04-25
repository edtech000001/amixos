import { Locale, LOCALES } from '../locales';
import { landing, LandingDict } from './landing';
import { auth, AuthDict } from './auth';
import { onboarding, OnboardingDict } from './onboarding';
import { common, CommonDict } from './common';
import { dashboard, DashboardDict } from './dashboard';
import { proposal, ProposalDict } from './proposal';

export type Dictionary = {
  landing: LandingDict;
  auth: AuthDict;
  onboarding: OnboardingDict;
  common: CommonDict;
  dashboard: DashboardDict;
  proposal: ProposalDict;
};

export const dictionaries: Record<Locale, Dictionary> = LOCALES.reduce((acc, locale) => {
  acc[locale] = {
    landing: landing[locale],
    auth: auth[locale],
    onboarding: onboarding[locale],
    common: common[locale],
    dashboard: dashboard[locale],
    proposal: proposal[locale],
  };
  return acc;
}, {} as Record<Locale, Dictionary>);

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
