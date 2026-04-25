import { Locale } from '../locales';

export type DashboardDict = {
  sidebar: {
    inicio: string;
    trabajos: string;
    clientes: string;
    facturas: string;
    empleados: string;
    calendario: string;
    inventario: string;
    reportes: string;
    ajustes: string;
    logout: string;
  };
  home: {
    welcome: string;
    newInvoice: string;
    widgets: {
      earningsMonthLabel: string;
      earningsMonthSub: string;
      invoicesPendingLabel: string;
      invoicesPendingSub: string;
      clientsLabel: string;
      clientsSub: string;
      invoicesOverdueLabel: string;
      invoicesOverdueSub: string;
      clockedInLabel: string;
      clockedInSub: string;
      earningsYearLabel: string;
      earningsYearSub: string;
    };
    recent: {
      title: string;
      viewAll: string;
      empty: string;
      createFirst: string;
      noClient: string;
    };
  };
  invoiceStatus: {
    draft: string;
    sent: string;
    paid: string;
    overdue: string;
    cancelled: string;
  };
  invoices: {
    title: string;
    countTotal: string;
    newInvoice: string;
    filters: {
      all: string;
      drafts: string;
      sent: string;
      paid: string;
      overdue: string;
    };
    searchPlaceholder: string;
    summarySingle: string;
    summaryPlural: string;
    summaryTotal: string;
    empty: string;
    createFirst: string;
    noClient: string;
    dueShort: string;
    markSent: string;
    markPaid: string;
    notFound: string;
    new: {
      heading: string;
      generalInfo: string;
      clientsLabel: string;
      selectClient: string;
      addAnotherClient: string;
      invoiceNumberLabel: string;
      issueDateLabel: string;
      dueDateLabel: string;
      languageLabel: string;
      itemsHeading: string;
      colDescription: string;
      colQty: string;
      colRate: string;
      itemPlaceholder: string;
      addItem: string;
      subtotal: string;
      taxPercent: string;
      total: string;
      notesLabel: string;
      notesPlaceholder: string;
      errorAtLeastOne: string;
      errorSave: string;
      saveDraft: string;
      sendInvoice: string;
    };
    // Date formatting locale (e.g. 'es-MX', 'en-US')
    dateLocale: string;
  };
  clients: {
    title: string;
    countTotal: string;
    newClient: string;
    importBtn: string;
    searchPlaceholder: string;
    selectAll: string;
    selectedCountSingle: string;
    selectedCountPlural: string;
    bulkDelete: string;
    emptyNoMatch: string;
    emptyAll: string;
    addFirst: string;
    confirmDeleteSingle: string;
    confirmDeleteBulk: string;
    notFound: string;
    fields: {
      firstName: string;
      lastName: string;
      company: string;
      phoneCell: string;
      phoneOffice: string;
      emailOffice: string;
      emailHome: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      state: string;
      zipCode: string;
      notes: string;
      placeholders: {
        firstName: string;
        lastName: string;
        company: string;
        phone: string;
        emailOffice: string;
        emailHome: string;
        address: string;
        addressLine2: string;
        city: string;
        zipCode: string;
        notes: string;
      };
    };
    sections: {
      basicInfo: string;
      phones: string;
      emails: string;
      address: string;
      customFields: string;
      notes: string;
    };
    modal: {
      addTitle: string;
      editTitle: string;
      requiredError: string;
      saveError: string;
      saveBtn: string;
    };
    detail: {
      contact: string;
      noContactInfo: string;
      contactPeople: string;
      noContacts: string;
      addContact: string;
      summary: string;
      totalPaid: string;
      pending: string;
      invoicesCount: string;
      addedAt: string;
      modifiedAt: string;
      invoicesTitle: string;
      newInvoiceShort: string;
      noInvoices: string;
      createFirstInvoice: string;
      dueShort: string;
      contactModal: {
        addTitle: string;
        editTitle: string;
        nameLabel: string;
        rolePlaceholder: string;
        roleLabel: string;
        phoneLabel: string;
        emailLabel: string;
        notesLabel: string;
        notesPlaceholder: string;
        primaryLabel: string;
        addBtn: string;
        confirmDelete: string;
      };
    };
    importModal: {
      title: string;
      mapTitle: string;
      previewTitle: string;
      doneTitle: string;
      uploadPrimary: string;
      uploadSecondary: string;
      templatePromptTitle: string;
      templatePromptSub: string;
      templateBtn: string;
      mapDetected: string;
      mapInstruction: string;
      customLabel: string;
      noImport: string;
      viewData: string;
      previewSummary: string;
      importNRows: string;
      importDone: string;
      importedCount: string;
      errorsCount: string;
      errorsExplanation: string;
      goToList: string;
      templateFilename: string;
    };
  };
  jobs: {
    title: string;
    countTotal: string;
    pendingValue: string;
    inProgressValue: string;
    completedValue: string;
    newDropdown: {
      trigger: string;
      jobOption: string;
      jobOptionSub: string;
      proposalOption: string;
      proposalOptionSub: string;
    };
    searchPlaceholder: string;
    tabs: {
      all: string;
      proposals: string;
      scheduled: string;
      in_progress: string;
      completed: string;
      invoiced: string;
      cancelled: string;
    };
    statuses: {
      proposal: string;
      sent: string;
      accepted: string;
      declined: string;
      scheduled: string;
      in_progress: string;
      completed: string;
      cancelled: string;
      invoiced: string;
    };
    priorities: {
      low: string;
      normal: string;
      high: string;
      urgent: string;
    };
    expired: string;
    emptyNoMatch: string;
    emptyAll: string;
    createFirst: string;
    dueShort: string;
    actions: {
      markSent: string;
      markAccepted: string;
      markDeclined: string;
      schedule: string;
      generateInvoice: string;
      startWork: string;
      markCompleted: string;
      viewInvoice: string;
      cancel: string;
    };
    notFound: string;
  };
  // Date locale for short month formatting in lists
  dateLocale: string;
};

export const dashboard: Record<Locale, DashboardDict> = {
  es: {
    sidebar: {
      inicio: 'Inicio',
      trabajos: 'Trabajos',
      clientes: 'Clientes',
      facturas: 'Facturas',
      empleados: 'Empleados',
      calendario: 'Calendario',
      inventario: 'Inventario',
      reportes: 'Reportes',
      ajustes: 'Ajustes',
      logout: 'Cerrar sesión',
    },
    home: {
      welcome: 'Bienvenido 👋',
      newInvoice: 'Nueva factura',
      widgets: {
        earningsMonthLabel: 'Ganancias del mes',
        earningsMonthSub: '{{amount}} este año',
        invoicesPendingLabel: 'Facturas pendientes',
        invoicesPendingSub: 'esperando pago',
        clientsLabel: 'Clientes',
        clientsSub: 'en tu lista',
        invoicesOverdueLabel: 'Facturas vencidas',
        invoicesOverdueSub: 'requieren atención',
        clockedInLabel: 'Activos ahora',
        clockedInSub: 'empleados trabajando',
        earningsYearLabel: 'Ganancias del año',
        earningsYearSub: 'desde ene {{year}}',
      },
      recent: {
        title: 'Facturas recientes',
        viewAll: 'Ver todas',
        empty: 'Aún no tienes facturas.',
        createFirst: 'Crea tu primera factura →',
        noClient: 'Sin cliente',
      },
    },
    invoiceStatus: {
      draft: 'Borrador',
      sent: 'Enviada',
      paid: 'Pagada',
      overdue: 'Vencida',
      cancelled: 'Cancelada',
    },
    invoices: {
      title: 'Facturas',
      countTotal: '{{count}} en total',
      newInvoice: 'Nueva factura',
      filters: {
        all: 'Todas',
        drafts: 'Borradores',
        sent: 'Enviadas',
        paid: 'Pagadas',
        overdue: 'Vencidas',
      },
      searchPlaceholder: 'Buscar factura o cliente...',
      summarySingle: '{{count}} factura',
      summaryPlural: '{{count}} facturas',
      summaryTotal: 'Total',
      empty: 'Sin facturas.',
      createFirst: 'Crea la primera →',
      noClient: 'Sin cliente',
      dueShort: 'Vence {{date}}',
      markSent: 'Marcar enviada',
      markPaid: 'Marcar pagada',
      notFound: 'Factura no encontrada.',
      new: {
        heading: 'Nueva factura',
        generalInfo: 'Información general',
        clientsLabel: 'Clientes',
        selectClient: 'Seleccionar cliente...',
        addAnotherClient: 'Agregar otro cliente...',
        invoiceNumberLabel: 'Número de factura',
        issueDateLabel: 'Fecha de emisión',
        dueDateLabel: 'Fecha de vencimiento',
        languageLabel: 'Idioma de la factura',
        itemsHeading: 'Conceptos',
        colDescription: 'Descripción',
        colQty: 'Cant.',
        colRate: 'Precio',
        itemPlaceholder: 'Descripción del servicio o producto',
        addItem: 'Agregar concepto',
        subtotal: 'Subtotal',
        taxPercent: 'Impuesto (%)',
        total: 'Total',
        notesLabel: 'Notas (opcional)',
        notesPlaceholder: 'Términos de pago, instrucciones de transferencia, etc.',
        errorAtLeastOne: 'Agrega al menos un concepto',
        errorSave: 'Error al guardar. Intenta de nuevo.',
        saveDraft: 'Guardar borrador',
        sendInvoice: 'Crear y enviar',
      },
      dateLocale: 'es-MX',
    },
    clients: {
      title: 'Clientes',
      countTotal: '{{count}} en total',
      newClient: 'Nuevo cliente',
      importBtn: 'Importar',
      searchPlaceholder: 'Buscar por nombre, empresa, teléfono, ciudad...',
      selectAll: 'Seleccionar todos',
      selectedCountSingle: '{{count}} seleccionado',
      selectedCountPlural: '{{count}} seleccionados',
      bulkDelete: 'Eliminar',
      emptyNoMatch: 'Sin resultados.',
      emptyAll: 'Aún no tienes clientes.',
      addFirst: 'Agrega el primero →',
      confirmDeleteSingle: '¿Eliminar este cliente permanentemente?',
      confirmDeleteBulk: '¿Eliminar {{count}} cliente(s) permanentemente?',
      notFound: 'Cliente no encontrado.',
      fields: {
        firstName: 'Nombre',
        lastName: 'Apellido',
        company: 'Empresa',
        phoneCell: 'Celular',
        phoneOffice: 'Teléfono oficina',
        emailOffice: 'Correo oficina',
        emailHome: 'Correo personal',
        addressLine1: 'Calle y número',
        addressLine2: 'Apartamento / Suite',
        city: 'Ciudad',
        state: 'Estado',
        zipCode: 'Código postal',
        notes: 'Notas',
        placeholders: {
          firstName: 'Juan',
          lastName: 'Pérez',
          company: 'Construcciones Ramírez',
          phone: '(555) 000-0000',
          emailOffice: 'oficina@empresa.com',
          emailHome: 'juan@personal.com',
          address: '123 Main St',
          addressLine2: 'Apt 4B',
          city: 'Omaha',
          zipCode: '68102',
          notes: 'Notas internas sobre este cliente...',
        },
      },
      sections: {
        basicInfo: 'Información básica',
        phones: 'Teléfonos',
        emails: 'Correos electrónicos',
        address: 'Dirección',
        customFields: 'Campos personalizados',
        notes: 'Notas',
      },
      modal: {
        addTitle: 'Nuevo cliente',
        editTitle: 'Editar cliente',
        requiredError: 'Campos requeridos: {{fields}}',
        saveError: 'Error al guardar.',
        saveBtn: 'Guardar cliente',
      },
      detail: {
        contact: 'Contacto',
        noContactInfo: 'Sin datos de contacto.',
        contactPeople: 'Personas de contacto',
        noContacts: 'Sin contactos agregados.',
        addContact: '+ Agregar contacto',
        summary: 'Resumen',
        totalPaid: 'Total pagado',
        pending: 'Pendiente',
        invoicesCount: 'Facturas',
        addedAt: 'Agregado',
        modifiedAt: 'Modificado',
        invoicesTitle: 'Facturas',
        newInvoiceShort: 'Nueva',
        noInvoices: 'Sin facturas aún.',
        createFirstInvoice: 'Crear primera factura →',
        dueShort: 'Vence {{date}}',
        contactModal: {
          addTitle: 'Nuevo contacto',
          editTitle: 'Editar contacto',
          nameLabel: 'Nombre *',
          roleLabel: 'Cargo / Rol',
          rolePlaceholder: 'Dueño, Asistente, Encargado...',
          phoneLabel: 'Teléfono',
          emailLabel: 'Correo',
          notesLabel: 'Notas',
          notesPlaceholder: 'Ej. Disponible solo por las mañanas...',
          primaryLabel: 'Contacto principal',
          addBtn: 'Agregar contacto',
          confirmDelete: '¿Eliminar este contacto?',
        },
      },
      importModal: {
        title: 'Importar clientes',
        mapTitle: 'Mapear columnas',
        previewTitle: 'Vista previa',
        doneTitle: '¡Importación completa!',
        uploadPrimary: 'Haz clic para seleccionar un archivo CSV',
        uploadSecondary: 'O arrastra y suelta aquí',
        templatePromptTitle: '¿Tienes el formato correcto?',
        templatePromptSub: 'Descarga la plantilla de ejemplo',
        templateBtn: 'Plantilla CSV',
        mapDetected: '{{count}} filas detectadas',
        mapInstruction: 'Asigna cada campo de Amixos a la columna de tu archivo.',
        customLabel: 'personalizado',
        noImport: '— No importar —',
        viewData: 'Ver datos',
        previewSummary: 'Mostrando las primeras {{shown}} de {{total}} filas.',
        importNRows: 'Importar {{count}} cliente(s)',
        importDone: 'Importación terminada',
        importedCount: '{{count}} importados',
        errorsCount: '{{count}} con error',
        errorsExplanation: 'Las filas con error no tenían "Nombre" o fallaron al guardar.',
        goToList: 'Ver clientes',
        templateFilename: 'plantilla_clientes.csv',
      },
    },
    jobs: {
      title: 'Trabajos',
      countTotal: '{{count}} en total',
      pendingValue: '{{amount}} pendiente',
      inProgressValue: '{{amount}} en progreso',
      completedValue: '{{amount}} completado',
      newDropdown: {
        trigger: 'Nuevo',
        jobOption: 'Nuevo trabajo',
        jobOptionSub: 'Programar trabajo directamente',
        proposalOption: 'Nueva propuesta',
        proposalOptionSub: 'Cotizar antes de trabajar',
      },
      searchPlaceholder: 'Buscar por nombre, cliente, número, ciudad...',
      tabs: {
        all: 'Todos',
        proposals: 'Propuestas',
        scheduled: 'Programados',
        in_progress: 'En progreso',
        completed: 'Completados',
        invoiced: 'Facturados',
        cancelled: 'Cancelados',
      },
      statuses: {
        proposal: 'Propuesta',
        sent: 'Enviada',
        accepted: 'Aceptada',
        declined: 'Rechazada',
        scheduled: 'Programado',
        in_progress: 'En progreso',
        completed: 'Completado',
        cancelled: 'Cancelado',
        invoiced: 'Facturado',
      },
      priorities: {
        low: 'Baja',
        normal: 'Normal',
        high: 'Alta',
        urgent: 'Urgente',
      },
      expired: '⚠ Vencida',
      emptyNoMatch: 'Sin resultados.',
      emptyAll: 'No tienes trabajos aún.',
      createFirst: 'Crear el primero →',
      dueShort: 'Vence {{date}}',
      actions: {
        markSent: 'Marcar enviada',
        markAccepted: 'Aceptada',
        markDeclined: 'Rechazada',
        schedule: 'Programar',
        generateInvoice: 'Facturar',
        startWork: '▶ Iniciar trabajo',
        markCompleted: '✓ Marcar completado',
        viewInvoice: 'Ver factura',
        cancel: 'Cancelar',
      },
      notFound: 'Trabajo no encontrado.',
    },
    dateLocale: 'es-MX',
  },
  en: {
    sidebar: {
      inicio: 'Home',
      trabajos: 'Jobs',
      clientes: 'Clients',
      facturas: 'Invoices',
      empleados: 'Employees',
      calendario: 'Calendar',
      inventario: 'Inventory',
      reportes: 'Reports',
      ajustes: 'Settings',
      logout: 'Sign out',
    },
    home: {
      welcome: 'Welcome 👋',
      newInvoice: 'New invoice',
      widgets: {
        earningsMonthLabel: 'Earnings this month',
        earningsMonthSub: '{{amount}} this year',
        invoicesPendingLabel: 'Pending invoices',
        invoicesPendingSub: 'awaiting payment',
        clientsLabel: 'Clients',
        clientsSub: 'in your list',
        invoicesOverdueLabel: 'Overdue invoices',
        invoicesOverdueSub: 'need attention',
        clockedInLabel: 'Active now',
        clockedInSub: 'employees working',
        earningsYearLabel: 'Earnings this year',
        earningsYearSub: 'since Jan {{year}}',
      },
      recent: {
        title: 'Recent invoices',
        viewAll: 'View all',
        empty: "You don't have any invoices yet.",
        createFirst: 'Create your first invoice →',
        noClient: 'No client',
      },
    },
    invoiceStatus: {
      draft: 'Draft',
      sent: 'Sent',
      paid: 'Paid',
      overdue: 'Overdue',
      cancelled: 'Cancelled',
    },
    invoices: {
      title: 'Invoices',
      countTotal: '{{count}} total',
      newInvoice: 'New invoice',
      filters: {
        all: 'All',
        drafts: 'Drafts',
        sent: 'Sent',
        paid: 'Paid',
        overdue: 'Overdue',
      },
      searchPlaceholder: 'Search invoice or client...',
      summarySingle: '{{count}} invoice',
      summaryPlural: '{{count}} invoices',
      summaryTotal: 'Total',
      empty: 'No invoices yet.',
      createFirst: 'Create the first one →',
      noClient: 'No client',
      dueShort: 'Due {{date}}',
      markSent: 'Mark sent',
      markPaid: 'Mark paid',
      notFound: 'Invoice not found.',
      new: {
        heading: 'New invoice',
        generalInfo: 'General info',
        clientsLabel: 'Clients',
        selectClient: 'Select client...',
        addAnotherClient: 'Add another client...',
        invoiceNumberLabel: 'Invoice number',
        issueDateLabel: 'Issue date',
        dueDateLabel: 'Due date',
        languageLabel: 'Invoice language',
        itemsHeading: 'Items',
        colDescription: 'Description',
        colQty: 'Qty',
        colRate: 'Price',
        itemPlaceholder: 'Description of the service or product',
        addItem: 'Add item',
        subtotal: 'Subtotal',
        taxPercent: 'Tax (%)',
        total: 'Total',
        notesLabel: 'Notes (optional)',
        notesPlaceholder: 'Payment terms, transfer instructions, etc.',
        errorAtLeastOne: 'Add at least one item',
        errorSave: 'Save error. Try again.',
        saveDraft: 'Save draft',
        sendInvoice: 'Create and send',
      },
      dateLocale: 'en-US',
    },
    clients: {
      title: 'Clients',
      countTotal: '{{count}} total',
      newClient: 'New client',
      importBtn: 'Import',
      searchPlaceholder: 'Search by name, company, phone, city...',
      selectAll: 'Select all',
      selectedCountSingle: '{{count}} selected',
      selectedCountPlural: '{{count}} selected',
      bulkDelete: 'Delete',
      emptyNoMatch: 'No results.',
      emptyAll: "You don't have any clients yet.",
      addFirst: 'Add the first one →',
      confirmDeleteSingle: 'Delete this client permanently?',
      confirmDeleteBulk: 'Delete {{count}} client(s) permanently?',
      notFound: 'Client not found.',
      fields: {
        firstName: 'First name',
        lastName: 'Last name',
        company: 'Company',
        phoneCell: 'Cell',
        phoneOffice: 'Office phone',
        emailOffice: 'Office email',
        emailHome: 'Personal email',
        addressLine1: 'Street address',
        addressLine2: 'Apartment / Suite',
        city: 'City',
        state: 'State',
        zipCode: 'ZIP code',
        notes: 'Notes',
        placeholders: {
          firstName: 'John',
          lastName: 'Doe',
          company: 'Doe Construction',
          phone: '(555) 000-0000',
          emailOffice: 'office@company.com',
          emailHome: 'john@personal.com',
          address: '123 Main St',
          addressLine2: 'Apt 4B',
          city: 'Omaha',
          zipCode: '68102',
          notes: 'Internal notes about this client...',
        },
      },
      sections: {
        basicInfo: 'Basic info',
        phones: 'Phones',
        emails: 'Emails',
        address: 'Address',
        customFields: 'Custom fields',
        notes: 'Notes',
      },
      modal: {
        addTitle: 'New client',
        editTitle: 'Edit client',
        requiredError: 'Required fields: {{fields}}',
        saveError: 'Save error.',
        saveBtn: 'Save client',
      },
      detail: {
        contact: 'Contact',
        noContactInfo: 'No contact info.',
        contactPeople: 'Contact people',
        noContacts: 'No contacts added.',
        addContact: '+ Add contact',
        summary: 'Summary',
        totalPaid: 'Total paid',
        pending: 'Pending',
        invoicesCount: 'Invoices',
        addedAt: 'Added',
        modifiedAt: 'Modified',
        invoicesTitle: 'Invoices',
        newInvoiceShort: 'New',
        noInvoices: 'No invoices yet.',
        createFirstInvoice: 'Create first invoice →',
        dueShort: 'Due {{date}}',
        contactModal: {
          addTitle: 'New contact',
          editTitle: 'Edit contact',
          nameLabel: 'Name *',
          roleLabel: 'Role / Title',
          rolePlaceholder: 'Owner, Assistant, Manager...',
          phoneLabel: 'Phone',
          emailLabel: 'Email',
          notesLabel: 'Notes',
          notesPlaceholder: 'E.g. Only available in the mornings...',
          primaryLabel: 'Primary contact',
          addBtn: 'Add contact',
          confirmDelete: 'Delete this contact?',
        },
      },
      importModal: {
        title: 'Import clients',
        mapTitle: 'Map columns',
        previewTitle: 'Preview',
        doneTitle: 'Import complete!',
        uploadPrimary: 'Click to select a CSV file',
        uploadSecondary: 'Or drag and drop here',
        templatePromptTitle: 'Need the right format?',
        templatePromptSub: 'Download the example template',
        templateBtn: 'CSV template',
        mapDetected: '{{count}} rows detected',
        mapInstruction: 'Map each Amixos field to a column from your file.',
        customLabel: 'custom',
        noImport: "— Don't import —",
        viewData: 'View data',
        previewSummary: 'Showing the first {{shown}} of {{total}} rows.',
        importNRows: 'Import {{count}} client(s)',
        importDone: 'Import finished',
        importedCount: '{{count}} imported',
        errorsCount: '{{count}} with errors',
        errorsExplanation: 'Rows with errors were missing a "Name" or failed to save.',
        goToList: 'View clients',
        templateFilename: 'clients_template.csv',
      },
    },
    jobs: {
      title: 'Jobs',
      countTotal: '{{count}} total',
      pendingValue: '{{amount}} pending',
      inProgressValue: '{{amount}} in progress',
      completedValue: '{{amount}} completed',
      newDropdown: {
        trigger: 'New',
        jobOption: 'New job',
        jobOptionSub: 'Schedule a job directly',
        proposalOption: 'New proposal',
        proposalOptionSub: 'Quote before working',
      },
      searchPlaceholder: 'Search by name, client, number, city...',
      tabs: {
        all: 'All',
        proposals: 'Proposals',
        scheduled: 'Scheduled',
        in_progress: 'In progress',
        completed: 'Completed',
        invoiced: 'Invoiced',
        cancelled: 'Cancelled',
      },
      statuses: {
        proposal: 'Proposal',
        sent: 'Sent',
        accepted: 'Accepted',
        declined: 'Declined',
        scheduled: 'Scheduled',
        in_progress: 'In progress',
        completed: 'Completed',
        cancelled: 'Cancelled',
        invoiced: 'Invoiced',
      },
      priorities: {
        low: 'Low',
        normal: 'Normal',
        high: 'High',
        urgent: 'Urgent',
      },
      expired: '⚠ Expired',
      emptyNoMatch: 'No results.',
      emptyAll: 'No jobs yet.',
      createFirst: 'Create the first one →',
      dueShort: 'Due {{date}}',
      actions: {
        markSent: 'Mark sent',
        markAccepted: 'Accepted',
        markDeclined: 'Declined',
        schedule: 'Schedule',
        generateInvoice: 'Invoice',
        startWork: '▶ Start work',
        markCompleted: '✓ Mark completed',
        viewInvoice: 'View invoice',
        cancel: 'Cancel',
      },
      notFound: 'Job not found.',
    },
    dateLocale: 'en-US',
  },
};
