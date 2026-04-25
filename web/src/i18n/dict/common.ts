import { Locale } from '../locales';

export type CommonDict = {
  langSwitcher: {
    label: string;
    switchTo: string;
  };
};

export const common: Record<Locale, CommonDict> = {
  es: {
    langSwitcher: {
      label: 'Idioma',
      switchTo: 'Cambiar a',
    },
  },
  en: {
    langSwitcher: {
      label: 'Language',
      switchTo: 'Switch to',
    },
  },
};
