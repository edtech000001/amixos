import { Locale } from '../locales';

export type OnboardingDict = {
  page: {
    progressLabel: string;
    progressOf: string;
    footerNote: string;
    finishGenericError: string;
    bizCreateError: string;
  };
  invites: {
    title: string;
    body: string;
    joinBtn: string;
    joining: string;
    orCreate: string;
    error: string;
  };
  businessName: {
    heading: string;
    sub: string;
    label: string;
    placeholder: string;
    cta: string;
    error: string;
  };
  serviceType: {
    heading: string;
    sub: string;
    options: { key: string; label: string }[];
    error: string;
    back: string;
    next: string;
  };
  location: {
    heading: string;
    sub: string;
    addressLabel: string;
    addressPlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
    stateLabel: string;
    statePlaceholder: string;
    zipLabel: string;
    zipPlaceholder: string;
    addHoursLabel: string;
    addHoursHint: string;
    hoursHeading: string;
    error: string;
    back: string;
    next: string;
  };
  logo: {
    heading: string;
    sub: string;
    uploadPrimary: string;
    uploadSecondary: string;
    remove: string;
    sizeError: string;
    uploadError: string;
    back: string;
    next: string;
    skip: string;
  };
  features: {
    heading: string;
    sub: string;
    note: string;
    fallback: string;
    back: string;
    finish: string;
  };
  complete: {
    heading: string;
    sub: string;
  };
};

export const onboarding: Record<Locale, OnboardingDict> = {
  es: {
    page: {
      progressLabel: 'Configurando tu negocio',
      progressOf: 'de',
      footerNote: 'Puedes agregar más negocios y cambiar ajustes en cualquier momento.',
      finishGenericError: 'Algo salió mal. Intenta de nuevo.',
      bizCreateError: 'Error al crear negocio',
    },
    invites: {
      title: '¡Te invitaron a un negocio!',
      body: 'Detectamos una invitación pendiente para tu correo. Únete o crea tu propio negocio abajo.',
      joinBtn: 'Unirse a {{name}}',
      joining: 'Uniéndote…',
      orCreate: 'O crea tu propio negocio:',
      error: 'No se pudo aceptar la invitación.',
    },
    businessName: {
      heading: '¿Cómo se llama tu negocio?',
      sub: 'Puedes cambiarlo después cuando quieras.',
      label: 'Nombre del negocio',
      placeholder: 'ej. Servicios Ramírez',
      cta: 'Continuar',
      error: 'El nombre del negocio es requerido',
    },
    serviceType: {
      heading: '¿Qué tipo de negocio es este?',
      sub: 'Activaremos las funciones correctas para tu industria.',
      options: [
        { key: 'construction', label: 'Construcción' },
        { key: 'mechanics', label: 'Mecánica / Auto' },
        { key: 'landscaping', label: 'Jardinería' },
        { key: 'cleaning', label: 'Limpieza' },
        { key: 'restaurant', label: 'Restaurante / Comida' },
        { key: 'phone_repair', label: 'Reparación de Teléfonos' },
        { key: 'plumbing', label: 'Plomería' },
        { key: 'retail', label: 'Tienda / Retail' },
        { key: 'other', label: 'Otro' },
      ],
      error: 'Por favor selecciona un tipo de negocio',
      back: 'Atrás',
      next: 'Continuar',
    },
    location: {
      heading: '¿Dónde está tu negocio?',
      sub: 'Ayuda con horarios locales y manejo de clientes.',
      addressLabel: 'Dirección',
      addressPlaceholder: 'ej. 123 Main St',
      cityLabel: 'Ciudad',
      cityPlaceholder: 'ej. Los Ángeles',
      stateLabel: 'Estado',
      statePlaceholder: 'Selecciona un estado',
      zipLabel: 'Código postal',
      zipPlaceholder: 'ej. 90001',
      addHoursLabel: 'Agregar horario de atención',
      addHoursHint: 'Opcional',
      hoursHeading: 'Horario de atención',
      error: 'Dirección, ciudad, estado y código postal son requeridos',
      back: 'Atrás',
      next: 'Continuar',
    },
    logo: {
      heading: 'Sube tu logo',
      sub: 'Opcional — puedes agregarlo después en ajustes.',
      uploadPrimary: 'Toca para subir tu logo',
      uploadSecondary: 'PNG, JPG hasta 2MB',
      remove: 'Quitar',
      sizeError: 'El logo debe ser menor a 2MB',
      uploadError: 'Error al subir. Intenta de nuevo.',
      back: 'Atrás',
      next: 'Continuar',
      skip: 'Saltar por ahora',
    },
    features: {
      heading: '¿Extras para tu negocio?',
      sub: 'Activamos lo recomendado para tu industria — todo es opcional y gratis.',
      note: 'Se puede activar después en ajustes',
      fallback: 'Otras funciones se pueden activar en la tienda de módulos en ajustes.',
      back: 'Atrás',
      finish: 'Crear mi negocio 🚀',
    },
    complete: {
      heading: '¡Todo listo!',
      sub: 'Preparando tu panel...',
    },
  },
  en: {
    page: {
      progressLabel: 'Setting up your business',
      progressOf: 'of',
      footerNote: 'You can add more businesses and change settings anytime.',
      finishGenericError: 'Something went wrong. Try again.',
      bizCreateError: 'Error creating business',
    },
    invites: {
      title: "You've been invited to a business!",
      body: 'We found a pending invitation for your email. Join it, or create your own business below.',
      joinBtn: 'Join {{name}}',
      joining: 'Joining…',
      orCreate: 'Or create your own business:',
      error: "Couldn't accept the invitation.",
    },
    businessName: {
      heading: "What's your business called?",
      sub: 'You can change it later anytime.',
      label: 'Business name',
      placeholder: 'e.g. Ramirez Services',
      cta: 'Continue',
      error: 'Business name is required',
    },
    serviceType: {
      heading: 'What type of business is it?',
      sub: "We'll turn on the right features for your industry.",
      options: [
        { key: 'construction', label: 'Construction' },
        { key: 'mechanics', label: 'Mechanic / Auto' },
        { key: 'landscaping', label: 'Landscaping' },
        { key: 'cleaning', label: 'Cleaning' },
        { key: 'restaurant', label: 'Restaurant / Food' },
        { key: 'phone_repair', label: 'Phone Repair' },
        { key: 'plumbing', label: 'Plumbing' },
        { key: 'retail', label: 'Retail / Shop' },
        { key: 'other', label: 'Other' },
      ],
      error: 'Please select a business type',
      back: 'Back',
      next: 'Continue',
    },
    location: {
      heading: 'Where is your business?',
      sub: 'Helps with local hours and client management.',
      addressLabel: 'Street address',
      addressPlaceholder: 'e.g. 123 Main St',
      cityLabel: 'City',
      cityPlaceholder: 'e.g. Los Angeles',
      stateLabel: 'State',
      statePlaceholder: 'Select a state',
      zipLabel: 'ZIP code',
      zipPlaceholder: 'e.g. 90001',
      addHoursLabel: 'Add business hours',
      addHoursHint: 'Optional',
      hoursHeading: 'Business hours',
      error: 'Street, city, state and ZIP are required',
      back: 'Back',
      next: 'Continue',
    },
    logo: {
      heading: 'Upload your logo',
      sub: 'Optional — you can add it later in settings.',
      uploadPrimary: 'Tap to upload your logo',
      uploadSecondary: 'PNG, JPG up to 2MB',
      remove: 'Remove',
      sizeError: 'Logo must be smaller than 2MB',
      uploadError: 'Upload error. Try again.',
      back: 'Back',
      next: 'Continue',
      skip: 'Skip for now',
    },
    features: {
      heading: 'Extras for your business?',
      sub: "We've picked what's recommended for your industry — all optional and free.",
      note: 'Can be enabled later in settings',
      fallback: 'Other features are available to enable in the module store in settings.',
      back: 'Back',
      finish: 'Create my business 🚀',
    },
    complete: {
      heading: 'All set!',
      sub: 'Preparing your dashboard...',
    },
  },
};
