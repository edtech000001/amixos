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
        namePlaceholder: string;
        rolePlaceholder: string;
        roleLabel: string;
        phoneLabel: string;
        emailLabel: string;
        emailPlaceholder: string;
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
    detail: {
      // Header tooltips and small UI
      shareTooltip: string;
      shareCopied: string;
      printTooltip: string;
      editTooltip: string;
      deleteTooltip: string;
      generateInvoiceBtn: string;
      viewInvoiceBtn: string;
      // Pipeline action buttons (detail-specific phrasing)
      scheduleWork: string;
      invoiceDirectly: string;
      // Cancelled / declined banner
      cancelledBanner: string;
      declinedBanner: string;
      cancelledOn: string;
      reinstate: string;
      // Cards
      proposalHeading: string;
      issuedAt: string;
      validUntil: string;
      detailsHeading: string;
      scheduledDate: string;
      location: string;
      callClient: string;
      description: string;
      clientNote: string;
      internalNote: string;
      createdOn: string;
      createdBy: string;
      workersHeading: string;
      // Line items
      itemsHeadingProposal: string;
      itemsHeadingJob: string;
      noItems: string;
      colUnitPriceShort: string;
      tax: string;
      discount: string;
      totalEstimated: string;
      convertToInvoice: string;
      // Generate invoice modal
      genInvoiceTitle: string;
      summary: string;
      clientPrefix: string;
      itemsCountSingle: string;
      itemsCountPlural: string;
      draftStatusNote: string;
      createInvoiceBtn: string;
      // Delete confirmation modal
      deleteJobTitle: string;
      deleteJobConfirm: string;
      deleting: string;
      deleteBtn: string;
    };
    new: {
      headingNewJob: string;
      headingNewProposal: string;
      headingEditJob: string;
      headingEditProposal: string;
      subtitleNewJob: string;
      subtitleNewProposal: string;
      subtitleEdit: string;
      generalInfo: string;
      titleLabelJob: string;
      titleLabelProposal: string;
      titlePlaceholder: string;
      clientLabel: string;
      clientPlaceholder: string;
      clientSearchPlaceholder: string;
      clientNoResults: string;
      clientNone: string;
      issueDateLabel: string;
      expiryDateLabel: string;
      projectStartLabel: string;
      statusLabel: string;
      priorityLabel: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      locationHeading: string;
      mapLinkLabel: string;
      mapLinkPlaceholder: string;
      mapLinkHint: string;
      addressLabel: string;
      addressPlaceholder: string;
      cityLabel: string;
      cityPlaceholder: string;
      stateLabel: string;
      stateNone: string;
      scheduleHeading: string;
      dateLabel: string;
      timeStartLabel: string;
      timeEndLabel: string;
      workersHeading: string;
      additionalWorkersLabel: string;
      workerNumberPlaceholder: string;
      addWorker: string;
      itemsHeadingProposal: string;
      itemsHeadingJob: string;
      colType: string;
      colDescription: string;
      colQty: string;
      colUnitPrice: string;
      colTotal: string;
      itemTypeLabor: string;
      itemTypeMaterial: string;
      itemTypeEquipment: string;
      itemTypeOther: string;
      itemDescriptionPlaceholderProposal: string;
      itemDescriptionPlaceholderJob: string;
      subtotal: string;
      taxPercent: string;
      discountAmount: string;
      total: string;
      totalEstimated: string;
      notesHeading: string;
      clientNoteLabel: string;
      clientNotePlaceholder: string;
      internalNoteLabelProposal: string;
      internalNoteLabelJob: string;
      internalNotePlaceholderProposal: string;
      internalNotePlaceholderJob: string;
      errorTitleRequiredJob: string;
      errorTitleRequiredProposal: string;
      errorAtLeastOneItem: string;
      errorSaveGeneric: string;
      submitCreateJob: string;
      submitCreateProposal: string;
    };
  };
  employees: {
    title: string;
    summary: string;
    logHours: string;
    addBtn: string;
    tabs: {
      empleados: string;
      horas: string;
      nomina: string;
    };
    inactiveBadge: string;
    roles: {
      owner: string;
      manager: string;
      worker: string;
    };
    payTypes: {
      hourly: string;
      salary: string;
      daily: string;
    };
    payRateUnit: {
      hourly: string;
      salary: string;
      daily: string;
    };
    payRateUnitShort: {
      hourly: string;
      salary: string;
      daily: string;
    };
    emptyEmployees: string;
    addFirst: string;
    emptyTimesheets: string;
    emptyPayroll: string;
    timesheetCols: {
      worker: string;
      date: string;
      hours: string;
      work: string;
    };
    payroll: {
      summaryHeading: string;
      colEmployee: string;
      colHours: string;
      colRate: string;
      colTotal: string;
      monthlyTotal: string;
      unknownWorker: string;
    };
    modal: {
      addTitle: string;
      editTitle: string;
      firstNameLabel: string;
      firstNamePlaceholder: string;
      lastNameLabel: string;
      lastNamePlaceholder: string;
      phoneLabel: string;
      phonePlaceholder: string;
      roleLabel: string;
      payTypeLabel: string;
      payRateLabel: string;
      errorFirstNameRequired: string;
    };
    timesheetModal: {
      title: string;
      employeeLabel: string;
      employeeManualOption: string;
      workerNameLabel: string;
      workerNamePlaceholder: string;
      dateLabel: string;
      hoursLabel: string;
      hoursPlaceholder: string;
      jobDescriptionLabel: string;
      jobDescriptionPlaceholder: string;
      errorHoursRequired: string;
    };
  };
  inventory: {
    title: string;
    summary: string;
    summaryLowStock: string;
    addItem: string;
    lowStockBannerSingle: string;
    lowStockBannerPlural: string;
    lowStockBannerSuffix: string;
    lowStockBannerCta: string;
    filters: {
      all: string;
      lowStock: string;
    };
    searchPlaceholder: string;
    emptyNoMatch: string;
    emptyAll: string;
    addFirst: string;
    cols: {
      item: string;
      stock: string;
      unit: string;
      unitCost: string;
      actions: string;
    };
    itemMeta: {
      skuPrefix: string;
      minPrefix: string;
    };
    actions: {
      adjustStock: string;
    };
    confirmDelete: string;
    units: {
      unidad: string;
      pieza: string;
      kg: string;
      lb: string;
      metro: string;
      pie: string;
      litro: string;
      galon: string;
      caja: string;
      rollo: string;
      bolsa: string;
    };
    modal: {
      addTitle: string;
      editTitle: string;
      nameLabel: string;
      namePlaceholder: string;
      skuLabel: string;
      skuPlaceholder: string;
      categoryLabel: string;
      categoryPlaceholder: string;
      quantityLabel: string;
      unitLabel: string;
      unitCostLabel: string;
      lowStockThresholdLabel: string;
      errorNameRequired: string;
      errorSave: string;
    };
    adjustModal: {
      title: string;
      currentStock: string;
      addOption: string;
      removeOption: string;
      quantityLabel: string;
      quantityPlaceholder: string;
      errorInvalidQty: string;
    };
  };
  calendar: {
    title: string;
    newEvent: string;
    moreCount: string;
    noClient: string;
    eventTypes: {
      job: string;
      meeting: string;
      delivery: string;
      follow_up: string;
      other: string;
    };
    modal: {
      newEventTitle: string;
      titleLabel: string;
      titlePlaceholder: string;
      typeLabel: string;
      dateLabel: string;
      timeStartLabel: string;
      timeEndLabel: string;
      locationLabel: string;
      locationPlaceholder: string;
      clientLabel: string;
      noClientOption: string;
      notesLabel: string;
      notesPlaceholder: string;
      saveBtn: string;
      closeBtn: string;
    };
  };
  settings: {
    title: string;
    tabs: {
      negocio: string;
      trabajos: string;
      clientes: string;
      cuenta: string;
    };
    fieldTypes: {
      text: string;
      number: string;
      date: string;
      boolean: string;
      select: string;
    };
    pipelineSteps: {
      proposal: { label: string; description: string };
      sent: { label: string; description: string };
      accepted: { label: string; description: string };
      scheduled: { label: string; description: string };
      in_progress: { label: string; description: string };
      completed: { label: string; description: string };
      invoiced: { label: string; description: string };
    };
    business: {
      heading: string;
      subtitle: string;
      nameLabel: string;
      cityLabel: string;
      saveError: string;
      saveSuccess: string;
    };
    pipeline: {
      heading: string;
      subtitle: string;
      saveBtn: string;
      saveError: string;
      saveSuccess: string;
    };
    requiredFields: {
      heading: string;
      subtitle: string;
      saveBtn: string;
      saveError: string;
      saveSuccess: string;
    };
    customFields: {
      heading: string;
      subtitle: string;
      addBtn: string;
      emptyState: string;
      requiredBadge: string;
      addModalTitle: string;
      editModalTitle: string;
      fieldNameLabel: string;
      fieldNamePlaceholder: string;
      keyLabel: string;
      fieldTypeLabel: string;
      optionsLabel: string;
      optionsHint: string;
      optionsPlaceholder: string;
      requiredToggleLabel: string;
      addFieldBtn: string;
      errorNameRequired: string;
      errorDuplicate: string;
      errorSave: string;
      confirmDelete: string;
    };
    account: {
      heading: string;
      subtitle: string;
      emailLabel: string;
    };
    language: {
      heading: string;
      subtitle: string;
      label: string;
      savedNote: string;
    };
    password: {
      heading: string;
      subtitle: string;
      newPasswordLabel: string;
      newPasswordPlaceholder: string;
      saveBtn: string;
      errorMinLength: string;
      errorPrefix: string;
      successMsg: string;
    };
  };
  reports: {
    title: string;
    subtitle: string;
    ranges: {
      month: string;
      last_month: string;
      quarter: string;
      half: string;
      year: string;
      all: string;
    };
    kpis: {
      revenueCollected: string;
      pendingToCollect: string;
      avgJobValue: string;
      hoursLogged: string;
      paidInvoicesCountSingle: string;
      paidInvoicesCountPlural: string;
      noPaidInvoices: string;
      overdueSuffix: string;
      completedJobsCount: string;
      estPayrollSub: string;
    };
    sections: {
      revenueByMonth: string;
      invoiceStatus: string;
      jobsByStatus: string;
      hoursByEmployee: string;
      newClients: string;
      financialSummary: string;
      inventory: string;
    };
    chart: {
      revenueSeries: string;
      jobsSeries: string;
    };
    empty: {
      revenue: string;
      invoices: string;
      jobs: string;
      hours: string;
    };
    pieStatuses: {
      paid: string;
      sent: string;
      draft: string;
      overdue: string;
      cancelled: string;
    };
    invoicePie: {
      total: string;
    };
    jobsBreakdown: {
      seriesName: string;
      totalJobs: string;
      completionRate: string;
    };
    employees: {
      hoursSuffix: string;
      totalEstimatedPayroll: string;
      manualWorker: string;
    };
    newClientsBlock: {
      newCount: string;
      totalAccumulated: string;
    };
    financial: {
      revenueCollected: string;
      pending: string;
      overdue: string;
      estPayroll: string;
      grossMarginEst: string;
    };
    inventoryBlock: {
      totalValueLabel: string;
      totalItems: string;
      lowStock: string;
      outOfStock: string;
    };
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
          namePlaceholder: 'María López',
          roleLabel: 'Cargo / Rol',
          rolePlaceholder: 'Dueño, Asistente, Encargado...',
          phoneLabel: 'Teléfono',
          emailLabel: 'Correo',
          emailPlaceholder: 'maria@empresa.com',
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
      detail: {
        shareTooltip: 'Copiar enlace para compartir',
        shareCopied: 'Enlace copiado',
        printTooltip: 'Descargar PDF',
        editTooltip: 'Editar trabajo',
        deleteTooltip: 'Eliminar trabajo',
        generateInvoiceBtn: 'Generar factura',
        viewInvoiceBtn: 'Ver factura',
        scheduleWork: 'Programar trabajo',
        invoiceDirectly: 'Facturar directamente',
        cancelledBanner: 'Este trabajo fue cancelado.',
        declinedBanner: 'Esta propuesta fue rechazada.',
        cancelledOn: 'Cancelado el {{date}}',
        reinstate: 'Reactivar',
        proposalHeading: 'Propuesta',
        issuedAt: 'Emitida',
        validUntil: 'Válida hasta',
        detailsHeading: 'Detalles',
        scheduledDate: 'Fecha programada',
        location: 'Ubicación',
        callClient: '📞 Llamar a cliente',
        description: 'Descripción',
        clientNote: 'Nota para cliente',
        internalNote: '📝 Nota interna',
        createdOn: 'Creado el {{date}}',
        createdBy: 'por {{name}}',
        workersHeading: 'Trabajadores',
        itemsHeadingProposal: 'Detalle de servicios',
        itemsHeadingJob: 'Materiales y mano de obra',
        noItems: 'Sin ítems registrados.',
        colUnitPriceShort: 'P/u',
        tax: 'Impuesto ({{rate}}%)',
        discount: 'Descuento',
        totalEstimated: 'Total estimado',
        convertToInvoice: 'Convertir en factura',
        genInvoiceTitle: 'Generar factura',
        summary: 'Resumen',
        clientPrefix: 'Cliente: {{name}}',
        itemsCountSingle: '{{count}} ítem',
        itemsCountPlural: '{{count}} ítems',
        draftStatusNote: 'La factura se creará en estado <strong>Borrador</strong>. Puedes editarla antes de enviarla.',
        createInvoiceBtn: 'Crear factura →',
        deleteJobTitle: 'Eliminar trabajo',
        deleteJobConfirm: '¿Estás seguro de que deseas eliminar <strong>{{name}}</strong>? Esta acción no se puede deshacer.',
        deleting: 'Eliminando...',
        deleteBtn: 'Eliminar',
      },
      new: {
        headingNewJob: 'Nuevo trabajo',
        headingNewProposal: 'Nueva propuesta',
        headingEditJob: 'Editar trabajo',
        headingEditProposal: 'Editar propuesta',
        subtitleNewJob: 'Completa los detalles del trabajo',
        subtitleNewProposal: 'Crea una propuesta de precio para tu cliente',
        subtitleEdit: 'Modifica los detalles',
        generalInfo: 'Información general',
        titleLabelJob: 'Título del trabajo *',
        titleLabelProposal: 'Título *',
        titlePlaceholder: 'ej. Instalación de pivote — Rancho García',
        clientLabel: 'Cliente',
        clientPlaceholder: '— Sin cliente —',
        clientSearchPlaceholder: 'Buscar cliente...',
        clientNoResults: 'Sin resultados',
        clientNone: '— Sin cliente —',
        issueDateLabel: 'Fecha de emisión',
        expiryDateLabel: 'Válida hasta',
        projectStartLabel: 'Inicio del proyecto',
        statusLabel: 'Estado',
        priorityLabel: 'Prioridad',
        descriptionLabel: 'Descripción',
        descriptionPlaceholder: 'Detalle del trabajo a realizar...',
        locationHeading: 'Ubicación del trabajo',
        mapLinkLabel: 'Pegar enlace de mapa',
        mapLinkPlaceholder: 'https://maps.google.com/... o https://maps.apple.com/...',
        mapLinkHint: 'Pega un enlace de Google Maps o Apple Maps para auto-llenar la dirección',
        addressLabel: 'Dirección',
        addressPlaceholder: '123 County Road',
        cityLabel: 'Ciudad',
        cityPlaceholder: 'Omaha',
        stateLabel: 'Estado',
        stateNone: '—',
        scheduleHeading: 'Fecha y hora',
        dateLabel: 'Fecha',
        timeStartLabel: 'Hora inicio',
        timeEndLabel: 'Hora fin',
        workersHeading: 'Trabajadores asignados',
        additionalWorkersLabel: 'Trabajadores adicionales (manual)',
        workerNumberPlaceholder: 'Trabajador {{count}}',
        addWorker: '+ Agregar trabajador',
        itemsHeadingProposal: 'Servicios',
        itemsHeadingJob: 'Materiales y mano de obra',
        colType: 'Tipo',
        colDescription: 'Descripción',
        colQty: 'Cant.',
        colUnitPrice: 'Precio/u',
        colTotal: 'Total',
        itemTypeLabor: 'Mano de obra',
        itemTypeMaterial: 'Material',
        itemTypeEquipment: 'Equipo',
        itemTypeOther: 'Otro',
        itemDescriptionPlaceholderProposal: 'Descripción del servicio o material',
        itemDescriptionPlaceholderJob: 'Descripción',
        subtotal: 'Subtotal',
        taxPercent: 'Impuesto (%)',
        discountAmount: 'Descuento ($)',
        total: 'Total',
        totalEstimated: 'Total estimado',
        notesHeading: 'Notas',
        clientNoteLabel: 'Nota para el cliente',
        clientNotePlaceholder: 'Términos, condiciones, detalles adicionales para el cliente...',
        internalNoteLabelProposal: 'Nota interna',
        internalNoteLabelJob: 'Notas internas',
        internalNotePlaceholderProposal: 'Notas privadas (no visibles para el cliente)...',
        internalNotePlaceholderJob: 'Instrucciones especiales, detalles del sitio, acceso...',
        errorTitleRequiredJob: 'El título del trabajo es requerido',
        errorTitleRequiredProposal: 'El título es requerido',
        errorAtLeastOneItem: 'Agrega al menos un ítem',
        errorSaveGeneric: 'Error al guardar',
        submitCreateJob: 'Crear trabajo',
        submitCreateProposal: 'Crear propuesta',
      },
    },
    employees: {
      title: 'Empleados',
      summary: '{{active}} activos · {{hours}}h esta semana',
      logHours: 'Registrar horas',
      addBtn: 'Agregar',
      tabs: {
        empleados: 'Equipo',
        horas: 'Horas',
        nomina: 'Nómina',
      },
      inactiveBadge: 'Inactivo',
      roles: {
        owner: 'Dueño',
        manager: 'Gerente',
        worker: 'Trabajador',
      },
      payTypes: {
        hourly: 'Por hora',
        salary: 'Salario',
        daily: 'Por día',
      },
      payRateUnit: {
        hourly: '$/hr',
        salary: '$/mes',
        daily: '$/día',
      },
      payRateUnitShort: {
        hourly: 'hr',
        salary: 'mes',
        daily: 'día',
      },
      emptyEmployees: 'Aún no tienes empleados.',
      addFirst: 'Agrega el primero →',
      emptyTimesheets: 'Sin registros de horas.',
      emptyPayroll: 'Sin registros de horas este mes.',
      timesheetCols: {
        worker: 'Trabajador',
        date: 'Fecha',
        hours: 'Horas',
        work: 'Trabajo',
      },
      payroll: {
        summaryHeading: 'Resumen de nómina — {{month}}',
        colEmployee: 'Empleado',
        colHours: 'Horas',
        colRate: 'Tarifa',
        colTotal: 'Total',
        monthlyTotal: 'Total estimado del mes',
        unknownWorker: 'Desconocido',
      },
      modal: {
        addTitle: 'Nuevo empleado',
        editTitle: 'Editar empleado',
        firstNameLabel: 'Nombre *',
        firstNamePlaceholder: 'Juan',
        lastNameLabel: 'Apellido',
        lastNamePlaceholder: 'Pérez',
        phoneLabel: 'Teléfono',
        phonePlaceholder: '+1 (555) 000-0000',
        roleLabel: 'Puesto',
        payTypeLabel: 'Tipo de pago',
        payRateLabel: 'Tarifa ({{unit}})',
        errorFirstNameRequired: 'El nombre es requerido',
      },
      timesheetModal: {
        title: 'Registrar horas',
        employeeLabel: 'Empleado',
        employeeManualOption: 'Escribir nombre manualmente',
        workerNameLabel: 'Nombre del trabajador',
        workerNamePlaceholder: 'Juan Pérez',
        dateLabel: 'Fecha',
        hoursLabel: 'Horas trabajadas',
        hoursPlaceholder: '8',
        jobDescriptionLabel: 'Descripción del trabajo',
        jobDescriptionPlaceholder: 'Instalación de pivote, Sección Norte',
        errorHoursRequired: 'Las horas son requeridas',
      },
    },
    inventory: {
      title: 'Inventario',
      summary: '{{count}} artículos · Valor: {{value}}',
      summaryLowStock: '{{count}} bajo stock',
      addItem: 'Agregar artículo',
      lowStockBannerSingle: '{{count}} artículo',
      lowStockBannerPlural: '{{count}} artículos',
      lowStockBannerSuffix: 'por debajo del nivel mínimo.',
      lowStockBannerCta: 'Ver ahora',
      filters: {
        all: 'Todos',
        lowStock: '⚠️ Bajo stock',
      },
      searchPlaceholder: 'Buscar por nombre, SKU o categoría...',
      emptyNoMatch: 'Sin resultados.',
      emptyAll: 'Tu inventario está vacío.',
      addFirst: 'Agrega el primer artículo →',
      cols: {
        item: 'Artículo',
        stock: 'Stock',
        unit: 'Unidad',
        unitCost: 'Costo/u',
        actions: 'Acciones',
      },
      itemMeta: {
        skuPrefix: 'SKU: {{sku}}',
        minPrefix: 'Mín: {{min}}',
      },
      actions: {
        adjustStock: 'Ajustar stock',
      },
      confirmDelete: '¿Eliminar este artículo?',
      units: {
        unidad: 'unidad',
        pieza: 'pieza',
        kg: 'kg',
        lb: 'lb',
        metro: 'metro',
        pie: 'pie',
        litro: 'litro',
        galon: 'galón',
        caja: 'caja',
        rollo: 'rollo',
        bolsa: 'bolsa',
      },
      modal: {
        addTitle: 'Nuevo artículo',
        editTitle: 'Editar artículo',
        nameLabel: 'Nombre *',
        namePlaceholder: 'ej. Tubo galvanizado 2"',
        skuLabel: 'SKU / Código',
        skuPlaceholder: 'TG-001',
        categoryLabel: 'Categoría',
        categoryPlaceholder: 'Materiales, Herramientas...',
        quantityLabel: 'Cantidad inicial',
        unitLabel: 'Unidad',
        unitCostLabel: 'Costo por unidad ($)',
        lowStockThresholdLabel: 'Stock mínimo (alerta)',
        errorNameRequired: 'El nombre es requerido',
        errorSave: 'Error al guardar.',
      },
      adjustModal: {
        title: 'Ajustar stock — {{name}}',
        currentStock: 'Stock actual:',
        addOption: 'Entrada',
        removeOption: 'Salida',
        quantityLabel: 'Cantidad',
        quantityPlaceholder: '0',
        errorInvalidQty: 'Ingresa una cantidad válida',
      },
    },
    calendar: {
      title: 'Calendario',
      newEvent: 'Nuevo evento',
      moreCount: '+{{count}} más',
      noClient: 'Sin cliente',
      eventTypes: {
        job: 'Trabajo',
        meeting: 'Reunión',
        delivery: 'Entrega',
        follow_up: 'Seguimiento',
        other: 'Otro',
      },
      modal: {
        newEventTitle: 'Nuevo evento — {{date}}',
        titleLabel: 'Título *',
        titlePlaceholder: 'Instalación de pivote, reunión con cliente...',
        typeLabel: 'Tipo',
        dateLabel: 'Fecha',
        timeStartLabel: 'Inicio',
        timeEndLabel: 'Fin',
        locationLabel: 'Ubicación',
        locationPlaceholder: 'Dirección o descripción del lugar',
        clientLabel: 'Cliente (opcional)',
        noClientOption: 'Sin cliente',
        notesLabel: 'Notas',
        notesPlaceholder: 'Detalles adicionales...',
        saveBtn: 'Guardar evento',
        closeBtn: 'Cerrar',
      },
    },
    settings: {
      title: 'Ajustes',
      tabs: {
        negocio: 'Negocio',
        trabajos: 'Trabajos',
        clientes: 'Clientes',
        cuenta: 'Cuenta',
      },
      fieldTypes: {
        text: 'Texto',
        number: 'Número',
        date: 'Fecha',
        boolean: 'Sí / No',
        select: 'Lista de opciones',
      },
      pipelineSteps: {
        proposal: { label: 'Propuesta', description: 'Fase inicial de cotizaciones y propuestas' },
        sent: { label: 'Enviada', description: 'Propuesta enviada al cliente' },
        accepted: { label: 'Aceptada', description: 'Propuesta aceptada por el cliente' },
        scheduled: { label: 'Programado', description: 'Trabajo agendado con fecha' },
        in_progress: { label: 'En progreso', description: 'Trabajo actualmente en ejecución' },
        completed: { label: 'Completado', description: 'Trabajo terminado' },
        invoiced: { label: 'Facturado', description: 'Factura generada para el trabajo' },
      },
      business: {
        heading: 'Información del negocio',
        subtitle: 'Datos básicos de tu empresa.',
        nameLabel: 'Nombre del negocio',
        cityLabel: 'Ciudad',
        saveError: 'Error al guardar.',
        saveSuccess: '¡Guardado!',
      },
      pipeline: {
        heading: 'Etapas del proceso',
        subtitle: 'Desactiva las etapas que no uses en tu flujo de trabajo. Las etapas desactivadas no se mostrarán en el pipeline de trabajos.',
        saveBtn: 'Guardar configuración',
        saveError: 'Error al guardar.',
        saveSuccess: '¡Guardado!',
      },
      requiredFields: {
        heading: 'Campos obligatorios',
        subtitle: 'Elige cuáles campos son obligatorios al crear o editar un cliente.',
        saveBtn: 'Guardar preferencias',
        saveError: 'Error al guardar.',
        saveSuccess: '¡Guardado!',
      },
      customFields: {
        heading: 'Campos personalizados',
        subtitle: 'Campos extra que aparecen en el formulario de cada cliente.',
        addBtn: 'Agregar',
        emptyState: 'Sin campos personalizados.',
        requiredBadge: 'Requerido',
        addModalTitle: 'Nuevo campo personalizado',
        editModalTitle: 'Editar campo personalizado',
        fieldNameLabel: 'Nombre del campo *',
        fieldNamePlaceholder: 'ej. Número de contrato',
        keyLabel: 'Clave',
        fieldTypeLabel: 'Tipo de campo',
        optionsLabel: 'Opciones',
        optionsHint: '(una por línea)',
        optionsPlaceholder: 'Opción 1\nOpción 2\nOpción 3',
        requiredToggleLabel: 'Campo requerido',
        addFieldBtn: 'Agregar campo',
        errorNameRequired: 'El nombre del campo es requerido',
        errorDuplicate: 'Ya existe un campo con ese nombre',
        errorSave: 'Error al guardar.',
        confirmDelete: '¿Eliminar este campo? Los datos en clientes existentes se perderán.',
      },
      account: {
        heading: 'Cuenta',
        subtitle: 'Tu información de acceso.',
        emailLabel: 'Correo',
      },
      language: {
        heading: 'Idioma',
        subtitle: 'Elige el idioma para mostrar la interfaz.',
        label: 'Idioma de la interfaz',
        savedNote: 'Los cambios se aplican al instante.',
      },
      password: {
        heading: 'Cambiar contraseña',
        subtitle: 'Actualiza tu contraseña de acceso.',
        newPasswordLabel: 'Nueva contraseña',
        newPasswordPlaceholder: 'Mínimo 6 caracteres',
        saveBtn: 'Actualizar contraseña',
        errorMinLength: 'Mínimo 6 caracteres',
        errorPrefix: 'Error: {{message}}',
        successMsg: '¡Contraseña actualizada!',
      },
    },
    reports: {
      title: 'Reportes',
      subtitle: 'Analiza el rendimiento de tu negocio',
      ranges: {
        month: 'Este mes',
        last_month: 'Mes anterior',
        quarter: 'Últimos 3 meses',
        half: 'Últimos 6 meses',
        year: 'Este año',
        all: 'Todo el tiempo',
      },
      kpis: {
        revenueCollected: 'Ingresos cobrados',
        pendingToCollect: 'Pendiente de cobro',
        avgJobValue: 'Valor promedio/trabajo',
        hoursLogged: 'Horas registradas',
        paidInvoicesCountSingle: '{{count}} factura pagada',
        paidInvoicesCountPlural: '{{count}} facturas pagadas',
        noPaidInvoices: 'Sin facturas pagadas',
        overdueSuffix: '{{amount}} vencido',
        completedJobsCount: '{{count}} trabajos completados',
        estPayrollSub: 'Est. nómina: {{amount}}',
      },
      sections: {
        revenueByMonth: 'Ingresos por mes',
        invoiceStatus: 'Estado de facturas',
        jobsByStatus: 'Trabajos por estado',
        hoursByEmployee: 'Horas por empleado',
        newClients: 'Nuevos clientes',
        financialSummary: 'Resumen financiero',
        inventory: 'Inventario',
      },
      chart: {
        revenueSeries: 'Ingresos',
        jobsSeries: 'Trabajos',
      },
      empty: {
        revenue: 'Sin datos de ingresos en este período.',
        invoices: 'Sin facturas en este período.',
        jobs: 'Sin trabajos en este período.',
        hours: 'Sin registros de horas en este período.',
      },
      pieStatuses: {
        paid: 'Pagadas',
        sent: 'Enviadas',
        draft: 'Borrador',
        overdue: 'Vencidas',
        cancelled: 'Canceladas',
      },
      invoicePie: {
        total: 'Total',
      },
      jobsBreakdown: {
        seriesName: 'Trabajos',
        totalJobs: 'Total trabajos',
        completionRate: 'Tasa de completado',
      },
      employees: {
        hoursSuffix: '{{hours}}h',
        totalEstimatedPayroll: 'Total estimado nómina',
        manualWorker: 'Manual',
      },
      newClientsBlock: {
        newCount: 'clientes nuevos',
        totalAccumulated: '{{count}} total acumulado',
      },
      financial: {
        revenueCollected: 'Ingresos cobrados',
        pending: 'Por cobrar',
        overdue: 'Vencido',
        estPayroll: 'Nómina estimada',
        grossMarginEst: 'Margen bruto est.',
      },
      inventoryBlock: {
        totalValueLabel: 'valor total en inventario',
        totalItems: 'Artículos totales',
        lowStock: 'Bajo stock',
        outOfStock: 'Sin stock',
      },
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
          namePlaceholder: 'Jane Smith',
          roleLabel: 'Role / Title',
          rolePlaceholder: 'Owner, Assistant, Manager...',
          phoneLabel: 'Phone',
          emailLabel: 'Email',
          emailPlaceholder: 'jane@company.com',
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
      detail: {
        shareTooltip: 'Copy share link',
        shareCopied: 'Link copied',
        printTooltip: 'Download PDF',
        editTooltip: 'Edit job',
        deleteTooltip: 'Delete job',
        generateInvoiceBtn: 'Generate invoice',
        viewInvoiceBtn: 'View invoice',
        scheduleWork: 'Schedule work',
        invoiceDirectly: 'Invoice directly',
        cancelledBanner: 'This job was cancelled.',
        declinedBanner: 'This proposal was declined.',
        cancelledOn: 'Cancelled on {{date}}',
        reinstate: 'Reinstate',
        proposalHeading: 'Proposal',
        issuedAt: 'Issued',
        validUntil: 'Valid until',
        detailsHeading: 'Details',
        scheduledDate: 'Scheduled date',
        location: 'Location',
        callClient: '📞 Call client',
        description: 'Description',
        clientNote: 'Note for client',
        internalNote: '📝 Internal note',
        createdOn: 'Created on {{date}}',
        createdBy: 'by {{name}}',
        workersHeading: 'Workers',
        itemsHeadingProposal: 'Service details',
        itemsHeadingJob: 'Materials and labor',
        noItems: 'No items recorded.',
        colUnitPriceShort: 'U/p',
        tax: 'Tax ({{rate}}%)',
        discount: 'Discount',
        totalEstimated: 'Estimated total',
        convertToInvoice: 'Convert to invoice',
        genInvoiceTitle: 'Generate invoice',
        summary: 'Summary',
        clientPrefix: 'Client: {{name}}',
        itemsCountSingle: '{{count}} item',
        itemsCountPlural: '{{count}} items',
        draftStatusNote: 'The invoice will be created as a <strong>Draft</strong>. You can edit it before sending.',
        createInvoiceBtn: 'Create invoice →',
        deleteJobTitle: 'Delete job',
        deleteJobConfirm: 'Are you sure you want to delete <strong>{{name}}</strong>? This action cannot be undone.',
        deleting: 'Deleting...',
        deleteBtn: 'Delete',
      },
      new: {
        headingNewJob: 'New job',
        headingNewProposal: 'New proposal',
        headingEditJob: 'Edit job',
        headingEditProposal: 'Edit proposal',
        subtitleNewJob: 'Fill in the job details',
        subtitleNewProposal: 'Create a price proposal for your client',
        subtitleEdit: 'Modify the details',
        generalInfo: 'General info',
        titleLabelJob: 'Job title *',
        titleLabelProposal: 'Title *',
        titlePlaceholder: 'e.g. Pivot installation — Rancho García',
        clientLabel: 'Client',
        clientPlaceholder: '— No client —',
        clientSearchPlaceholder: 'Search client...',
        clientNoResults: 'No results',
        clientNone: '— No client —',
        issueDateLabel: 'Issue date',
        expiryDateLabel: 'Valid until',
        projectStartLabel: 'Project start',
        statusLabel: 'Status',
        priorityLabel: 'Priority',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'Details of the work to be done...',
        locationHeading: 'Job location',
        mapLinkLabel: 'Paste map link',
        mapLinkPlaceholder: 'https://maps.google.com/... or https://maps.apple.com/...',
        mapLinkHint: 'Paste a Google Maps or Apple Maps link to auto-fill the address',
        addressLabel: 'Address',
        addressPlaceholder: '123 County Road',
        cityLabel: 'City',
        cityPlaceholder: 'Omaha',
        stateLabel: 'State',
        stateNone: '—',
        scheduleHeading: 'Date and time',
        dateLabel: 'Date',
        timeStartLabel: 'Start time',
        timeEndLabel: 'End time',
        workersHeading: 'Assigned workers',
        additionalWorkersLabel: 'Additional workers (manual)',
        workerNumberPlaceholder: 'Worker {{count}}',
        addWorker: '+ Add worker',
        itemsHeadingProposal: 'Services',
        itemsHeadingJob: 'Materials and labor',
        colType: 'Type',
        colDescription: 'Description',
        colQty: 'Qty',
        colUnitPrice: 'Unit price',
        colTotal: 'Total',
        itemTypeLabor: 'Labor',
        itemTypeMaterial: 'Material',
        itemTypeEquipment: 'Equipment',
        itemTypeOther: 'Other',
        itemDescriptionPlaceholderProposal: 'Description of the service or material',
        itemDescriptionPlaceholderJob: 'Description',
        subtotal: 'Subtotal',
        taxPercent: 'Tax (%)',
        discountAmount: 'Discount ($)',
        total: 'Total',
        totalEstimated: 'Estimated total',
        notesHeading: 'Notes',
        clientNoteLabel: 'Note for client',
        clientNotePlaceholder: 'Terms, conditions, additional details for the client...',
        internalNoteLabelProposal: 'Internal note',
        internalNoteLabelJob: 'Internal notes',
        internalNotePlaceholderProposal: 'Private notes (not visible to the client)...',
        internalNotePlaceholderJob: 'Special instructions, site details, access...',
        errorTitleRequiredJob: 'Job title is required',
        errorTitleRequiredProposal: 'Title is required',
        errorAtLeastOneItem: 'Add at least one item',
        errorSaveGeneric: 'Save error',
        submitCreateJob: 'Create job',
        submitCreateProposal: 'Create proposal',
      },
    },
    employees: {
      title: 'Employees',
      summary: '{{active}} active · {{hours}}h this week',
      logHours: 'Log hours',
      addBtn: 'Add',
      tabs: {
        empleados: 'Team',
        horas: 'Hours',
        nomina: 'Payroll',
      },
      inactiveBadge: 'Inactive',
      roles: {
        owner: 'Owner',
        manager: 'Manager',
        worker: 'Worker',
      },
      payTypes: {
        hourly: 'Hourly',
        salary: 'Salary',
        daily: 'Daily',
      },
      payRateUnit: {
        hourly: '$/hr',
        salary: '$/mo',
        daily: '$/day',
      },
      payRateUnitShort: {
        hourly: 'hr',
        salary: 'mo',
        daily: 'day',
      },
      emptyEmployees: "You don't have any employees yet.",
      addFirst: 'Add the first one →',
      emptyTimesheets: 'No hours logged yet.',
      emptyPayroll: 'No hours logged this month.',
      timesheetCols: {
        worker: 'Worker',
        date: 'Date',
        hours: 'Hours',
        work: 'Work',
      },
      payroll: {
        summaryHeading: 'Payroll summary — {{month}}',
        colEmployee: 'Employee',
        colHours: 'Hours',
        colRate: 'Rate',
        colTotal: 'Total',
        monthlyTotal: 'Estimated monthly total',
        unknownWorker: 'Unknown',
      },
      modal: {
        addTitle: 'New employee',
        editTitle: 'Edit employee',
        firstNameLabel: 'First name *',
        firstNamePlaceholder: 'John',
        lastNameLabel: 'Last name',
        lastNamePlaceholder: 'Doe',
        phoneLabel: 'Phone',
        phonePlaceholder: '+1 (555) 000-0000',
        roleLabel: 'Role',
        payTypeLabel: 'Pay type',
        payRateLabel: 'Rate ({{unit}})',
        errorFirstNameRequired: 'First name is required',
      },
      timesheetModal: {
        title: 'Log hours',
        employeeLabel: 'Employee',
        employeeManualOption: 'Type name manually',
        workerNameLabel: 'Worker name',
        workerNamePlaceholder: 'John Doe',
        dateLabel: 'Date',
        hoursLabel: 'Hours worked',
        hoursPlaceholder: '8',
        jobDescriptionLabel: 'Job description',
        jobDescriptionPlaceholder: 'Pivot installation, North section',
        errorHoursRequired: 'Hours are required',
      },
    },
    inventory: {
      title: 'Inventory',
      summary: '{{count}} items · Value: {{value}}',
      summaryLowStock: '{{count}} low stock',
      addItem: 'Add item',
      lowStockBannerSingle: '{{count}} item',
      lowStockBannerPlural: '{{count}} items',
      lowStockBannerSuffix: 'below the minimum level.',
      lowStockBannerCta: 'View now',
      filters: {
        all: 'All',
        lowStock: '⚠️ Low stock',
      },
      searchPlaceholder: 'Search by name, SKU, or category...',
      emptyNoMatch: 'No results.',
      emptyAll: 'Your inventory is empty.',
      addFirst: 'Add the first item →',
      cols: {
        item: 'Item',
        stock: 'Stock',
        unit: 'Unit',
        unitCost: 'Cost/u',
        actions: 'Actions',
      },
      itemMeta: {
        skuPrefix: 'SKU: {{sku}}',
        minPrefix: 'Min: {{min}}',
      },
      actions: {
        adjustStock: 'Adjust stock',
      },
      confirmDelete: 'Delete this item?',
      units: {
        unidad: 'unit',
        pieza: 'piece',
        kg: 'kg',
        lb: 'lb',
        metro: 'meter',
        pie: 'foot',
        litro: 'liter',
        galon: 'gallon',
        caja: 'box',
        rollo: 'roll',
        bolsa: 'bag',
      },
      modal: {
        addTitle: 'New item',
        editTitle: 'Edit item',
        nameLabel: 'Name *',
        namePlaceholder: 'e.g. 2" galvanized pipe',
        skuLabel: 'SKU / Code',
        skuPlaceholder: 'TG-001',
        categoryLabel: 'Category',
        categoryPlaceholder: 'Materials, Tools...',
        quantityLabel: 'Initial quantity',
        unitLabel: 'Unit',
        unitCostLabel: 'Unit cost ($)',
        lowStockThresholdLabel: 'Low stock threshold',
        errorNameRequired: 'Name is required',
        errorSave: 'Save error.',
      },
      adjustModal: {
        title: 'Adjust stock — {{name}}',
        currentStock: 'Current stock:',
        addOption: 'Stock in',
        removeOption: 'Stock out',
        quantityLabel: 'Quantity',
        quantityPlaceholder: '0',
        errorInvalidQty: 'Enter a valid quantity',
      },
    },
    calendar: {
      title: 'Calendar',
      newEvent: 'New event',
      moreCount: '+{{count}} more',
      noClient: 'No client',
      eventTypes: {
        job: 'Job',
        meeting: 'Meeting',
        delivery: 'Delivery',
        follow_up: 'Follow-up',
        other: 'Other',
      },
      modal: {
        newEventTitle: 'New event — {{date}}',
        titleLabel: 'Title *',
        titlePlaceholder: 'Pivot installation, client meeting...',
        typeLabel: 'Type',
        dateLabel: 'Date',
        timeStartLabel: 'Start',
        timeEndLabel: 'End',
        locationLabel: 'Location',
        locationPlaceholder: 'Address or place description',
        clientLabel: 'Client (optional)',
        noClientOption: 'No client',
        notesLabel: 'Notes',
        notesPlaceholder: 'Additional details...',
        saveBtn: 'Save event',
        closeBtn: 'Close',
      },
    },
    settings: {
      title: 'Settings',
      tabs: {
        negocio: 'Business',
        trabajos: 'Jobs',
        clientes: 'Clients',
        cuenta: 'Account',
      },
      fieldTypes: {
        text: 'Text',
        number: 'Number',
        date: 'Date',
        boolean: 'Yes / No',
        select: 'Dropdown list',
      },
      pipelineSteps: {
        proposal: { label: 'Proposal', description: 'Initial quote and proposal phase' },
        sent: { label: 'Sent', description: 'Proposal sent to client' },
        accepted: { label: 'Accepted', description: 'Proposal accepted by client' },
        scheduled: { label: 'Scheduled', description: 'Job scheduled with a date' },
        in_progress: { label: 'In progress', description: 'Job currently in execution' },
        completed: { label: 'Completed', description: 'Job finished' },
        invoiced: { label: 'Invoiced', description: 'Invoice generated for the job' },
      },
      business: {
        heading: 'Business info',
        subtitle: 'Basic information about your company.',
        nameLabel: 'Business name',
        cityLabel: 'City',
        saveError: 'Save error.',
        saveSuccess: 'Saved!',
      },
      pipeline: {
        heading: 'Process stages',
        subtitle: "Disable the stages you don't use in your workflow. Disabled stages won't appear in the jobs pipeline.",
        saveBtn: 'Save configuration',
        saveError: 'Save error.',
        saveSuccess: 'Saved!',
      },
      requiredFields: {
        heading: 'Required fields',
        subtitle: 'Choose which fields are required when creating or editing a client.',
        saveBtn: 'Save preferences',
        saveError: 'Save error.',
        saveSuccess: 'Saved!',
      },
      customFields: {
        heading: 'Custom fields',
        subtitle: "Extra fields that appear in each client's form.",
        addBtn: 'Add',
        emptyState: 'No custom fields.',
        requiredBadge: 'Required',
        addModalTitle: 'New custom field',
        editModalTitle: 'Edit custom field',
        fieldNameLabel: 'Field name *',
        fieldNamePlaceholder: 'e.g. Contract number',
        keyLabel: 'Key',
        fieldTypeLabel: 'Field type',
        optionsLabel: 'Options',
        optionsHint: '(one per line)',
        optionsPlaceholder: 'Option 1\nOption 2\nOption 3',
        requiredToggleLabel: 'Required field',
        addFieldBtn: 'Add field',
        errorNameRequired: 'Field name is required',
        errorDuplicate: 'A field with that name already exists',
        errorSave: 'Save error.',
        confirmDelete: 'Delete this field? Data in existing clients will be lost.',
      },
      account: {
        heading: 'Account',
        subtitle: 'Your sign-in information.',
        emailLabel: 'Email',
      },
      language: {
        heading: 'Language',
        subtitle: 'Choose your interface display language.',
        label: 'Interface language',
        savedNote: 'Changes apply instantly.',
      },
      password: {
        heading: 'Change password',
        subtitle: 'Update your sign-in password.',
        newPasswordLabel: 'New password',
        newPasswordPlaceholder: 'At least 6 characters',
        saveBtn: 'Update password',
        errorMinLength: 'At least 6 characters',
        errorPrefix: 'Error: {{message}}',
        successMsg: 'Password updated!',
      },
    },
    reports: {
      title: 'Reports',
      subtitle: 'Analyze your business performance',
      ranges: {
        month: 'This month',
        last_month: 'Last month',
        quarter: 'Last 3 months',
        half: 'Last 6 months',
        year: 'This year',
        all: 'All time',
      },
      kpis: {
        revenueCollected: 'Revenue collected',
        pendingToCollect: 'Pending to collect',
        avgJobValue: 'Avg. job value',
        hoursLogged: 'Hours logged',
        paidInvoicesCountSingle: '{{count}} paid invoice',
        paidInvoicesCountPlural: '{{count}} paid invoices',
        noPaidInvoices: 'No paid invoices',
        overdueSuffix: '{{amount}} overdue',
        completedJobsCount: '{{count}} completed jobs',
        estPayrollSub: 'Est. payroll: {{amount}}',
      },
      sections: {
        revenueByMonth: 'Revenue by month',
        invoiceStatus: 'Invoice status',
        jobsByStatus: 'Jobs by status',
        hoursByEmployee: 'Hours by employee',
        newClients: 'New clients',
        financialSummary: 'Financial summary',
        inventory: 'Inventory',
      },
      chart: {
        revenueSeries: 'Revenue',
        jobsSeries: 'Jobs',
      },
      empty: {
        revenue: 'No revenue data for this period.',
        invoices: 'No invoices in this period.',
        jobs: 'No jobs in this period.',
        hours: 'No hours logged in this period.',
      },
      pieStatuses: {
        paid: 'Paid',
        sent: 'Sent',
        draft: 'Draft',
        overdue: 'Overdue',
        cancelled: 'Cancelled',
      },
      invoicePie: {
        total: 'Total',
      },
      jobsBreakdown: {
        seriesName: 'Jobs',
        totalJobs: 'Total jobs',
        completionRate: 'Completion rate',
      },
      employees: {
        hoursSuffix: '{{hours}}h',
        totalEstimatedPayroll: 'Total estimated payroll',
        manualWorker: 'Manual',
      },
      newClientsBlock: {
        newCount: 'new clients',
        totalAccumulated: '{{count}} total accumulated',
      },
      financial: {
        revenueCollected: 'Revenue collected',
        pending: 'Outstanding',
        overdue: 'Overdue',
        estPayroll: 'Estimated payroll',
        grossMarginEst: 'Gross margin est.',
      },
      inventoryBlock: {
        totalValueLabel: 'total inventory value',
        totalItems: 'Total items',
        lowStock: 'Low stock',
        outOfStock: 'Out of stock',
      },
    },
    dateLocale: 'en-US',
  },
};
