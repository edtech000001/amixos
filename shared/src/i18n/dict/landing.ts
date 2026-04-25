import { Locale } from '../locales';

export const landing: Record<Locale, LandingDict> = {
  es: {
    nav: {
      login: 'Iniciar sesión',
      cta: 'Únete gratis',
      switchLang: 'Switch to English',
    },
    hero: {
      tag: '🚀 Acceso anticipado — gratis durante beta',
      h1_1: 'Tu negocio.',
      h1_2: 'En tu idioma.',
      sub: 'Amixos es el sistema de administración de negocios diseñado para dueños de negocios hispanos en Estados Unidos. Clientes, facturas, empleados e inventario — todo en un solo lugar, en español.',
    },
    form: {
      name: 'Tu nombre',
      email: 'Tu correo',
      biz: 'Tipo de negocio',
      bizOpts: ['Construcción', 'Jardinería', 'Limpieza', 'Plomería', 'Electricidad', 'Otro'],
      cta: 'Quiero acceso anticipado →',
      ctaCompact: 'Unirme →',
      note: 'Gratis durante el período beta. Sin tarjeta de crédito.',
      success: '¡Listo! Te avisamos cuando esté disponible.',
      dup: 'Ese correo ya está registrado.',
      error: 'Error, intenta de nuevo.',
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
      tag: 'Precio',
      h: 'Gratis durante el beta',
      sub: 'Los primeros 500 usuarios en la lista de espera obtienen 6 meses gratis cuando lancemos.',
      perMonth: '/mes',
      features: [
        'Clientes ilimitados',
        'Facturas ilimitadas',
        'Hasta 25 empleados',
        'Inventario completo',
        'Calendario',
        'Soporte en español',
      ],
      cta: 'Asegurar mi lugar gratis →',
    },
    faq: {
      tag: 'Preguntas',
      h: 'Preguntas frecuentes',
      items: [
        { q: '¿Cuándo estará disponible?', a: 'Estamos en beta activa ahora. Los usuarios en lista de espera serán los primeros en obtener acceso, gratis por 6 meses.' },
        { q: '¿Necesito saber de computadoras?', a: 'No. Si puedes usar WhatsApp, puedes usar Amixos. Está diseñado para ser simple.' },
        { q: '¿Funciona en el teléfono?', a: 'Sí. La versión web funciona en cualquier teléfono. La app móvil nativa está en desarrollo.' },
        { q: '¿Qué pasa con mis datos?', a: 'Tus datos son tuyos. Puedes exportarlos en cualquier momento. Nunca los vendemos.' },
        { q: '¿Hay contratos?', a: 'No. Mes a mes, cancela cuando quieras. Sin letra chica.' },
      ],
    },
    finalCta: {
      h: '¿Listo para ordenar tu negocio?',
      sub: 'Únete a los primeros dueños de negocios hispanos que están transformando cómo administran su operación.',
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
      tag: '🚀 Early access — free during beta',
      h1_1: 'Your business.',
      h1_2: 'Your language.',
      sub: 'Amixos is the business management platform built for Hispanic small business owners in the US. Clients, invoices, employees, and inventory — all in one place, bilingual.',
    },
    form: {
      name: 'Your name',
      email: 'Your email',
      biz: 'Business type',
      bizOpts: ['Construction', 'Landscaping', 'Cleaning', 'Plumbing', 'Electrical', 'Other'],
      cta: 'Get early access →',
      ctaCompact: 'Join →',
      note: 'Free during beta. No credit card needed.',
      success: "You're in! We'll notify you when it's ready.",
      dup: 'That email is already registered.',
      error: 'Error, try again.',
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
      h: 'Free during beta',
      sub: 'The first 500 users on the waitlist get 6 months free when we launch.',
      perMonth: '/mo',
      features: [
        'Unlimited clients',
        'Unlimited invoices',
        'Up to 25 employees',
        'Full inventory',
        'Calendar',
        'Spanish-first support',
      ],
      cta: 'Secure my free spot →',
    },
    faq: {
      tag: 'FAQ',
      h: 'Frequently asked questions',
      items: [
        { q: 'When will it be available?', a: "We're in active beta now. Waitlist users will be the first to get access, free for 6 months." },
        { q: 'Do I need to be tech-savvy?', a: "No. If you can use WhatsApp, you can use Amixos. It's designed to be simple." },
        { q: 'Does it work on my phone?', a: 'Yes. The web version works on any phone. A native mobile app is in development.' },
        { q: 'What happens to my data?', a: 'Your data is yours. Export anytime. We never sell it.' },
        { q: 'Are there contracts?', a: 'No. Month to month, cancel anytime. No fine print.' },
      ],
    },
    finalCta: {
      h: 'Ready to get organized?',
      sub: 'Join the first Hispanic business owners transforming how they run their operation.',
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
  hero: { tag: string; h1_1: string; h1_2: string; sub: string };
  form: {
    name: string; email: string; biz: string; bizOpts: string[];
    cta: string; ctaCompact: string; note: string;
    success: string; dup: string; error: string;
  };
  trust: { secureData: string; noContracts: string; spanishFirst: string; mobileReady: string; support: string };
  problem: { tag: string; h: string; items: string[] };
  solution: { tag: string; h: string; features: { icon: string; title: string; desc: string }[] };
  how: { tag: string; h: string; steps: { n: string; title: string; desc: string }[] };
  story: { tag: string; h: string; role: string; p1: string; p2: string; p3: string };
  pricing: { tag: string; h: string; sub: string; perMonth: string; features: string[]; cta: string };
  faq: { tag: string; h: string; items: { q: string; a: string }[] };
  finalCta: { h: string; sub: string };
  footer: { tagline: string; rights: string };
  mockup: {
    welcome: string; monthlyIncome: string; clients: string; invoices: string; employees: string;
    recent: string; paid: string; sent: string; draft: string;
    newInvoice: string; activeEmployees: string; activeToday: string;
  };
};
