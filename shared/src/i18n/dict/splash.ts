import { Locale } from '../locales';

export type SplashDict = {
  tagline: string;
  hook: string;
  features: { key: string; title: string }[];
  login: string;
  register: string;
};

export const splash: Record<Locale, SplashDict> = {
  es: {
    tagline: 'Tu negocio en una sola app.',
    hook: 'Menos papel. Menos Excel. Más tiempo para crecer.',
    features: [
      { key: 'clients', title: 'Clientes' },
      { key: 'invoices', title: 'Facturas' },
      { key: 'employees', title: 'Empleados' },
      { key: 'reports', title: 'Reportes' },
    ],
    login: 'Iniciar sesión',
    register: 'Crear cuenta',
  },
  en: {
    tagline: 'Your business in one app.',
    hook: 'Less paper. Less Excel. More time to grow.',
    features: [
      { key: 'clients', title: 'Clients' },
      { key: 'invoices', title: 'Invoices' },
      { key: 'employees', title: 'Employees' },
      { key: 'reports', title: 'Reports' },
    ],
    login: 'Log in',
    register: 'Create account',
  },
};
