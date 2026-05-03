import { Locale } from '../locales';

export type SplashSlide = {
  key: 'welcome' | 'clients' | 'invoices' | 'employees' | 'reports' | 'more';
  title: string;
  subtitle: string;
};

export type SplashDict = {
  slides: SplashSlide[];
  login: string;
  register: string;
};

export const splash: Record<Locale, SplashDict> = {
  es: {
    slides: [
      {
        key: 'welcome',
        title: 'Tu negocio en una sola app.',
        subtitle: 'Menos papel. Menos Excel. Más tiempo para crecer.',
      },
      {
        key: 'clients',
        title: 'Tu CRM en el bolsillo',
        subtitle:
          'Contactos, historial y notas — toda tu base de clientes organizada y siempre lista.',
      },
      {
        key: 'invoices',
        title: 'Cobra más rápido',
        subtitle:
          'Crea y envía facturas profesionales en segundos. Rastrea pagos sin perderte ni uno.',
      },
      {
        key: 'employees',
        title: 'Coordina a tu equipo',
        subtitle:
          'Horas, asistencia y asignaciones. Manda a tu gente a los trabajos correctos sin tantas llamadas.',
      },
      {
        key: 'reports',
        title: 'Mira tu negocio crecer',
        subtitle:
          'Reportes claros de ingresos, clientes y trabajos. Sabe exactamente dónde estás cada mes.',
      },
      {
        key: 'more',
        title: 'Y mucho más',
        subtitle:
          'Calendario, inventario, propuestas y más herramientas — todas diseñadas para tu negocio.',
      },
    ],
    login: 'Iniciar sesión',
    register: 'Crear cuenta',
  },
  en: {
    slides: [
      {
        key: 'welcome',
        title: 'Your business in one app.',
        subtitle: 'Less paper. Less Excel. More time to grow.',
      },
      {
        key: 'clients',
        title: 'Your CRM in your pocket',
        subtitle:
          'Contacts, history, and notes — your whole client base organized and always ready.',
      },
      {
        key: 'invoices',
        title: 'Get paid faster',
        subtitle:
          'Create and send professional invoices in seconds. Track payments without missing a beat.',
      },
      {
        key: 'employees',
        title: 'Run your team',
        subtitle:
          'Hours, attendance, and assignments. Get crews to the right jobs without endless calls.',
      },
      {
        key: 'reports',
        title: 'Watch your business grow',
        subtitle:
          'Clear reports on income, clients, and jobs. Know exactly where you stand every month.',
      },
      {
        key: 'more',
        title: 'And so much more',
        subtitle:
          'Calendar, inventory, proposals, and more tools — all built for the way you actually work.',
      },
    ],
    login: 'Log in',
    register: 'Create account',
  },
};
