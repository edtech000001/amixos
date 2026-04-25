import { Locale } from '../locales';

export type OnboardingDict = {
  page: {
    progressLabel: string;
    progressOf: string;
    footerNote: string;
    finishGenericError: string;
    bizCreateError: string;
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
    cityLabel: string;
    cityPlaceholder: string;
    stateLabel: string;
    statePlaceholder: string;
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
  addOns: {
    heading: string;
    sub: string;
    inventoryTitle: string;
    inventoryDesc: string;
    inventoryNote: string;
    voipTitle: string;
    voipDesc: string;
    voipNote: string;
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
        { key: 'car_dealership', label: 'Concesionaria' },
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
      cityLabel: 'Ciudad',
      cityPlaceholder: 'ej. Los Ángeles',
      stateLabel: 'Estado',
      statePlaceholder: 'Selecciona un estado',
      error: 'Ciudad y estado son requeridos',
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
    addOns: {
      heading: '¿Extras para tu negocio?',
      sub: 'Selecciona lo que aplica — ambos son opcionales y gratis.',
      inventoryTitle: 'Sistema de Inventario',
      inventoryDesc: 'Controla productos, materiales y niveles de stock. Recibe alertas cuando te estés quedando sin algo.',
      inventoryNote: 'Se puede activar después en ajustes',
      voipTitle: 'Número Virtual de Negocio',
      voipDesc: 'Obtén un número dedicado para llamadas y mensajes. Mantén lo personal separado del trabajo.',
      voipNote: 'Se puede agregar después en ajustes',
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
        { key: 'car_dealership', label: 'Car Dealership' },
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
      cityLabel: 'City',
      cityPlaceholder: 'e.g. Los Angeles',
      stateLabel: 'State',
      statePlaceholder: 'Select a state',
      error: 'City and state are required',
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
    addOns: {
      heading: 'Extras for your business?',
      sub: 'Pick what applies — both are optional and free.',
      inventoryTitle: 'Inventory System',
      inventoryDesc: 'Track products, materials and stock levels. Get alerts when you\'re running low.',
      inventoryNote: 'Can be enabled later in settings',
      voipTitle: 'Virtual Business Number',
      voipDesc: 'Get a dedicated number for calls and texts. Keep personal separate from work.',
      voipNote: 'Can be added later in settings',
      back: 'Back',
      finish: 'Create my business 🚀',
    },
    complete: {
      heading: 'All set!',
      sub: 'Preparing your dashboard...',
    },
  },
};
