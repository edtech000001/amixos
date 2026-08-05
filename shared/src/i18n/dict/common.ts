import { Locale } from '../locales';

export type CommonDict = {
  appMetadata: {
    title: string;
    description: string;
  };
  langSwitcher: {
    label: string;
    switchTo: string;
  };
  buttons: {
    save: string;
    saveChanges: string;
    cancel: string;
    back: string;
    next: string;
    continue: string;
    edit: string;
    delete: string;
    add: string;
    remove: string;
    close: string;
    done: string;
    clear: string;
  };
  states: {
    loading: string;
    saving: string;
    yes: string;
    no: string;
    optional: string;
  };
  // Stale-while-revalidate UI (swrCache): freshness caption + refresh hint.
  swr: {
    updatedAgo: string;   // "{{time}}" placeholder, e.g. "hace 5 min"
    justNow: string;
    refreshing: string;
  };
  // Shown when the app can't load the user's account/business (e.g. a
  // not-yet-run DB migration). Deliberately reassures the user nothing was
  // lost and offers a retry.
  loadError: {
    title: string;
    body: string;
    retry: string;
    signOut: string;
  };
  validation: {
    invalidEmail: string;
  };
  unsavedChanges: {
    title: string;
    body: string;
    stay: string;
    discard: string;
  };
  duration: {
    day: string;
    days: string;
    hourAbbr: string;
    minAbbr: string;
  };
  mobileAppBanner: {
    title: string;
    subtitle: string;
    openBtn: string;
  };
};

export const common: Record<Locale, CommonDict> = {
  es: {
    appMetadata: {
      title: 'Amixos — Donde se hace la chamba.',
      description: 'Plataforma de gestión para pequeños negocios. Bilingüe. Modular. Hecha para la comunidad.',
    },
    langSwitcher: {
      label: 'Idioma',
      switchTo: 'Cambiar a',
    },
    buttons: {
      save: 'Guardar',
      saveChanges: 'Guardar cambios',
      cancel: 'Cancelar',
      back: 'Atrás',
      next: 'Siguiente',
      continue: 'Continuar',
      edit: 'Editar',
      delete: 'Eliminar',
      add: 'Agregar',
      remove: 'Quitar',
      close: 'Cerrar',
      done: 'Listo',
      clear: 'Borrar',
    },
    states: {
      loading: 'Cargando',
      saving: 'Guardando',
      yes: 'Sí',
      no: 'No',
      optional: 'opcional',
    },
    swr: {
      updatedAgo: 'Actualizado {{time}}',
      justNow: 'justo ahora',
      refreshing: 'Actualizando…',
    },
    loadError: {
      title: 'No pudimos cargar tu cuenta',
      body: 'Tu información sigue guardada. Esto suele pasar justo después de una actualización. Intenta de nuevo en un momento.',
      retry: 'Intentar de nuevo',
      signOut: 'Cerrar sesión',
    },
    validation: {
      invalidEmail: 'Correo electrónico no válido.',
    },
    unsavedChanges: {
      title: 'Cambios sin guardar',
      body: 'Si sales ahora, perderás lo que escribiste. ¿Quieres salir?',
      stay: 'Seguir editando',
      discard: 'Salir sin guardar',
    },
    duration: {
      day: 'día',
      days: 'días',
      hourAbbr: 'h',
      minAbbr: 'min',
    },
    mobileAppBanner: {
      title: 'Amixos para iPhone',
      subtitle: 'Mejor experiencia en la app.',
      openBtn: 'Abrir',
    },
  },
  en: {
    appMetadata: {
      title: 'Amixos — Where the work gets done.',
      description: 'Business management platform for small businesses. Bilingual. Modular. Built for the community.',
    },
    langSwitcher: {
      label: 'Language',
      switchTo: 'Switch to',
    },
    buttons: {
      save: 'Save',
      saveChanges: 'Save changes',
      cancel: 'Cancel',
      back: 'Back',
      next: 'Next',
      continue: 'Continue',
      edit: 'Edit',
      delete: 'Delete',
      add: 'Add',
      remove: 'Remove',
      close: 'Close',
      done: 'Done',
      clear: 'Clear',
    },
    states: {
      loading: 'Loading',
      saving: 'Saving',
      yes: 'Yes',
      no: 'No',
      optional: 'optional',
    },
    swr: {
      updatedAgo: 'Updated {{time}}',
      justNow: 'just now',
      refreshing: 'Refreshing…',
    },
    loadError: {
      title: "We couldn't load your account",
      body: 'Your data is still safe. This usually happens right after an update — try again in a moment.',
      retry: 'Try again',
      signOut: 'Sign out',
    },
    validation: {
      invalidEmail: 'Invalid email address.',
    },
    unsavedChanges: {
      title: 'Unsaved changes',
      body: 'If you leave now, you\'ll lose what you typed. Leave anyway?',
      stay: 'Keep editing',
      discard: 'Leave without saving',
    },
    duration: {
      day: 'day',
      days: 'days',
      hourAbbr: 'h',
      minAbbr: 'min',
    },
    mobileAppBanner: {
      title: 'Amixos for iPhone',
      subtitle: 'Better experience in the app.',
      openBtn: 'Open',
    },
  },
};
