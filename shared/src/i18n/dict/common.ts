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
    mobileAppBanner: {
      title: 'Amixos for iPhone',
      subtitle: 'Better experience in the app.',
      openBtn: 'Open',
    },
  },
};
