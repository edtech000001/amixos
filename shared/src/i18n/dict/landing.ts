import { Locale } from '../locales';

export const landing: Record<Locale, LandingDict> = {
  es: {
    nav: {
      login: 'Iniciar sesión',
      cta: 'Únete gratis',
      switchLang: 'Switch to English',
    },
    hero: {
      tag: '✨ Ya disponible — 14 días gratis',
      h1_1: 'Tu negocio.',
      h1_2: 'En tu idioma.',
      sub: 'Amixos es el sistema de administración de negocios diseñado para dueños de negocios hispanos en Estados Unidos. Clientes, facturas, empleados e inventario — todo en un solo lugar, en español.',
      ctaPrimary: 'Empieza gratis →',
      ctaSecondary: 'Ver planes',
      note: '14 días gratis. Sin tarjeta de crédito.',
    },
    trust: {
      secureData: 'Datos seguros',
      noContracts: 'Sin contratos',
      spanishFirst: '100% en español',
      mobileReady: 'Funciona en móvil',
      support: 'Soporte en tu idioma',
    },
    problem: {
      tag: 'El problema',
      h: '¿Reconoces esto?',
      items: [
        'Apuntas las horas de tus empleados en papel o WhatsApp',
        'Tus facturas las haces en Excel o a mano',
        'Pierdes clientes porque no tienes seguimiento',
        'Los softwares en inglés son confusos y caros',
        'No sabes exactamente cuánto ganaste este mes',
      ],
    },
    solution: {
      tag: 'La solución',
      h: 'Todo lo que necesitas, en uno',
      features: [
        { icon: '👥', title: 'Clientes', desc: 'Organiza todos tus contactos, historial de trabajos y facturas por cliente.' },
        { icon: '📄', title: 'Facturas', desc: 'Crea y envía facturas profesionales en segundos. Rastrea pagos pendientes.' },
        { icon: '👷', title: 'Empleados', desc: 'Registra horas, calcula nómina y maneja tu equipo sin complicaciones.' },
        { icon: '📦', title: 'Inventario', desc: 'Controla tus materiales. Alertas de stock bajo automáticas.' },
        { icon: '📅', title: 'Calendario', desc: 'Agenda trabajos, citas y entregas. Tu equipo siempre al tanto.' },
        { icon: '🌐', title: 'Bilingüe', desc: 'Funciona en español e inglés. Tú decides el idioma de cada sección.' },
      ],
    },
    how: {
      tag: 'Cómo funciona',
      h: 'Listo en minutos, no en horas',
      steps: [
        { n: '1', title: 'Crea tu cuenta', desc: 'Registra tu negocio en 2 minutos. Sin contratos, sin letra chica.' },
        { n: '2', title: 'Importa tus datos', desc: 'Sube tu lista de clientes desde Excel o empieza desde cero.' },
        { n: '3', title: 'Administra todo', desc: 'Facturas, empleados, inventario — desde tu teléfono o computadora.' },
      ],
    },
    story: {
      tag: 'Por qué Amixos',
      h: 'Construido por alguien como tú',
      role: 'Fundador · Ingeniero eléctrico · Contratista',
      p1: 'Soy Edvin, ingeniero eléctrico y dueño de dos empresas de construcción. Manejo más de 40 trabajadores entre Nebraska y Georgia.',
      p2: 'Por años usé Excel, WhatsApp y papel para todo. Los softwares existentes estaban en inglés y costaban una fortuna para lo que ofrecían.',
      p3: 'Construí Amixos para mí primero. Ahora lo estoy abriendo para todos los dueños de negocios hispanos que merecen una herramienta que hable su idioma.',
    },
    pricing: {
      tag: 'Precios',
      h: 'Un plan para cada etapa',
      sub: 'Empieza con 14 días gratis. Sin tarjeta, sin contratos, cancela cuando quieras.',
      perMonth: '/mes',
      monthly: 'Mensual',
      annual: 'Anual',
      annualBadge: '2 meses gratis',
      billedAnnually: 'facturado ${total}/año',
      popular: 'Más popular',
      ctaTrial: 'Empezar gratis',
      ctaContact: 'Contáctanos',
      note: 'Todos los planes incluyen 14 días gratis. Sin tarjeta de crédito.',
    },
    faq: {
      tag: 'Preguntas',
      h: 'Preguntas frecuentes',
      items: [
        { q: '¿Puedo probarlo antes de pagar?', a: 'Sí. 14 días completos con todo incluido, sin tarjeta de crédito. Si no es para ti, no pagas nada.' },
        { q: '¿Necesito saber de computadoras?', a: 'No. Si puedes usar WhatsApp, puedes usar Amixos. Está diseñado para ser simple.' },
        { q: '¿Funciona en el teléfono?', a: 'Sí. La versión web funciona en cualquier teléfono, y la app móvil para iPhone y Android llega muy pronto.' },
        { q: '¿Qué pasa con mis datos?', a: 'Tus datos son tuyos. Puedes exportarlos en cualquier momento. Nunca los vendemos.' },
        { q: '¿Hay contratos?', a: 'No. Mes a mes, cancela cuando quieras. Sin letra chica.' },
      ],
    },
    finalCta: {
      h: '¿Listo para ordenar tu negocio?',
      sub: 'Únete a los dueños de negocios hispanos que ya están transformando cómo administran su operación.',
      cta: 'Crear mi cuenta gratis →',
    },
    footer: {
      tagline: 'Donde negocios prosperan.',
      rights: 'Todos los derechos reservados.',
    },
    mockup: {
      welcome: 'Bienvenido, Edvin',
      monthlyIncome: 'Ingresos este mes',
      clients: 'Clientes',
      invoices: 'Facturas',
      employees: 'Empleados',
      recent: 'Actividad reciente',
      dock: { home: 'Inicio', jobs: 'Trabajos', clients: 'Clientes', invoices: 'Facturas', more: 'Más' },
      paid: 'Pagada',
      sent: 'Enviada',
      draft: 'Borrador',
      newInvoice: 'Nueva factura',
      activeEmployees: 'empleados',
      activeToday: 'activos hoy',
    },
  },
  en: {
    nav: {
      login: 'Log in',
      cta: 'Join free',
      switchLang: 'Cambiar a Español',
    },
    hero: {
      tag: '✨ Now available — 14 days free',
      h1_1: 'Your business.',
      h1_2: 'Your language.',
      sub: 'Amixos is the business management platform built for Hispanic small business owners in the US. Clients, invoices, employees, and inventory — all in one place, bilingual.',
      ctaPrimary: 'Start free →',
      ctaSecondary: 'See plans',
      note: '14 days free. No credit card required.',
    },
    trust: {
      secureData: 'Secure data',
      noContracts: 'No contracts',
      spanishFirst: 'Spanish-first',
      mobileReady: 'Mobile ready',
      support: 'Support in your language',
    },
    problem: {
      tag: 'The problem',
      h: 'Sound familiar?',
      items: [
        'You track employee hours on paper or WhatsApp',
        'Invoices are done in Excel or by hand',
        "You lose clients because there's no follow-up system",
        'English-only software is confusing and expensive',
        "You don't know exactly how much you made this month",
      ],
    },
    solution: {
      tag: 'The solution',
      h: 'Everything you need, in one place',
      features: [
        { icon: '👥', title: 'Clients', desc: 'Organize all your contacts, job history and invoices by client.' },
        { icon: '📄', title: 'Invoices', desc: 'Create and send professional invoices in seconds. Track outstanding payments.' },
        { icon: '👷', title: 'Employees', desc: 'Log hours, calculate payroll and manage your team without the headache.' },
        { icon: '📦', title: 'Inventory', desc: 'Track your materials. Automatic low-stock alerts.' },
        { icon: '📅', title: 'Calendar', desc: 'Schedule jobs, appointments and deliveries. Keep your team informed.' },
        { icon: '🌐', title: 'Bilingual', desc: 'Works in Spanish and English. You choose the language.' },
      ],
    },
    how: {
      tag: 'How it works',
      h: 'Ready in minutes, not hours',
      steps: [
        { n: '1', title: 'Create your account', desc: 'Register your business in 2 minutes. No contracts, no fine print.' },
        { n: '2', title: 'Import your data', desc: 'Upload your client list from Excel or start from scratch.' },
        { n: '3', title: 'Manage everything', desc: 'Invoices, employees, inventory — from your phone or computer.' },
      ],
    },
    story: {
      tag: 'Why Amixos',
      h: 'Built by someone like you',
      role: 'Founder · Electrical engineer · Contractor',
      p1: "I'm Edvin, electrical engineer and owner of two construction companies. I manage 40+ workers between Nebraska and Georgia.",
      p2: 'For years I used Excel, WhatsApp and paper for everything. Existing software was in English and cost a fortune for what it offered.',
      p3: "I built Amixos for myself first. Now I'm opening it to every Hispanic business owner who deserves a tool that speaks their language.",
    },
    pricing: {
      tag: 'Pricing',
      h: 'A plan for every stage',
      sub: 'Start with 14 days free. No card, no contracts, cancel anytime.',
      perMonth: '/mo',
      monthly: 'Monthly',
      annual: 'Annual',
      annualBadge: '2 months free',
      billedAnnually: 'billed ${total}/yr',
      popular: 'Most popular',
      ctaTrial: 'Start free',
      ctaContact: 'Contact us',
      note: 'Every plan includes 14 days free. No credit card required.',
    },
    faq: {
      tag: 'FAQ',
      h: 'Frequently asked questions',
      items: [
        { q: 'Can I try it before paying?', a: 'Yes. A full 14 days with everything included, no credit card. If it is not for you, you pay nothing.' },
        { q: 'Do I need to be tech-savvy?', a: "No. If you can use WhatsApp, you can use Amixos. It's designed to be simple." },
        { q: 'Does it work on my phone?', a: 'Yes. The web version works on any phone, and the iPhone and Android app is coming very soon.' },
        { q: 'What happens to my data?', a: 'Your data is yours. Export anytime. We never sell it.' },
        { q: 'Are there contracts?', a: 'No. Month to month, cancel anytime. No fine print.' },
      ],
    },
    finalCta: {
      h: 'Ready to get organized?',
      sub: 'Join the Hispanic business owners already transforming how they run their operation.',
      cta: 'Create my free account →',
    },
    footer: {
      tagline: 'Where businesses thrive.',
      rights: 'All rights reserved.',
    },
    mockup: {
      welcome: 'Welcome, Edvin',
      monthlyIncome: 'Income this month',
      clients: 'Clients',
      invoices: 'Invoices',
      employees: 'Employees',
      recent: 'Recent activity',
      dock: { home: 'Home', jobs: 'Jobs', clients: 'Clients', invoices: 'Invoices', more: 'More' },
      paid: 'Paid',
      sent: 'Sent',
      draft: 'Draft',
      newInvoice: 'New invoice',
      activeEmployees: 'employees',
      activeToday: 'active today',
    },
  },
};

export type LandingDict = {
  nav: { login: string; cta: string; switchLang: string };
  hero: {
    tag: string; h1_1: string; h1_2: string; sub: string;
    ctaPrimary: string; ctaSecondary: string; note: string;
  };
  trust: { secureData: string; noContracts: string; spanishFirst: string; mobileReady: string; support: string };
  problem: { tag: string; h: string; items: string[] };
  solution: { tag: string; h: string; features: { icon: string; title: string; desc: string }[] };
  how: { tag: string; h: string; steps: { n: string; title: string; desc: string }[] };
  story: { tag: string; h: string; role: string; p1: string; p2: string; p3: string };
  /** Plan names, prices and feature lists come from shared/lib/plans.ts — the
   *  same catalogue the in-app pricing modal reads, so the site can never
   *  advertise a tier or a price that Stripe does not have. Only the framing
   *  around them lives here. */
  pricing: {
    tag: string; h: string; sub: string; perMonth: string;
    monthly: string; annual: string; annualBadge: string;
    billedAnnually: string; popular: string;
    ctaTrial: string; ctaContact: string; note: string;
  };
  faq: { tag: string; h: string; items: { q: string; a: string }[] };
  finalCta: { h: string; sub: string; cta: string };
  footer: { tagline: string; rights: string };
  mockup: {
    welcome: string; monthlyIncome: string; clients: string; invoices: string; employees: string;
    recent: string; paid: string; sent: string; draft: string;
    dock: { home: string; jobs: string; clients: string; invoices: string; more: string };
    newInvoice: string; activeEmployees: string; activeToday: string;
  };
};
