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
  // Web-only discoverability hint: paste an image straight into a photo
  // field. "{{keys}}" is the platform shortcut (⌘V on Mac, Ctrl+V else).
  pasteImageHint: string;
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
  // Hover tooltips for the dashboard's icon-only buttons
  // (shared/src/ui/Tooltip.web.tsx). Kept in one block rather than scattered
  // through each screen's dict so the same action reads the same way
  // everywhere — a trash can says "Eliminar" on every screen, not "Borrar" on
  // one and "Quitar" on the next.
  tips: {
    // Generic
    edit: string;
    delete: string;
    back: string;
    close: string;
    exitSelection: string;
    send: string;
    print: string;
    shareLink: string;
    settings: string;
    dragToReorder: string;
    collapseSidebar: string;
    expandSidebar: string;
    clearFilters: string;
    clearDate: string;
    // Clients / employees
    importClients: string;
    addContact: string;
    deleteEmployee: string;
    loans: string;
    // Jobs / invoices
    autoprice: string;
    sendInvoice: string;
    createInvoice: string;
    emailProposal: string;
    downloadProposal: string;
    generateSku: string;
    // Settings
    renameRole: string;
    // Assistant
    assistant: string;
    resetChat: string;
    voiceInput: string;
    voiceCall: string;
    // Modules
    uploadPhoto: string;
    openFile: string;
    resetMapView: string;
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
    pasteImageHint: 'También puedes pegar una foto copiada con {{keys}}',
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
    tips: {
      edit: 'Editar',
      delete: 'Eliminar',
      back: 'Volver',
      close: 'Cerrar',
      exitSelection: 'Salir de la selección',
      send: 'Enviar',
      print: 'Imprimir',
      shareLink: 'Copiar un enlace para compartir',
      settings: 'Ajustes',
      dragToReorder: 'Arrastra para reordenar',
      collapseSidebar: 'Ocultar el menú',
      expandSidebar: 'Mostrar el menú',
      clearFilters: 'Quitar los filtros',
      clearDate: 'Quitar la fecha',
      importClients: 'Importar clientes desde un archivo CSV',
      addContact: 'Agregar un contacto',
      deleteEmployee: 'Eliminar este empleado',
      loans: 'Préstamos y descuentos',
      autoprice: 'Poner los precios desde tu lista de precios',
      sendInvoice: 'Enviar la factura al cliente por correo',
      createInvoice: 'Crear una factura con los trabajos seleccionados',
      emailProposal: 'Enviar la propuesta por correo',
      downloadProposal: 'Descargar el PDF',
      generateSku: 'Generar un SKU',
      renameRole: 'Cambiar el nombre',
      assistant: 'Ami, tu asistente',
      resetChat: 'Empezar una conversación nueva',
      voiceInput: 'Dictar con la voz',
      voiceCall: 'Hablar con Ami',
      uploadPhoto: 'Subir una foto',
      openFile: 'Abrir',
      resetMapView: 'Centrar el mapa',
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
    pasteImageHint: 'You can also paste a copied photo with {{keys}}',
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
    tips: {
      edit: 'Edit',
      delete: 'Delete',
      back: 'Back',
      close: 'Close',
      exitSelection: 'Leave selection mode',
      send: 'Send',
      print: 'Print',
      shareLink: 'Copy a share link',
      settings: 'Settings',
      dragToReorder: 'Drag to reorder',
      collapseSidebar: 'Hide the menu',
      expandSidebar: 'Show the menu',
      clearFilters: 'Clear the filters',
      clearDate: 'Clear the date',
      importClients: 'Import clients from a CSV file',
      addContact: 'Add a contact',
      deleteEmployee: 'Delete this employee',
      loans: 'Loans and deductions',
      autoprice: 'Fill the prices from your price sheet',
      sendInvoice: 'Email the invoice to the client',
      createInvoice: 'Create one invoice from the selected jobs',
      emailProposal: 'Email the proposal',
      downloadProposal: 'Download the PDF',
      generateSku: 'Generate a SKU',
      renameRole: 'Rename',
      assistant: 'Ami, your assistant',
      resetChat: 'Start a new conversation',
      voiceInput: 'Dictate with your voice',
      voiceCall: 'Talk to Ami',
      uploadPhoto: 'Upload a photo',
      openFile: 'Open',
      resetMapView: 'Recenter the map',
    },
  },
};
