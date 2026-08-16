import { Locale } from '../locales';

export type DashboardDict = {
  sidebar: {
    inicio: string;
    trabajos: string;
    clientes: string;
    facturas: string;
    empleados: string;
    equipo: string;
    calendario: string;
    inventario: string;
    archivos: string;
    reportes: string;
    ajustes: string;
    mas: string;
    logout: string;
    /** Section header for enabled INDUSTRY modules (registry category
     *  'industry') — each is effectively its own app inside Amixos. */
    appsSection: string;
    collapseSidebar: string;
    expandSidebar: string;
    // Short one-liners shown under each label on mobile's Más list. Keeps
    // that menu visually consistent with Ajustes (card with description).
    descriptions: {
      clientes: string;
      trabajos: string;
      facturas: string;
      empleados: string;
      equipo: string;
      calendario: string;
      inventario: string;
      archivos: string;
      reportes: string;
      tienda: string;
      ajustes: string;
    };
  };
  // Purpose-built home for the "field" role (crew). Replaces the widget grid.
  fieldHome: {
    greeting: string;
    clockIn: string;
    clockOut: string;
    clockedInSince: string;
    notClockedIn: string;
    clockError: string;
    todayTitle: string;
    upcomingTitle: string;
    empty: string;
    lead: string;
    start: string;
    complete: string;
    noClient: string;
    noDate: string;
    summaryTitle: string;
    statAssigned: string;
    statCompleted: string;
    statHoursWeek: string;
    statHoursMonth: string;
    statActiveHours: string;
    hoursToggleActive: string;
    hoursToggleWeek: string;
    hoursToggleMonth: string;
    recentCompletedTitle: string;
    logJob: string;
    logTitle: string;
    jobTitleLabel: string;
    jobTitlePlaceholder: string;
    clientLabel: string;
    clientSearch: string;
    noClientOption: string;
    dateLabel: string;
    notesLabel: string;
    titleRequired: string;
    saveError2: string;
    saved: string;
    noResults: string;
    locCapturing: string;
    locUnavailable: string;
  };
  roles: {
    title: string;
    subtitle: string;
    entry: string;
    ownerLocked: string;
    customized: string;
    reset: string;
    resetConfirm: string;
    saved: string;
    saveError: string;
    sectionData: string;
    sectionSystem: string;
    colView: string;
    colCreate: string;
    colEdit: string;
    colDelete: string;
    scopeNone: string;
    scopeAssigned: string;
    scopeAll: string;
    resourceNames: { jobs: string; clients: string; invoices: string; employees: string; calendar: string; inventory: string; equipment: string; rentals: string; reports: string };
    capNames: { manageSettings: string; manageMembers: string; viewAuditLog: string; viewAllTimesheets: string; assignWorkers: string; createEstimates: string; clockInOut: string; scheduleJobs: string; completedByDefault: string; switchLocations: string };
    newRole: string;
    newRoleTitle: string;
    roleNameLabel: string;
    roleNamePlaceholder: string;
    baseRoleLabel: string;
    createBtn: string;
    createError: string;
    customRoleDesc: string;
    customRoleBadge: string;
    renameRole: string;
    renameRoleTitle: string;
    deleteRole: string;
    deleteRoleConfirm: string;
    deleteRoleInUse: string;
    deleteRoleError: string;
  };
  home: {
    welcome: string;
    newInvoice: string;
    // Customizable widget dashboard (migration 049). `customize` is the
    // edit mode UI; `widgetNames` are the display names used both on the
    // cards and in the add-widget panel — keys match DashboardWidgetId.
    customize: {
      editBtn: string;
      doneBtn: string;
      dragHint: string;
      hideLabel: string;
      addTitle: string;
      addEmpty: string;
      saveError: string;
      // Widget size options (segmented control in edit mode). The single
      // letter shown in the control is derived from the first character.
      sizes: {
        sm: string;
        md: string;
        lg: string;
      };
    };
    widgetNames: {
      quickActions: string;
      earningsMonth: string;
      invoicesPending: string;
      clientsTotal: string;
      invoicesOverdue: string;
      clockedIn: string;
      earningsYear: string;
      jobsActive: string;
      monthlyChart: string;
      upcomingJobs: string;
      recentInvoices: string;
    };
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
      jobsActiveLabel: string;
      jobsActiveSub: string;
      // Extra context lines shown on md/lg sized earnings widgets.
      vsLastMonth: string;
      avgPerMonth: string;
    };
    quickActions: {
      newInvoice: string;
      newClient: string;
      newJob: string;
      calendar: string;
    };
    monthlyChart: {
      title: string;
      empty: string;
      totalLabel: string;
      avgLabel: string;
    };
    upcomingJobs: {
      title: string;
      viewAll: string;
      empty: string;
      noClient: string;
      today: string;
      tomorrow: string;
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
    total_loss: string;
  };
  invoices: {
    title: string;
    countTotal: string;
    countFound: string;
    selectButton: string;
    selectAll: string;
    bulkDelete: string;
    confirmDeleteBulk: string;
    selectedCountSingle: string;
    selectedCountPlural: string;
    newInvoice: string;
    filters: {
      all: string;
      drafts: string;
      sent: string;
      paid: string;
      overdue: string;
      totalLoss: string;
    };
    filters2: {
      button: string;
      title: string;
      company: string;
      state: string;
      allCompanies: string;
      allStates: string;
      clear: string;
    };
    group: {
      button: string;
      title: string;
      none: string;
      company: string;
      state: string;
      status: string;
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
    undoSent: string;
    markPaid: string;
    markTotalLoss: string;
    markTotalLossConfirm: string;
    reinstateInvoice: string;
    daysOverdue: string;
    overdueAgo: string;
    sentAgo: string;
    sentToday: string;
    payments: {
      title: string;
      recordTitle: string;
      editTitle: string;
      recordBtn: string;
      amountLabel: string;
      fullAmountBtn: string;
      methodLabel: string;
      dateLabel: string;
      remaining: string;
      partialPill: string;
      paidInFullHint: string;
      deleteConfirm: string;
      undoPaid: string;
      undoPaidConfirm: string;
      otherPlaceholder: string;
      addPhoto: string;
      changePhoto: string;
      removePhoto: string;
      photoLabel: string;
      methods: { cash: string; check: string; card: string; transfer: string; zelle: string; cashapp: string; venmo: string; paypal: string; moneyOrder: string; other: string };
    };
    sendInvoice: string;
    emailSubject: string;
    emailBody: string;
    sendNoEmail: string;
    createdLabel: string;
    moreActionsTitle: string;
    shareLinkAction: string;
    clientPrices: {
      viewBtn: string;
      title: string;
      flatWord: string;
      tierNote: string;
    };
    autonameBtn: string;
    autonameDone: string;
    autonameNone: string;
    lastEditedLabel: string;
    byUser: string;
    print: string;
    linkCopied: string;
    notFound: string;
    editTitle: string;
    deleteTitle: string;
    deleteConfirm: string;
    jobsSection: {
      title: string;
      empty: string;
      addBtn: string;
      removeBtn: string;
      moveBtn: string;
      clearPricesBtn: string;
      serviceDateLabel: string;
      excludeHint: string;
      sortByDateBtn: string;
      clearPricesConfirm: string;
      linkBtn: string;
      linkTitle: string;
      moveTitle: string;
      moveEmpty: string;
      addTitle: string;
      addEmpty: string;
      addSearchPlaceholder: string;
      addConfirm: string;
      manualHeading: string;
      manualDescPlaceholder: string;
      manualAddBtn: string;
      jobsHeading: string;
      removeItemConfirm: string;
      editItemTitle: string;
      viewProject: string;
      previewDescription: string;
      previewNoDescription: string;
      previewNotes: string;
    };
    deleting: string;
    errorDelete: string;
    new: {
      heading: string;
      headingEdit: string;
      subtitleNew: string;
      subtitleEdit: string;
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
      notesUseDefault: string;
      notesCustom: string;
      internalNotesLabel: string;
      internalNotesPlaceholder: string;
      customFieldsHeading: string;
      errorAtLeastOne: string;
      errorRequiredField: string;
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
    countFound: string;
    newClient: string;
    group: {
      button: string;
      title: string;
      name: string;
      company: string;
      state: string;
      city: string;
      noCompany: string;
      noState: string;
      noCity: string;
      noValue: string;
    };
    importBtn: string;
    importHint: string;
    searchPlaceholder: string;
    selectButton: string;
    selectAll: string;
    selectAllShort: string;
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
      actionCall: string;
      actionText: string;
      actionEmail: string;
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
      shareTitle: string;
      sharePdfBtn: string;
      shareCsvBtn: string;
      shareDialogTitle: string;
      shareDialogBasic: string;
      shareDialogAll: string;
      pdfInvoicesHeading: string;
      pdfInvoicesTotal: string;
      pdfGeneratedOn: string;
      shareError: string;
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
        ccLabel: string;
        ccBadge: string;
        addBtn: string;
        confirmDelete: string;
      };
      commLog: {
        heading: string;
        lastContacted: string;
        neverContacted: string;
        add: string;
        empty: string;
        emptyFiltered: string;
        withContact: string;
        types: {
          call: string;
          sms: string;
          email: string;
          in_person: string;
          whatsapp: string;
          note: string;
        };
        outcomes: {
          connected: string;
          no_answer: string;
          sent: string;
          left_voicemail: string;
        };
        prompt: {
          callTitle: string;
          smsTitle: string;
          emailTitle: string;
          connected: string;
          noAnswer: string;
          sent: string;
          dontLog: string;
        };
        form: {
          addTitle: string;
          editTitle: string;
          typeLabel: string;
          outcomeLabel: string;
          outcomeNone: string;
          directionLabel: string;
          directionOutbound: string;
          directionInbound: string;
          dateLabel: string;
          noteLabel: string;
          notePlaceholder: string;
          contactLabel: string;
          contactNone: string;
          save: string;
          cancel: string;
          confirmDelete: string;
          delete: string;
          edit: string;
        };
        rel: {
          now: string;
          minute: string;
          minutes: string;
          hour: string;
          hours: string;
          day: string;
          days: string;
          week: string;
          weeks: string;
          month: string;
          months: string;
          year: string;
          years: string;
        };
      };
    };
    importModal: {
      title: string;
      colAdded: string;
      colEdited: string;
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
      // Mobile-only entry points on the upload step
      pickFileBtn: string;
      pickFileHint: string;
      importContactsBtn: string;
      importContactsHint: string;
      contactsPermissionDenied: string;
      contactsImportedCount: string;
    };
  };
  jobs: {
    title: string;
    countTotal: string;
    countFound: string;
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
    clearFilters: string;
    selectButton: string;
    bulkDelete: string;
    bulkArchive: string;
    bulkUnarchive: string;
    bulkMoveClient: string;
    confirmArchiveBulk: string;
    archiveDisabledHint: string;
    archivedBadge: string;
    confirmDeleteBulk: string;
    batchInvoice: {
      selectButton: string;
      cancel: string;
      createButton: string;
      creating: string;
      selectedCount: string;
      sameClientHint: string;
      multiClientHint: string;
      createdMultiple: string;
      multiConfirmTitle: string;
      multiConfirmCreate: string;
      selectAll: string;
      deselectAll: string;
    };
    // Sort + group control on the jobs list. `group.state` means the US
    // state (location), not job status — keep the labels disambiguated.
    sort: {
      button: string;
      title: string;
      sortByTitle: string;
      groupByTitle: string;
      by: {
        recent: string;
        status: string;
        startDate: string;
        priority: string;
        updated: string;
        title: string;
        endDate: string;
        client: string;
        lead: string;
      };
      group: {
        none: string;
        client: string;
        lead: string;
        company: string;
        state: string;
      };
      noClient: string;
      noLead: string;
      noCompany: string;
      noState: string;
    };
    dateFilter: {
      button: string;
      title: string;
      from: string;
      to: string;
      today: string;
      yesterday: string;
      last2Days: string;
      last5Days: string;
      apply: string;
      clear: string;
      summary: string;
    };
    tabs: {
      all: string;
      proposals: string;
      posible: string;
      scheduled: string;
      in_progress: string;
      completed: string;
      invoiced: string;
      cancelled: string;
      archived: string;
    };
    statuses: {
      proposal: string;
      sent: string;
      accepted: string;
      declined: string;
      posible: string;
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
    leadPrefix: string;
    emptyNoMatch: string;
    emptyAll: string;
    createFirst: string;
    dueShort: string;
    alertChip: {
      today: string;
      tomorrow: string;
      inDays: string;
    };
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
      duplicateTooltip: string;
      duplicateAskTitle: string;
      duplicateFullOption: string;
      duplicateTeamOption: string;
      deleteTooltip: string;
      sendAction: string;
      sendActionMessage: string;
      markOnly: string;
      shareError: string;
      statusUpdateError: string;
      generateInvoiceBtn: string;
      viewInvoiceBtn: string;
      unInvoiceBtn: string;
      unInvoiceConfirm: string;
      unInvoiceSentWarning: string;
      unInvoiceDeleteEmpty: string;
      editItemsBtn: string;
      addItemsBtn: string;
      // Estimated labor cost card (completed jobs; Employees-permission gated)
      laborCost: {
        title: string;
        totalLabel: string;
        hoursShort: string;
        salariedNote: string;
        hint: string;
        showBreakdown: string;
        hideBreakdown: string;
      };
      // Pipeline action buttons (detail-specific phrasing)
      scheduleWork: string;
      invoiceDirectly: string;
      // Cancelled / declined banner
      cancelledBanner: string;
      declinedBanner: string;
      declinedByClientBanner: string;
      cancelledOn: string;
      declinedOn: string;
      reinstate: string;
      // Email estimate + client approval proof
      emailAction: string;
      emailTooltip: string;
      sendNoEmail: string;
      emailSubject: string;
      emailBody: string;
      approvalTitle: string;
      signedByLine: string;
      cancelSignedConfirm: string;
      backStepSignedConfirm: string;
      signOnSite: string;
      signOnSiteHint: string;
      schedulePromptHint: string;
      // Job documents
      documentsHeading: string;
      addDocumentBtn: string;
      noDocuments: string;
      docTooBig: string;
      docLimitReached: string;
      docStorageFull: string;
      deleteDocConfirm: string;
      docUploadError: string;
      docImageWarn: string;
      docImageAttachAnyway: string;
      // Cards
      proposalHeading: string;
      issuedAt: string;
      validUntil: string;
      detailsHeading: string;
      scheduledDate: string;
      location: string;
      callClient: string;
      description: string;
      copied: string;
      clientNote: string;
      internalNote: string;
      createdOn: string;
      lastEditedOn: string;
      byUser: string;
      clientModalTitle: string;
      locationModalTitle: string;
      openInMaps: string;
      noCustomFields: string;
      coordinates: string;
      shareLocation: string;
      sendToCrew: string;
      crewTextClient: string;
      crewTextDate: string;
      workersHeading: string;
      // Line items
      itemsHeadingProposal: string;
      itemsHeadingJob: string;
      noItems: string;
      colUnitPriceShort: string;
      autopriceBtn: string;
      autopriceVerify: string;
      autopriceNoMatch: string;
      autopriceAlreadyPriced: string;
      autopricePickTitle: string;
      autopricePickSubtitle: string;
      autopricePickApply: string;
      measuredNote: string;
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
      cancelJobBtn: string;
      archiveBtn: string;
      unarchiveBtn: string;
      cancelJobConfirm: string;
      deleteInvoiceWarning: string;
      deleting: string;
      deleteBtn: string;
      // Job photos (migration 051)
      photos: {
        heading: string;
        countLabel: string;
        addBtn: string;
        takePhoto: string;
        chooseFromLibrary: string;
        empty: string;
        uploading: string;
        uploadError: string;
        deleteError: string;
        limitHit: string;
        deleteConfirm: string;
        viewerClose: string;
        // Create form: staged photos upload once the job is saved.
        pendingHint: string;
      };
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
      // Crew visibility toggle (migration 044). When OFF the job stays
      // private to office staff — used as the owner's scheduler so crew
      // doesn't see the full plan when work is split across teams.
      publishedToCrewLabel: string;
      publishedToCrewHint: string;
      privateBadge: string;
      publicBadge: string;
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
      coordinatesLabel: string;
      coordinatesPlaceholder: string;
      coordinatesInvalid: string;
      useMyLocation: string;
      gettingLocation: string;
      locationDenied: string;
      locationError: string;
      addressLabel: string;
      addressPlaceholder: string;
      cityLabel: string;
      cityPlaceholder: string;
      stateLabel: string;
      stateNone: string;
      scheduleHeading: string;
      allDayLabel: string;
      dateLabel: string;
      endDateLabel: string;
      endDateHint: string;
      dateFieldLabel: string;
      timeFieldLabel: string;
      estimatedHoursLabel: string;
      estimatedHoursPlaceholder: string;
      timeStartLabel: string;
      timeEndLabel: string;
      totalTimeLabel: string;
      totalHoursLabel: string;
      totalHoursAutoHint: string;
      totalHoursHint: string;
      outOfHoursNote: string;
      outOfHoursClosedNote: string;
      workersHeading: string;
      additionalWorkersLabel: string;
      workerNumberPlaceholder: string;
      addWorker: string;
      leadBadge: string;
      markAsLead: string;
      leadLabel: string;
      leadNone: string;
      crewLabel: string;
      driverLabel: string;
      driverNone: string;
      driverHoursLabel: string;
      driverHoursHint: string;
      workerSearchPlaceholder: string;
      workerNoResults: string;
      crewPlaceholder: string;
      crewSelectedCount: string;
      crewDoneBtn: string;
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
      workerNoteLabel: string;
      workerNotePlaceholder: string;
      errorTitleRequiredJob: string;
      errorTitleRequiredProposal: string;
      errorAtLeastOneItem: string;
      errorSaveGeneric: string;
      conflictTitle: string;
      conflictSoftHeading: string;
      conflictAllDay: string;
      conflictUntitled: string;
      conflictConfirmMessage: string;
      conflictSaveAnyway: string;
      conflictGoBack: string;
      submitCreateJob: string;
      submitCreateProposal: string;
    };
    actuals: {
      heading: string;
      subtitle: string;
      hoursWorkedLabel: string;
      hoursWorkedPlaceholder: string;
      saveBtn: string;
      markCompleteBtn: string;
      saveSuccess: string;
      saveError: string;
    };
    myJobs: {
      title: string;
      subtitle: string;
      emptyAll: string;
    };
  };
  employees: {
    title: string;
    summary: string;
    logHours: string;
    hoursLogged: string;
    addHours: string;
    hoursSearchPlaceholder: string;
    hoursNoResults: string;
    hoursThisPeriod: string;
    emptyHourTotals: string;
    deleteHoursConfirm: string;
    teamSearchPlaceholder: string;
    viewActive: string;
    viewInactive: string;
    resultsCount: string;
    selectAllShort: string;
    selectedCountSingle: string;
    selectedCountPlural: string;
    bulkDelete: string;
    confirmDeleteBulk: string;
    filter: {
      button: string;
      status: string;
      active: string;
      inactive: string;
      access: string;
      accessYes: string;
      accessInvited: string;
      accessNo: string;
      overtime: string;
      yes: string;
      no: string;
      payType: string;
      role: string;
      city: string;
      state: string;
      empty: string;
      searchValue: string;
      clear: string;
    };
    addBtn: string;
    deleteBtn: string;
    deleteConfirm: string;
    deactivateBtn: string;
    rosterRemoveBtn: string;
    createdOnLine: string;
    lastEditedOnLine: string;
    transferOwnershipBtn: string;
    transferOwnershipConfirm: string;
    transferOwnershipError: string;
    rosterAddBtn: string;
    rosterHint: string;
    reactivateBtn: string;
    tabs: {
      empleados: string;
      horas: string;
      historial: string;
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
      checkNameLabel: string;
      checkNamePlaceholder: string;
      checkNameHint: string;
      phoneLabel: string;
      phonePlaceholder: string;
      roleLabel: string;
      payTypeLabel: string;
      payRateLabel: string;
      overtimeLabel: string;
      overtimeThresholdLabel: string;
      overtimeMultiplierLabel: string;
      overtimeDefaultPlaceholder: string;
      errorFirstNameRequired: string;
      requiredError: string;
      // New standard fields
      emailLabel: string;
      emailPlaceholder: string;
      birthdayLabel: string;
      hireDateLabel: string;
      addressLabel: string;
      addressPlaceholder: string;
      cityLabel: string;
      cityPlaceholder: string;
      stateLabel: string;
      stateNone: string;
      zipLabel: string;
      zipPlaceholder: string;
      emergencyContactHeading: string;
      emergencyNameLabel: string;
      emergencyNamePlaceholder: string;
      emergencyPhoneLabel: string;
      emergencyPhonePlaceholder: string;
      // Custom fields
      customFieldsHeading: string;
      noCustomFields: string;
      // Section headings inside the form
      basicInfoHeading: string;
      personalHeading: string;
      employmentHeading: string;
      // App access (login + role) managed from the person record
      appAccessHeading: string;
      appAccessNoneHint: string;
      appAccessEmailRequired: string;
      appAccessNoManage: string;
    };
    timesheetModal: {
      title: string;
      editTitle: string;
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
      selectEmployee: string;
      errorEmployeeRequired: string;
    };
    history: {
      title: string;
      openBtn: string;
      empty: string;
      events: {
        hired: string;
        payChange: string;       // "Cambio de pago"
        roleChange: string;      // "Cambio de rol"
        terminated: string;
        rehired: string;
        note: string;
      };
      // Summaries — use {{from}}, {{to}}, etc. placeholders.
      payChangeSummary: string;          // "{{from}} → {{to}}"
      payChangeTypeSummary: string;      // "{{fromType}} → {{toType}}"
      roleChangeSummary: string;
      hiredSummary: string;              // "Iniciado como {{role}} · {{rate}}"
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
      scanHint: string;
      cameraDenied: string;
      scanSku: string;
      generateSku: string;
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
    today: string;
    views: {
      month: string;
      week: string;
      day: string;
    };
    agenda: {
      empty: string;
      emptyAdd: string;
      allDay: string;
      count: string;
    };
    availability: {
      button: string;
      title: string;
      hint: string;
      available: string;
      busy: string;
      noTeam: string;
    };
    eventTypes: {
      job: string;
      meeting: string;
      delivery: string;
      reminder: string;
      follow_up: string;
      other: string;
    };
    modal: {
      newEventTitle: string;
      editTitle: string;
      titleLabel: string;
      titlePlaceholder: string;
      typeLabel: string;
      allDayLabel: string;
      dateLabel: string;
      endDateLabel: string;
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
  workspaces: {
    switcherLabel: string;
    createBusiness: string;
    switchedToast: string;
    delegateBtn: string;
    delegateModalTitle: string;
    delegateChooseTarget: string;
    delegateConfirm: string;
    delegatedBadge: string;
    delegateSuccess: string;
    delegateError: string;
    delegateAlreadyDone: string;
    switchToTarget: string;
    delegatedFilterTab: string;
  };
  settings: {
    title: string;
    importHub: {
      subtitle: string;
      orderHint: string;
      step1Title: string;
      step1Desc: string;
      step2Title: string;
      step2Desc: string;
      step3Title: string;
      step3Desc: string;
      step4Title: string;
      step4Desc: string;
      step5Title: string;
      step5Desc: string;
      step6Title: string;
      step6Desc: string;
      step7Title: string;
      step7Desc: string;
      step8Title: string;
      step8Desc: string;
      recentTitle: string;
      recentEmpty: string;
      recNew: string;
      recUpdated: string;
      recExisted: string;
      recFailed: string;
      photos: {
        title: string;
        intro: string;
        pendingSummary: string;
        pendingByRef: string;
        noPending: string;
        chooseBtn: string;
        dropHint: string;
        matchedSummary: string;
        unmatchedTitle: string;
        unmatchedHint: string;
        uploadBtn: string;
        uploading: string;
        doneMsg: string;
        failedMsg: string;
        alreadyMsg: string;
        retryBtn: string;
        limitSkipped: string;
        clearBtn: string;
      };
    };
    tabs: {
      negocio: string;
      trabajos: string;
      clientes: string;
      empleados: string;
      precios: string;
      importar: string;
      facturas: string;
      facturaTema: string;
      cuenta: string;
      conexiones: string;
      equipo: string;
      actividad: string;
      tienda: string;
      navegacion: string;
      ubicaciones: string;
    };
    priceSheet: {
      title: string;
      subtitle: string;
      addBtn: string;
      empty: string;
      nameLabel: string;
      namePlaceholder: string;
      categoryLabel: string;
      categoryPlaceholder: string;
      uncategorized: string;
      modeLabel: string;
      modePerUnit: string;
      modeFlat: string;
      unitLabel: string;
      unitPlaceholder: string;
      rateLabel: string;
      flatWord: string;
      stateRatesLabel: string;
      stateRatesHint: string;
      clientRatesLabel: string;
      clientRatesHint: string;
      addClientRate: string;
      clientPickPlaceholder: string;
      addStateRate: string;
      addAllStates: string;
      statePlaceholder: string;
      selectStatePlaceholder: string;
      searchPlaceholder: string;
      unitHint: string;
      noResults: string;
      inactiveBadge: string;
      deactivate: string;
      activate: string;
      duplicate: string;
      copySuffix: string;
      deleteConfirm: string;
      saveBtn: string;
      tiersTitle: string;
      tiersHint: string;
      addTier: string;
      tierNamePlaceholder: string;
      deleteTierConfirm: string;
      tierRatesLabel: string;
      matchTermsLabel: string;
      matchTermsHint: string;
      matchTermsPlaceholder: string;
      addonLabel: string;
      addonHint: string;
      addonBadge: string;
      addonInlineLabel: string;
      addonInlineHint: string;
      clientTierLabel: string;
      clientTierNone: string;
      generateBtn: string;
      generateTitle: string;
      forClient: string;
      forState: string;
      selectClientPlaceholder: string;
      searchClientPlaceholder: string;
      noClientMatches: string;
      emailBtn: string;
      emailSubject: string;
      emailBody: string;
      generateForClientBtn: string;
      preparedFor: string;
      sheetTitle: string;
      additionalCharges: string;
      printBtn: string;
      generatedOn: string;
      allStatesLabel: string;
      genericSheet: string;
      customizeBtn: string;
      customizeTitle: string;
      accentColorLabel: string;
      designLabel: string;
      designClassic: string;
      designCards: string;
      designBold: string;
      designElegant: string;
      designMinimal: string;
      sectionOrderLabel: string;
      sectionOrderHint: string;
    };
    navigation: {
      subtitle: string;
      title: string;
      intro: string;
      inBarLabel: string;
      availableLabel: string;
      reorderHint: string;
      inicioLabel: string;
      masLabel: string;
      fixedBadge: string;
      maxNote: string;
      maxReached: string;
      minReached: string;
      savedError: string;
    };
    employeesSection: {
      title: string;
      subtitle: string;
      customFieldsSubtitle: string;
    };
    jobsSection: {
      title: string;
      subtitle: string;
    };
    invoicesSection: {
      title: string;
      subtitle: string;
    };
    crewMode: {
      heading: string;
      subtitle: string;
      saveBtn: string;
      saveSuccess: string;
      saveError: string;
    };
    itemTypes: {
      heading: string;
      subtitle: string;
      toggleLabel: string;
      saveSuccess: string;
      saveError: string;
    };
    crewFinderToggle: {
      heading: string;
      subtitle: string;
      toggleLabel: string;
      saveSuccess: string;
      saveError: string;
    };
    privateOnInvoice: {
      heading: string;
      subtitle: string;
      toggleLabel: string;
    };
    jobAlerts: {
      heading: string;
      subtitle: string;
      enabledLabel: string;
      enabledHint: string;
      levelsHeading: string;
      levelsEmpty: string;
      daysLabel: string;
      colorLabel: string;
      daysSuffixOne: string;
      daysSuffixMany: string;
      addLevelBtn: string;
      removeLevelLabel: string;
      overdueHeading: string;
      overdueSubtitle: string;
      overdueBadge: string;
      colors: {
        red: string;
        orange: string;
        yellow: string;
        blue: string;
        purple: string;
      };
      saveBtn: string;
      saveSuccess: string;
      saveError: string;
    };
    assignmentFieldsSection: {
      title: string;
      subtitle: string;
    };
    contactsStats: {
      heading: string;
      clientsLabel: string;
      contactsLabel: string;
      totalLabel: string;
      googleHint: string;
    };
    unsavedChangesTitle: string;
    unsavedChangesMessage: string;
    discardBtn: string;
    fieldTypes: {
      text: string;
      note: string;
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
      logoLabel: string;
      logoUploadBtn: string;
      logoChangeBtn: string;
      logoRemoveBtn: string;
      logoRemoveConfirm: string;
      logoUploading: string;
      logoError: string;
      logoSizeError: string;
      contactHeading: string;
      emailLabel: string;
      phoneLabel: string;
      websiteLabel: string;
      addressHeading: string;
      addressLabel: string;
      cityLabel: string;
      stateLabel: string;
      zipLabel: string;
      legalHeading: string;
      taxIdLabel: string;
      licenseLabel: string;
      invoiceHeading: string;
      invoiceNotesLabel: string;
      invoiceNotesPlaceholder: string;
      operatingHoursHeading: string;
      operatingHoursSub: string;
      closedLabel: string;
      openTimeLabel: string;
      closeTimeLabel: string;
      days: {
        mon: string;
        tue: string;
        wed: string;
        thu: string;
        fri: string;
        sat: string;
        sun: string;
      };
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
    invoices: {
      heading: string;
      subtitle: string;
      defaultLanguageLabel: string;
      defaultLanguageHint: string;
      emailDeliveryLabel: string;
      emailDeliveryHint: string;
      emailDeliveryPdf: string;
      emailDeliveryLink: string;
      emailDeliveryBoth: string;
      emailLinkMissingWarning: string;
      emailLinkUnusedWarning: string;
      dueDaysLabel: string;
      dueDaysHint: string;
      taxRateLabel: string;
      taxRateHint: string;
      qtyFieldLabel: string;
      qtyFieldHint: string;
      qtyFieldNone: string;
      startNumberLabel: string;
      startNumberHint: string;
      notesLabel: string;
      notesPlaceholder: string;
      emailHeading: string;
      emailSubtitle: string;
      emailSubjectLabel: string;
      emailBodyLabel: string;
      emailVarsHint: string;
      saveError: string;
      saveSuccess: string;
      confirmDeleteField: string;
      design: {
        title: string;
        subtitle: string;
        defaultLanguage: string;
        defaultLanguageHint: string;
        layout: string;
        layoutModes: { structured: string; freeform: string };
        builderHint: string;
        builderMobileHint: string;
        preset: string;
        presets: Record<string, string>;
        presetGroups: Record<string, string>;
        browseThemes: string;
        themesTitle: string;
        useTheme: string;
        currentTheme: string;
        archetype: string;
        archetypeHint: string;
        archetypes: Record<string, string>;
        accent: string;
        font: string;
        fonts: Record<string, string>;
        density: string;
        densities: { comfortable: string; compact: string };
        showLogo: string;
        logoSize: string;
        logoSizes: { sm: string; md: string; lg: string };
        invertLogo: string;
        sections: string;
        sectionNames: {
          header: string; billTo: string; lineItems: string; totals: string;
          customFields: string; notes: string; paymentInstructions: string; footer: string;
        };
        columns: string;
        columnNames: { qty: string; rate: string; total: string };
        textBlocks: string;
        headerNote: string;
        paymentInstructionsField: string;
        footerField: string;
        preview: string;
        elements: {
          addText: string;
          addField: string;
          addLogo: string;
          addShape: string;
          addIcon: string;
          shapeKinds: { rectangle: string; ellipse: string };
          fillColor: string;
          opacity: string;
          cornerRadius: string;
          selectField: string;
          textContent: string;
          fontSize: string;
          color: string;
          align: string;
          deleteEl: string;
          empty: string;
        };
        decoration: string;
        decorations: { none: string; corners: string; wave: string; arc: string };
        pageTint: string;
        fields: {
          businessName: string; businessContact: string; invoiceTitle: string;
          invoiceNumber: string; status: string; issueDate: string; dueDate: string;
          billToLabel: string; billToName: string; billToContact: string; lineItems: string;
          subtotal: string; tax: string; total: string; notes: string; paymentInstructions: string;
          headerNote: string; footer: string;
        };
        elementFont: string;
        undo: string;
        redo: string;
        copyTheme: string;
        copyThemeTitle: string;
        blankTheme: string;
      };
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
      fieldNameLabelEs: string;
      fieldNameLabelEn: string;
      translationHint: string;
      keyLabel: string;
      fieldTypeLabel: string;
      optionsLabel: string;
      optionsHint: string;
      optionsPlaceholder: string;
      requiredToggleLabel: string;
      integerOnlyToggleLabel: string;
      integerOnlyHint: string;
      thousandsToggleLabel: string;
      thousandsHint: string;
      multiToggleLabel: string;
      multiHint: string;
      addFieldBtn: string;
      updateFieldBtn: string;
      errorNameRequired: string;
      errorDuplicate: string;
      errorSave: string;
      confirmDelete: string;
    };
    account: {
      heading: string;
      subtitle: string;
      emailLabel: string;
      roleLabel: string;
      firstNameLabel: string;
      lastNameLabel: string;
      saveNameBtn: string;
      nameSaveSuccess: string;
      nameSaveError: string;
      businessesHeading: string;
      businessesSubtitle: string;
      businessesEmpty: string;
      logoutConfirm: string;
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
      currentPasswordLabel: string;
      currentPasswordPlaceholder: string;
      newPasswordLabel: string;
      newPasswordPlaceholder: string;
      showPassword: string;
      hidePassword: string;
      saveBtn: string;
      errorMinLength: string;
      errorCurrentRequired: string;
      errorCurrentWrong: string;
      errorPrefix: string;
      successMsg: string;
    };
    support: {
      heading: string;
      subtitle: string;
      contactBtn: string;
      emailSubject: string;
      noMailApp: string;
    };
    google: {
      heading: string;
      subtitle: string;
      // The connection is PER BUSINESS (migration 031) — this line shows
      // which business the card is checking so "disconnected" on one device
      // vs "connected" on another is explainable (different active business).
      scopeNote: string;
      // Shown when the status check itself failed (missing API config or
      // network error) — distinct from a real "disconnected" answer.
      statusCheckError: string;
      connectBtn: string;
      reconnectBtn: string;
      disconnectBtn: string;
      forceSyncBtn: string;
      connected: string;
      disconnected: string;
      reconnectNeeded: string;
      contactGroupLabel: string;
      contactGroupNoneOption: string;
      lastSyncedAt: string;
      lastSyncError: string;
      connectError: string;
      cancelled: string;
      disconnectTitle: string;
      disconnectBody: string;
      disconnectCountGeneric: string;
      disconnectCountWithNumber: string;
      disconnectKeepBtn: string;
      disconnectDeleteBtn: string;
      backfillTitle: string;
      backfillBody: string;
      backfillSyncBtn: string;
      backfillSkipBtn: string;
      backfillProgress: string;
      backfillDoneTitle: string;
      backfillDoneBody: string;
      backfillFailedToast: string;
      templateTitle: string;
      templateHint: string;
      templatePlaceholder: string;
      templateAvailable: string;
      templateSaveBtn: string;
      templateSaving: string;
      templateSaved: string;
      templateSaveError: string;
      templateReapplyBtn: string;
      templateReapplyEmpty: string;
      templateReapplyConfirmTitle: string;
      templateReapplyConfirmBody: string;
      templateReapplyConfirmBtn: string;
    };
    team: {
      heading: string;
      subtitle: string;
      membersHeading: string;
      invitesHeading: string;
      inviteBtn: string;
      inviteModalTitle: string;
      emailLabel: string;
      emailPlaceholder: string;
      roleLabel: string;
      sendInviteBtn: string;
      sending: string;
      copyLinkBtn: string;
      linkCopied: string;
      pendingBadge: string;
      expiredBadge: string;
      acceptedBadge: string;
      revokeBtn: string;
      removeBtn: string;
      verComoBtn: string;
      verComoNotAllowed: string;
      verComoNotMember: string;
      verComoFailed: string;
      changeRoleBtn: string;
      youSuffix: string;
      ownerSuffix: string;
      noMembersYet: string;
      noPendingInvites: string;
      inviteSentToast: string;
      inviteFailedToast: string;
      confirmRemove: string;
      confirmRevoke: string;
      errorInviteSelf: string;
      errorAlreadyMember: string;
      errorAlreadyInvited: string;
    };
    activity: {
      heading: string;
      subtitle: string;
      emptyState: string;
      loadMore: string;
      unknownUser: string;
      searchPlaceholder: string;
      noResults: string;
      timeJustNow: string;
      timeMinutesAgo: string;
      timeHoursAgo: string;
      timeDaysAgo: string;
    };
    store: {
      heading: string;
      subtitle: string;
      statusAvailable: string;
      statusComingSoon: string;
      enabledBadge: string;
      enable: string;
      disable: string;
      // Confirmation dialog when toggling. {{name}} is replaced with the
      // localized module name.
      enableConfirmTitle: string;
      enableConfirmBody: string;
      disableConfirmTitle: string;
      disableConfirmBody: string;
      searchPlaceholder: string;
      categoryAll: string;
      categoryTools: string;
      categoryIndustry: string;
      noResults: string;
    };
  };
  modules: {
    placeholder: {
      heading: string;
      body: string;
    };
    list: {
      map: { name: string; description: string };
      mechanic: { name: string; description: string };
      salon: { name: string; description: string };
      landscaping: { name: string; description: string };
      restaurant: { name: string; description: string };
      cleaning: { name: string; description: string };
      construction: { name: string; description: string };
      rentals: { name: string; description: string };
      loyalty: { name: string; description: string };
      trainer: { name: string; description: string };
      files: { name: string; description: string };
      fundraising: { name: string; description: string };
      equipment: { name: string; description: string };
      inventory: { name: string; description: string };
      wedding: { name: string; description: string };
      dealership: { name: string; description: string };
      messaging: { name: string; description: string };
    };
    // Messaging (SMS) module UI strings.
    messaging: {
      title: string;
      subtitle: string;
      connectTitle: string;
      providerLabel: string;
      providerHint: string;
      twilio: string;
      clicksend: string;
      accountSidLabel: string;
      authTokenLabel: string;
      usernameLabel: string;
      apiKeyLabel: string;
      fromNumberLabel: string;
      fromNumberHint: string;
      saveBtn: string;
      verifying: string;
      connected: string;
      connectedVia: string;
      fromShown: string;
      change: string;
      disconnect: string;
      composeTitle: string;
      clientLabel: string;
      selectClient: string;
      manualNumber: string;
      toLabel: string;
      toPlaceholder: string;
      messageLabel: string;
      messagePlaceholder: string;
      sendBtn: string;
      sending: string;
      sentToast: string;
      onlyWriters: string;
      notConfigured: string;
      errors: {
        invalid_credentials: string;
        missing_credentials: string;
        not_configured: string;
        network_error: string;
        generic: string;
      };
    };
    // Map-specific UI strings — layer toggles, pin popups, geocoding
    // progress. Lives under `modules` because it's owned by the map
    // module, not core settings.
    map: {
      layers: {
        clients: string;
        jobs: string;
        employees: string;
      };
      // Search + layer-toggle hint
      searchPlaceholder: string;
      searchNoResults: string;
      searchResultsCount: string;
      layerToggleHint: string;
      resetView: string;
      // Status footer / empty states
      noPinsYet: string;
      geocodeMissing: string;
      geocodeRunning: string;
      geocodeDone: string;
      geocodeProgress: string;
      geocodeBreakdown: string;
      geocodeBreakdownNoAddress: string;
      geocodeBreakdownUnresolved: string;
      geocodeBreakdownPending: string;
      geocodeNoneLeft: string;
      // Unresolved-clients list modal (opened from the banner)
      geocodeListTitle: string;
      geocodeListSectionNoAddress: string;
      geocodeListSectionUnresolved: string;
      geocodeListSectionPending: string;
      geocodeListEmpty: string;
      geocodeListNoAddressHint: string;
      geocodeListUnresolvedHint: string;
      geocodeListRetryBtn: string;
      geocodeListOpenClient: string;
      geocodeListUnnamed: string;
      geocodeIgnoreBtn: string;
      geocodeRestoreBtn: string;
      ignoredSectionTitle: string;
      ignoredSectionSubtitle: string;
      // Outreach mode — dims + ✓ clients contacted within outreachDays.
      outreachModeOn: string;       // toggle label when off (tap to enable)
      outreachModeOff: string;      // toggle label when on (tap to disable)
      outreachModeBadge: string;    // banner shown on the map when on ({{days}})
      outreachDaysLabel: string;    // settings row title
      outreachDaysSubtitle: string; // settings row subtitle
      outreachDaysValue: string;    // stepper value label ({{days}})
      // Settings sheet
      settingsTitle: string;
      mapTypeLabel: string;
      mapTypeStandard: string;
      mapTypeSatellite: string;
      mapTypeHybrid: string;
      mapTypeTerrain: string;
      clusteringLabel: string;
      clusteringSubtitle: string;
      pinSizeLabel: string;
      pinSizeSmall: string;
      pinSizeMedium: string;
      pinSizeLarge: string;
      pinRulesHeading: string;
      pinRulesSubtitle: string;
      pinLayerClients: string;
      pinLayerJobs: string;
      pinLayerEmployees: string;
      defaultStyleLabel: string;
      colorByFieldLabel: string;
      noFieldOption: string;
      addRuleBtn: string;
      rulesEmpty: string;
      ruleValueLabel: string;
      ruleValuePlaceholder: string;
      // (Legacy shape names — kept for callers still importing them.)
      pinShapePin: string;
      pinShapeCircle: string;
      pinShapeSquare: string;
      pinShapeTriangle: string;
      pinShapeStar: string;
      // New picker UI
      modeLabel: string;
      modeNoRule: string;
      modeCustom: string;
      applyRuleToLabel: string;
      ruleFieldPlaceholder: string;
      editStylePinHint: string;
      stylePickerTitle: string;
      colorLabel: string;
      iconColorLabel: string;
      iconLabel: string;
      iconCategories: {
        location: string;
        buildings: string;
        agriculture: string;
        weather: string;
        tools: string;
        vehicles: string;
        people: string;
        status: string;
        commerce: string;
        tech: string;
      };
      iconSearchPlaceholder: string;
      iconSearchNoResults: string;
      // Rule match-count chip (shown above each rule row)
      ruleMatchCount: string;
      ruleMatchCountSingle: string;
      ruleMatchCountZero: string;
      // Rule operator picker labels
      operatorEquals: string;
      operatorNotEquals: string;
      operatorHasValue: string;
      operatorContains: string;
      operatorGt: string;
      operatorGte: string;
      operatorLt: string;
      operatorLte: string;
      anyValuePlaceholder: string;
      // Hide-pins toggle
      ruleHideTooltip: string;
      ruleHiddenCount: string;
      ruleHiddenCountSingle: string;
      ruleOrderNote: string;
      saveBtn: string;
      saveSuccess: string;
      saveError: string;
      // Pin popup
      openRecord: string;
      noClient: string;
      noAddress: string;
      assignedToJob: string;
      // Weather (alpha — gated by business id)
      weather: {
        sectionTitle: string;
        sectionSubtitle: string;
        enabledLabel: string;
        enabledSubtitle: string;
        retentionLabel: string;
        retentionSubtitle: string;
        proximityRadiusLabel: string;
        proximityRadiusSubtitle: string;
        focusModeOn: string;     // toggle label when off (tap to enable)
        focusModeOff: string;    // toggle label when on (tap to disable)
        focusModeBadge: string;  // pill shown on the map when focus is on
        excludedStatesLabel: string;
        excludedStatesPlaceholder: string;
        eventsHeading: string;
        eventsSubtitle: string;
        addEventBtn: string;
        eventsEmpty: string;
        eventNameLabel: string;
        eventNamePlaceholder: string;
        eventPickerTitle: string;
        eventPickerSearchPlaceholder: string;
        eventPickerNoResults: string;
        eventCategories: {
          severe: string;
          wind: string;
          flood: string;
          winter: string;
          temperature: string;
          tropical: string;
          fire: string;
          tsunami: string;
          general: string;
        };
        minWindLabel: string;
        minWindHint: string;
        layerName: string;
        layerToggleHint: string;
        refreshingNow: string;
        refreshLastAt: string;
        refreshError: string;
        alertCount: string;
        alertCountSingle: string;
        alertCountZero: string;
        pinPopupExpires: string;
        pinPopupArea: string;
        pinPopupSeverity: string;
        pinPopupOpenNws: string;
        // Per-field labels in the alert detail popup
        pinPopupHeadline: string;
        pinPopupEvent: string;
        pinPopupCity: string;
        pinPopupState: string;
        pinPopupStarts: string;
        pinPopupEnds: string;
        pinPopupSent: string;
        pinPopupAdded: string;
        pinPopupDescription: string;
        // List of other alerts at the same location (shown when a county
        // has multiple alerts cached). Tapping one swaps the popup detail.
        pinPopupOtherAlerts: string;
        saveBtn: string;
        saveSuccess: string;
        saveError: string;
      };
    };
    // Equipment module — list, detail/edit form, photo gallery.
    equipment: {
      title: string;
      subtitle: string;
      countTotal: string;
      addBtn: string;
      searchPlaceholder: string;
      emptyTitle: string;
      emptyHint: string;
      unassignedBadge: string;
      paidOffBadge: string;
      loanBadge: string;
      plateExpiresSoon: string;
      plateExpired: string;
      mileageUnit: string;
      addTitle: string;
      editTitle: string;
      basicInfoHeading: string;
      registrationHeading: string;
      ownershipHeading: string;
      assignmentHeading: string;
      photosHeading: string;
      nameLabel: string;
      namePlaceholder: string;
      typeLabel: string;
      typePlaceholder: string;
      typeSuggestions: {
        truck: string;
        car: string;
        van: string;
        semi: string;
        trailer: string;
        skidLoader: string;
        tractor: string;
        generator: string;
        other: string;
      };
      makeLabel: string;
      makePlaceholder: string;
      modelLabel: string;
      modelPlaceholder: string;
      yearLabel: string;
      yearPlaceholder: string;
      colorLabel: string;
      colorPlaceholder: string;
      vinLabel: string;
      vinPlaceholder: string;
      mileageLabel: string;
      mileagePlaceholder: string;
      plateNumberLabel: string;
      plateNumberPlaceholder: string;
      plateExpirationLabel: string;
      paidOffLabel: string;
      loanLenderLabel: string;
      loanLenderPlaceholder: string;
      assignedToLabel: string;
      assignedToNone: string;
      notesLabel: string;
      notesPlaceholder: string;
      photoEmpty: string;
      photoAddBtn: string;
      photoTakeBtn: string;
      photoLibraryBtn: string;
      photoUploading: string;
      photoUploadError: string;
      photoDeleteConfirm: string;
      photoLimitHit: string;
      saveSuccess: string;
      saveError: string;
      deleteBtn: string;
      deleteConfirmTitle: string;
      deleteConfirmMsg: string;
      nameRequiredError: string;
      assignedToSearch: string;
      selectNoResults: string;
      scanVinHint: string;
      scanPermissionDenied: string;
      valueLabel: string;
      valuePlaceholder: string;
      loanAmountLabel: string;
      loanAmountPlaceholder: string;
      detailTitle: string;
      editBtn: string;
      createdLabel: string;
      updatedLabel: string;
      setCoverBtn: string;
      coverBadge: string;
      serialNumberLabel: string;
      serialNumberPlaceholder: string;
      insuranceHeading: string;
      insuranceCarrierLabel: string;
      insuranceCarrierPlaceholder: string;
      insurancePolicyLabel: string;
      insurancePolicyPlaceholder: string;
      insuranceAgentLabel: string;
      insuranceAgentPlaceholder: string;
      insuranceAgentPhoneLabel: string;
      insuranceAgentPhonePlaceholder: string;
      insuranceExpirationLabel: string;
      insuranceExpired: string;
      insuranceExpiresSoon: string;
      purchaseDateLabel: string;
      warrantyExpirationLabel: string;
      locationLabel: string;
      locationPlaceholder: string;
      groups: {
        button: string;
        title: string;
        none: string;
        lead: string;
        type: string;
        property: string;
        expiration: string;
        unassigned: string;
        noType: string;
        paid: string;
        financed: string;
        expired: string;
        expiringSoon: string;
        valid: string;
        noPlate: string;
      };
      filters: {
        title: string;
        all: string;
        plateExpired: string;
        plateExpiring: string;
        policyExpired: string;
        policyExpiring: string;
      };
    };
    rentals: {
      title: string;
      subtitle: string;
      saveError: string;
      tabs: { overview: string; properties: string; tenants: string };
      propertiesCount: string;
      searchPlaceholder: string;
      addProperty: string;
      editProperty: string;
      deleteConfirmTitle: string;
      deleteConfirmBody: string;
      emptyTitle: string;
      emptyHint: string;
      propertyForm: {
        nameLabel: string;
        namePlaceholder: string;
        addressLabel: string;
        cityLabel: string;
        stateLabel: string;
        zipLabel: string;
        typeLabel: string;
        unitCountLabel: string;
        unitCountHint: string;
        purchaseDateLabel: string;
        purchasePriceLabel: string;
        notesLabel: string;
        statusLabel: string;
        branchLabel: string;
      };
      propertyTypes: { house: string; duplex: string; apartment: string; commercial: string; land: string; other: string };
      propertyStatus: { active: string; inactive: string };
      photos: {
        heading: string;
        addBtn: string;
        takePhoto: string;
        chooseFromLibrary: string;
        uploading: string;
        limitHit: string;
        deleteConfirm: string;
      };
      detailTabs: { overview: string; leases: string; ledger: string; expenses: string; maintenance: string; photos: string };
      tenants: {
        title: string;
        addBtn: string;
        editTitle: string;
        empty: string;
        deleteConfirmTitle: string;
        deleteConfirmBody: string;
        copyFromClient: string;
        activeLease: string;
        form: {
          firstNameLabel: string;
          lastNameLabel: string;
          phoneLabel: string;
          emailLabel: string;
          emergencyNameLabel: string;
          emergencyPhoneLabel: string;
          emergencyRelationLabel: string;
          emergencyRelationPlaceholder: string;
          notesLabel: string;
        };
      };
      leases: {
        title: string;
        addBtn: string;
        editTitle: string;
        empty: string;
        endBtn: string;
        renewBtn: string;
        renewTitle: string;
        endConfirmTitle: string;
        endConfirmBody: string;
        deleteConfirmTitle: string;
        deleteConfirmBody: string;
        monthToMonth: string;
        endsInDays: string;
        endedBadge: string;
        expiredBadge: string;
        form: {
          tenantLabel: string;
          tenantPlaceholder: string;
          unitLabel: string;
          unitPlaceholder: string;
          startLabel: string;
          endLabel: string;
          endHint: string;
          rentLabel: string;
          dueDayLabel: string;
          dueDayHint: string;
          depositLabel: string;
          notesLabel: string;
        };
        docs: {
          heading: string;
          addBtn: string;
          empty: string;
          uploading: string;
          tooLarge: string;
          limitHit: string;
          deleteConfirm: string;
        };
      };
      ledger: {
        title: string;
        balanceLabel: string;
        depositLabel: string;
        statusPaid: string;
        statusPartial: string;
        statusUnpaid: string;
        statusLate: string;
        daysLate: string;
        recordPaymentBtn: string;
        editChargeTitle: string;
        chargeAmountLabel: string;
        noCharges: string;
        paidOfAmount: string;
      };
      payments: {
        recordTitle: string;
        editTitle: string;
        amountLabel: string;
        fullAmountBtn: string;
        methodLabel: string;
        methodPlaceholder: string;
        dateLabel: string;
        photoLabel: string;
        addPhoto: string;
        changePhoto: string;
        removePhoto: string;
        noteLabel: string;
        recordBtn: string;
        deleteConfirmTitle: string;
        deleteConfirmBody: string;
      };
      expenses: {
        title: string;
        addBtn: string;
        editTitle: string;
        empty: string;
        totalLabel: string;
        deleteConfirmTitle: string;
        deleteConfirmBody: string;
        fromMaintenance: string;
        form: {
          dateLabel: string;
          amountLabel: string;
          categoryLabel: string;
          vendorLabel: string;
          vendorPlaceholder: string;
          noteLabel: string;
          receiptLabel: string;
          addReceipt: string;
          changeReceipt: string;
          removeReceipt: string;
        };
        categories: {
          repairs: string;
          utilities: string;
          property_tax: string;
          insurance: string;
          mortgage: string;
          hoa: string;
          management: string;
          other: string;
        };
      };
      maintenance: {
        title: string;
        addBtn: string;
        editTitle: string;
        empty: string;
        deleteConfirmTitle: string;
        deleteConfirmBody: string;
        statusOpen: string;
        statusInProgress: string;
        statusDone: string;
        createExpenseToggle: string;
        createExpenseHint: string;
        form: {
          titleLabel: string;
          titlePlaceholder: string;
          descriptionLabel: string;
          statusLabel: string;
          reportedLabel: string;
          completedLabel: string;
          costLabel: string;
          fixedByLabel: string;
          fixedByPlaceholder: string;
          employeeLabel: string;
        };
      };
      overview: {
        monthTitle: string;
        collectedLabel: string;
        outstandingLabel: string;
        overdueLabel: string;
        occupancyLabel: string;
        occupiedOf: string;
        incomeLabel: string;
        expensesLabel: string;
        netLabel: string;
        noLeases: string;
        propertyColumn: string;
        tenantColumn: string;
        rentColumn: string;
        statusColumn: string;
      };
    };
  };
  assistant: {
    title: string;
    subtitle: string;
    placeholder: string;
    send: string;
    listening: string;
    micUnavailable: string;
    thinking: string;
    editingHint: string;
    emptyTitle: string;
    emptyState: string;
    suggestion1: string;
    suggestion2: string;
    suggestion3: string;
    draftTitle: string;
    updateTitle: string;
    updated: string;
    timeLabel: string;
    allDayLabel: string;
    confirm: string;
    confirming: string;
    created: string;
    viewJob: string;
    unresolvedClient: string;
    errorMsg: string;
    clientLabel: string;
    dateLabel: string;
    hoursLabel: string;
    crewLabel: string;
    leadBadge: string;
    driverLabel: string;
    notesLabel: string;
    newChat: string;
    callButton: string;
    callListening: string;
    callThinking: string;
    callSpeaking: string;
    callInterrupt: string;
    callThinkingHint: string;
    callConnecting: string;
    callEnd: string;
    callHint: string;
    callMicDenied: string;
  };
  crewFinder: {
    openButton: string;
    title: string;
    subtitle: string;
    distanceMi: string;
    noLocation: string;
    basisCurrentJob: string;
    basisJob: string;
    basisHome: string;
    freeOnDate: string;
    busyNextFree: string;
    busyNoFree: string;
    nearbyNote: string;
    add: string;
    added: string;
    scheduleThatDay: string;
    geocoding: string;
    needsAddresses: string;
    targetNoCoords: string;
    empty: string;
    offline: string;
    close: string;
  };
  reports: {
    payroll: {
      title: string;
      subtitle: string;
      entry: string;
      freqLabel: string;
      freqWeekly: string;
      freqCustom: string;
      customDaysLabel: string;
      settingsTitle: string;
      componentsHeading: string;
      otEnable: string;
      otThresholdLabel: string;
      otMultiplierLabel: string;
      otEligibleHeading: string;
      otEligibleHint: string;
      driverHeading: string;
      driverSame: string;
      driverRate: string;
      driverFlat: string;
      driverRateLabel: string;
      driverFlatLabel: string;
      formulaHeading: string;
      formulaStandardHint: string;
      formulaCreate: string;
      formulaRemove: string;
      formulaBuildHint: string;
      formulaEmpty: string;
      formulaInvalid: string;
      formulaVarsHeading: string;
      formulaEmpFieldsHeading: string;
      formulaJobFieldsHeading: string;
      formulaJobFieldHint: string;
      formulaNumberPlaceholder: string;
      formulaAddNumber: string;
      formulaClear: string;
      formulaVarNames: {
        pay_rate: string;
        worked_hours: string;
        driven_hours: string;
        total_hours: string;
        normal_hours: string;
        overtime_hours: string;
        normal_pay: string;
        overtime_pay: string;
        driver_pay: string;
        standard_pay: string;
      };
      formulaVarDescs: {
        pay_rate: string;
        worked_hours: string;
        driven_hours: string;
        total_hours: string;
        normal_hours: string;
        overtime_hours: string;
        normal_pay: string;
        overtime_pay: string;
        driver_pay: string;
        standard_pay: string;
      };
      formulaEcfDesc: string;
      formulaJcfDesc: string;
      formulaEcfMatchDesc: string;
      formulaJcfCountDesc: string;
      historyTitle: string;
      historyEmpty: string;
      historyBonus: string;
      historySearchPlaceholder: string;
      historyNoResults: string;
      historyFrom: string;
      historyTo: string;
      historySelect: string;
      historyCancelSelect: string;
      historySelectedCount: string;
      historyDeleteBtn: string;
      historyDeleteConfirm: string;
      historyTotalLabel: string;
      historyPaymentsCount: string;
      historyPresets: {
        thisPeriod: string;
        lastPeriod: string;
        thisWeek: string;
        lastWeek: string;
        last2Weeks: string;
        thisMonth: string;
        lastMonth: string;
        thisYear: string;
        lastYear: string;
      };
      amountLabel: string;
      partialLabel: string;
      hoursCoveredLabel: string;
      alreadyPaidLabel: string;
      paidSoFarLabel: string;
      paidTag: string;
      paidDiffersNote: string;
      manualPayBtn: string;
      manualWorkerLabel: string;
      manualSelectWorker: string;
      manualPeriodLabel: string;
      clearPaymentsLabel: string;
      clearPaymentsConfirm: string;
      totalPending: string;
      ofTotal: string;
      bonusLabel: string;
      loanTitle: string;
      loanOwed: string;
      loanDeductLabel: string;
      loanNetToPay: string;
      loanNoteFromCheckNum: string;
      loanNoteFromCheck: string;
      loanNoteFromWire: string;
      loanNoteFromCash: string;
      addLoanBtn: string;
      loanAmountPlaceholder: string;
      loanNotePlaceholder: string;
      loanViewBtn: string;
      loanHistoryTitle: string;
      loanDateLabel: string;
      loanGivenLabel: string;
      loanPaymentLabel: string;
      loanEmpty: string;
      loanDeleteConfirm: string;
      loanNewTitle: string;
      loanEditTitle: string;
      loanSaveBtn: string;
      loanSearchPlaceholder: string;
      loanNoWorkerFound: string;
      loanPickHint: string;
      recordPaymentBtn: string;
      loanPaymentNewTitle: string;
      loanPickTitle: string;
      otShort: string;
      driveShort: string;
      freqBiweekly: string;
      freqMonthly: string;
      anchorLabel: string;
      anchorHint: string;
      colWorker: string;
      colHours: string;
      colPay: string;
      totalHours: string;
      totalPay: string;
      paidSummary: string;
      markPaid: string;
      paidBadge: string;
      undo: string;
      methodHeading: string;
      methodCash: string;
      methodCheck: string;
      methodWire: string;
      checkNumberLabel: string;
      checkNumberPlaceholder: string;
      confirmBtn: string;
      saveBtn: string;
      removePayment: string;
      checkPrefix: string;
      empty: string;
      // Worker hours breakdown
      breakdownHours: string;
      hoursWorked: string;
      hoursDriven: string;
      hoursLogged: string;
      projectsHeading: string;
      untitledJob: string;
      noBreakdown: string;
    };
    title: string;
    subtitle: string;
    ranges: {
      month: string;
      last_month: string;
      quarter: string;
      half: string;
      year: string;
      last_year: string;
      all: string;
    };
    customRange: string;
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
      payroll: string;
      payrollWorkersSub: string;
      grossMargin: string;
      grossMarginSub: string;
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
    byLocation: {
      title: string;
      jobs: string;
      unassigned: string;
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
  files: {
    title: string; subtitle: string;
    empty: string; emptyHint: string;
    newCategory: string; newSection: string; addEntry: string;
    categoryNameLabel: string; categoryNamePlaceholder: string;
    sectionNameLabel: string; sectionNamePlaceholder: string;
    entryTitleLabel: string; entryTitlePlaceholder: string;
    crewVisibleLabel: string; crewVisibleHint: string;
    officeOnlyBadge: string; crewBadge: string;
    kindFile: string; kindLink: string;
    uploadBtn: string; uploading: string; chooseFile: string;
    linkUrlLabel: string; linkUrlPlaceholder: string; linkBadge: string;
    openBtn: string;
    noSections: string; noEntries: string;
    deleteCategoryConfirm: string; deleteSectionConfirm: string; deleteEntryConfirm: string;
    tooBig: string;
    sectionsCount: string; filesCount: string;
    selectedCount: string; moveBtn: string; moveTitle: string; moveHere: string; moveFolderTitle: string; moveHint: string;
    itemsOne: string; itemsMany: string; itemsEmpty: string; selectPrompt: string;
    newFolder: string; folderNameLabel: string; folderNamePlaceholder: string;
    deleteFolderConfirm: string; emptyFolder: string;
    visibilityLabel: string; visInherit: string;
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
      empleados: 'Equipo',
      equipo: 'Equipo',
      calendario: 'Calendario',
      inventario: 'Inventario',
      archivos: 'Archivos',
      reportes: 'Reportes',
      ajustes: 'Ajustes',
      mas: 'Más',
      logout: 'Cerrar sesión',
      appsSection: 'Apps',
      collapseSidebar: 'Contraer menú',
      expandSidebar: 'Expandir menú',
      descriptions: {
        clientes: 'Tu lista de clientes y contactos.',
        trabajos: 'Trabajos, cotizaciones y su progreso.',
        facturas: 'Crea y envía facturas a tus clientes.',
        empleados: 'Gestiona tu equipo, accesos, horarios y pagos.',
        equipo: 'Invita usuarios y gestiona roles de acceso.',
        calendario: 'Citas, trabajos programados y horarios.',
        inventario: 'Productos, partes y materiales.',
        archivos: 'Manuales y documentos para tu equipo.',
        reportes: 'Ingresos, trabajos, horas y más.',
        tienda: 'Activa o desactiva módulos para tu negocio.',
        ajustes: 'Configura tu negocio, equipo y conexiones.',
      },
    },
    fieldHome: {
      greeting: 'Hola 👋',
      clockIn: 'Marcar entrada',
      clockOut: 'Marcar salida',
      clockedInSince: 'Trabajando desde {{time}}',
      notClockedIn: 'No has marcado entrada',
      clockError: 'No se pudo guardar. Intenta de nuevo.',
      todayTitle: 'Mis trabajos de hoy',
      upcomingTitle: 'Próximos trabajos',
      empty: 'No tienes trabajos asignados.',
      lead: 'Líder',
      start: 'Comenzar',
      complete: 'Completar',
      noClient: 'Sin cliente',
      noDate: 'Sin fecha',
      summaryTitle: 'Mi resumen',
      statAssigned: 'Asignados',
      statCompleted: 'Completados (mes)',
      statHoursWeek: 'Horas (semana)',
      statHoursMonth: 'Horas (mes)',
      statActiveHours: 'Horas activas',
      hoursToggleActive: 'Activas',
      hoursToggleWeek: 'Semana',
      hoursToggleMonth: 'Mes',
      recentCompletedTitle: 'Completados recientes',
      logJob: 'Registrar trabajo',
      logTitle: 'Registrar trabajo',
      jobTitleLabel: 'Título del trabajo',
      jobTitlePlaceholder: '¿Qué hiciste?',
      clientLabel: 'Cliente (opcional)',
      clientSearch: 'Buscar cliente...',
      noClientOption: '— Sin cliente —',
      dateLabel: 'Fecha',
      notesLabel: 'Notas (opcional)',
      titleRequired: 'Escribe un título',
      saveError2: 'No se pudo registrar. Intenta de nuevo.',
      saved: 'Trabajo registrado',
      noResults: 'Sin resultados',
      locCapturing: 'Capturando ubicación…',
      locUnavailable: 'Ubicación no disponible',
    },
    roles: {
      title: 'Roles y permisos',
      subtitle: 'Personaliza lo que cada rol puede ver y hacer.',
      entry: 'Roles y permisos',
      ownerLocked: 'El propietario siempre tiene control total.',
      customized: 'Personalizado',
      reset: 'Restablecer',
      resetConfirm: '¿Restablecer este rol a los permisos predeterminados?',
      saved: 'Cambios guardados',
      saveError: 'No se pudo guardar. Intenta de nuevo.',
      sectionData: 'Acceso a datos',
      sectionSystem: 'Administración',
      colView: 'Ver',
      colCreate: 'Crear',
      colEdit: 'Editar',
      colDelete: 'Eliminar',
      scopeNone: 'No',
      scopeAssigned: 'Asignados',
      scopeAll: 'Todos',
      resourceNames: { jobs: 'Trabajos', clients: 'Clientes', invoices: 'Facturas', employees: 'Empleados', calendar: 'Calendario', inventory: 'Inventario', equipment: 'Equipos', rentals: 'Propiedades en renta', reports: 'Reportes' },
      capNames: { manageSettings: 'Ajustes del negocio', manageMembers: 'Gestionar equipo y roles', viewAuditLog: 'Ver actividad', viewAllTimesheets: 'Ver todas las horas', assignWorkers: 'Asignar trabajadores a cualquier trabajo', createEstimates: 'Permitir estimados', clockInOut: 'Marcar entrada/salida', scheduleJobs: 'Programar trabajos (no solo completados)', completedByDefault: 'Marcar trabajos como completados por defecto', switchLocations: 'Cambiar entre sucursales (si no, se limita a la suya)' },
      newRole: 'Nuevo rol',
      newRoleTitle: 'Crear rol personalizado',
      roleNameLabel: 'Nombre del rol',
      roleNamePlaceholder: 'p. ej. Mecánico',
      baseRoleLabel: 'Empezar con los permisos de',
      createBtn: 'Crear rol',
      createError: 'No se pudo crear el rol. ¿Ya existe uno con ese nombre?',
      customRoleDesc: 'Rol personalizado de tu negocio.',
      customRoleBadge: 'Rol propio',
      renameRole: 'Renombrar',
      renameRoleTitle: 'Renombrar rol',
      deleteRole: 'Eliminar rol',
      deleteRoleConfirm: '¿Eliminar este rol? Esta acción no se puede deshacer.',
      deleteRoleInUse: 'Hay miembros o invitaciones con este rol. Asígnales otro rol primero.',
      deleteRoleError: 'No se pudo eliminar el rol.',
    },
    home: {
      welcome: 'Bienvenido 👋',
      newInvoice: 'Nueva factura',
      customize: {
        editBtn: 'Personalizar',
        doneBtn: 'Listo',
        dragHint: 'Arrastra para reordenar tus widgets',
        hideLabel: 'Ocultar widget',
        addTitle: 'Agregar widgets',
        addEmpty: 'Ya estás mostrando todos los widgets.',
        saveError: 'No se pudo guardar tu diseño. Intenta de nuevo.',
        sizes: {
          sm: 'Pequeño',
          md: 'Mediano',
          lg: 'Grande',
        },
      },
      widgetNames: {
        quickActions: 'Acciones rápidas',
        earningsMonth: 'Ganancias del mes',
        invoicesPending: 'Facturas pendientes',
        clientsTotal: 'Clientes',
        invoicesOverdue: 'Facturas vencidas',
        clockedIn: 'Activos ahora',
        earningsYear: 'Ganancias del año',
        jobsActive: 'Trabajos activos',
        monthlyChart: 'Ingresos por mes',
        upcomingJobs: 'Próximos trabajos',
        recentInvoices: 'Facturas recientes',
      },
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
        jobsActiveLabel: 'Trabajos activos',
        jobsActiveSub: 'programados o en progreso',
        vsLastMonth: '{{pct}} vs mes anterior',
        avgPerMonth: 'Promedio {{amount}}/mes',
      },
      quickActions: {
        newInvoice: 'Nueva factura',
        newClient: 'Nuevo cliente',
        newJob: 'Nuevo trabajo',
        calendar: 'Calendario',
      },
      monthlyChart: {
        title: 'Ingresos por mes',
        empty: 'Aún no hay pagos este año.',
        totalLabel: 'Total {{year}}',
        avgLabel: 'Promedio mensual',
      },
      upcomingJobs: {
        title: 'Próximos trabajos',
        viewAll: 'Ver todos',
        empty: 'No tienes trabajos programados.',
        noClient: 'Sin cliente',
        today: 'Hoy',
        tomorrow: 'Mañana',
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
      total_loss: 'Pérdida total',
    },
    invoices: {
      title: 'Facturas',
      countTotal: '{{count}} en total',
      countFound: '{{count}} encontradas',
      selectButton: 'Seleccionar',
      selectAll: 'Todas',
      bulkDelete: 'Eliminar',
      confirmDeleteBulk: '¿Eliminar {{count}} factura(s) permanentemente? Los trabajos enlazados vuelven a Completado y pueden refacturarse.',
      selectedCountSingle: '{{count}} seleccionada',
      selectedCountPlural: '{{count}} seleccionadas',
      newInvoice: 'Nueva factura',
      filters: {
        all: 'Todas',
        drafts: 'Borradores',
        sent: 'Enviadas',
        paid: 'Pagadas',
        overdue: 'Vencidas',
        totalLoss: 'Pérdida total',
      },
      filters2: {
        button: 'Filtros',
        title: 'Filtrar',
        company: 'Empresa',
        state: 'Estado',
        allCompanies: 'Todas las empresas',
        allStates: 'Todos los estados',
        clear: 'Borrar filtros',
      },
      group: {
        button: 'Agrupar',
        title: 'Agrupar por',
        none: 'Ninguno',
        company: 'Empresa',
        state: 'Estado',
        status: 'Estado de pago',
      },
      searchPlaceholder: 'Buscar por número, cliente, trabajo o monto...',
      summarySingle: '{{count}} factura',
      summaryPlural: '{{count}} facturas',
      summaryTotal: 'Total',
      empty: 'Sin facturas.',
      createFirst: 'Crea la primera →',
      noClient: 'Sin cliente',
      dueShort: 'Vence {{date}}',
      markSent: 'Marcar enviada',
      undoSent: 'Deshacer envío',
      markPaid: 'Marcar pagada',
      markTotalLoss: 'Marcar pérdida total',
      markTotalLossConfirm: '¿Marcar esta factura como pérdida total? Saldrá de vencidas y no contará en tus ingresos.',
      reinstateInvoice: 'Reactivar factura',
      daysOverdue: 'por {{n}} días',
      overdueAgo: 'vencida hace {{n}} d',
      sentAgo: 'enviada hace {{n}} d',
      sentToday: 'enviada hoy',
      payments: {
        title: 'Pagos',
        recordTitle: 'Registrar pago',
        editTitle: 'Editar pago',
        recordBtn: 'Registrar pago',
        amountLabel: 'Monto',
        fullAmountBtn: 'Monto completo',
        methodLabel: 'Método de pago',
        dateLabel: 'Fecha de pago',
        remaining: 'Saldo pendiente',
        partialPill: 'Pago parcial',
        paidInFullHint: 'Con este pago la factura queda pagada.',
        deleteConfirm: '¿Eliminar este pago?',
        undoPaid: 'Marcar no pagada',
        undoPaidConfirm: 'La factura volverá a enviada y se eliminarán los pagos registrados.',
        otherPlaceholder: 'Especificar…',
        addPhoto: 'Agregar foto (ej. cheque)',
        changePhoto: 'Cambiar foto',
        removePhoto: 'Quitar foto',
        photoLabel: 'Foto del pago',
        methods: { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia', zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo', paypal: 'PayPal', moneyOrder: 'Giro postal (money order)', other: 'Otro' },
      },
      sendInvoice: 'Enviar factura',
      emailSubject: 'Factura {{number}}',
      emailBody: 'Hola,\n\nAdjunto encontrarás tu factura.\nPuedes verla aquí: {{link}}\n\nGracias por tu preferencia.',
      sendNoEmail: 'Este cliente no tiene un correo guardado.',
      createdLabel: 'Creada',
      moreActionsTitle: 'Más acciones',
      shareLinkAction: 'Compartir enlace',
      clientPrices: {
        viewBtn: 'Ver precios',
        title: 'Precios para este cliente',
        flatWord: 'fijo',
        tierNote: 'Precio especial de este cliente',
      },
      autonameBtn: 'Autonombre',
      autonameDone: '{{count}} nombre(s) de trabajo actualizados.',
      autonameNone: 'Los nombres ya están correctos.',
      lastEditedLabel: 'Última edición',
      byUser: 'por {{name}}',
      print: 'Imprimir / PDF',
      linkCopied: 'Enlace de la factura copiado',
      notFound: 'Factura no encontrada.',
      editTitle: 'Editar factura',
      jobsSection: {
        title: 'Trabajos en esta factura',
        empty: 'No hay trabajos vinculados.',
        addBtn: 'Agregar trabajo',
        removeBtn: 'Quitar',
        moveBtn: 'Mover',
        clearPricesBtn: 'Borrar precios',
        serviceDateLabel: 'Fecha del trabajo (opcional)',
        excludeHint: 'Excluir de la factura (temporal — los totales y el documento la omiten)',
        sortByDateBtn: 'Ordenar por fecha',
        clearPricesConfirm: '¿Borrar todos los precios de esta factura? Las líneas vuelven a $0 para que puedas volver a usar Autoprecio.',
        linkBtn: 'Vincular',
        linkTitle: 'Vincular a un trabajo',
        moveTitle: 'Mover a otra factura',
        moveEmpty: 'No hay otras facturas en borrador para este cliente.',
        addTitle: 'Agregar a la factura',
        addEmpty: 'No hay trabajos completados sin facturar. Busca para ver los de otros clientes.',
        addSearchPlaceholder: 'Buscar trabajo (cualquier cliente)…',
        addConfirm: 'Agregar',
        manualHeading: 'Concepto manual',
        manualDescPlaceholder: 'Descripción (ej. Viaje)',
        manualAddBtn: 'Agregar concepto',
        jobsHeading: 'Trabajos completados',
        removeItemConfirm: '¿Quitar este concepto de la factura?',
        editItemTitle: 'Editar concepto',
        viewProject: 'Ir al trabajo',
        previewDescription: 'Descripción',
        previewNoDescription: 'Sin descripción',
        previewNotes: 'Notas',
      },
      deleteTitle: 'Eliminar factura',
      deleteConfirm: '¿Eliminar la factura <strong>{{number}}</strong>? Esta acción no se puede deshacer.',
      deleting: 'Eliminando...',
      errorDelete: 'No se pudo eliminar la factura.',
      new: {
        heading: 'Nueva factura',
        headingEdit: 'Editar factura',
        subtitleNew: 'Completa los detalles de la factura',
        subtitleEdit: 'Actualiza los detalles de la factura',
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
        notesUseDefault: 'Usar predeterminada',
        notesCustom: 'Personalizada',
        internalNotesLabel: 'Notas internas (solo para ti)',
        internalNotesPlaceholder: 'Recordatorios privados — no aparecen en la factura...',
        customFieldsHeading: 'Campos personalizados',
        errorAtLeastOne: 'Agrega al menos un concepto',
        errorRequiredField: 'El campo "{{field}}" es requerido',
        errorSave: 'Error al guardar. Intenta de nuevo.',
        saveDraft: 'Guardar borrador',
        sendInvoice: 'Crear',
      },
      dateLocale: 'es-MX',
    },
    clients: {
      title: 'Clientes',
      countTotal: '{{count}} en total',
      countFound: '{{count}} encontrados',
      newClient: 'Nuevo cliente',
      group: {
        button: 'Agrupar',
        title: 'Agrupar por',
        name: 'Nombre (A–Z)',
        company: 'Empresa',
        state: 'Estado',
        city: 'Ciudad',
        noCompany: 'Sin empresa',
        noState: 'Sin estado',
        noCity: 'Sin ciudad',
        noValue: 'Sin valor',
      },
      importBtn: 'Importar clientes desde CSV',
      importHint: 'Sube un archivo CSV o usa tus contactos del teléfono. Útil al migrar desde otra app.',
      searchPlaceholder: 'Buscar clientes...',
      selectButton: 'Seleccionar',
      selectAll: 'Seleccionar todos',
      selectAllShort: 'Todos',
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
        actionCall: 'Llamar',
        actionText: 'Mensaje',
        actionEmail: 'Correo',
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
        shareTitle: 'Compartir',
        sharePdfBtn: 'Imprimir / PDF',
        shareCsvBtn: 'Compartir como CSV',
        shareDialogTitle: '¿Qué incluir?',
        shareDialogBasic: 'Solo datos de contacto',
        shareDialogAll: 'Todo + facturas',
        pdfInvoicesHeading: 'Facturas',
        pdfInvoicesTotal: 'Total facturado',
        pdfGeneratedOn: 'Generado el {{date}}',
        shareError: 'No se pudo compartir. Intenta de nuevo.',
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
          ccLabel: 'CC en facturas',
          ccBadge: 'CC',
          addBtn: 'Agregar contacto',
          confirmDelete: '¿Eliminar este contacto?',
        },
        commLog: {
          heading: 'Comunicaciones',
          lastContacted: 'Último contacto: {{rel}}',
          neverContacted: 'Sin contacto',
          add: 'Registrar contacto',
          empty: 'Aún no has contactado a este cliente.',
          emptyFiltered: 'Ningún contacto coincide con los filtros.',
          withContact: 'con {{name}}',
          types: {
            call: 'Llamada',
            sms: 'Mensaje',
            email: 'Correo',
            in_person: 'En persona',
            whatsapp: 'WhatsApp',
            note: 'Nota',
          },
          outcomes: {
            connected: 'Contestó',
            no_answer: 'No contestó',
            sent: 'Enviado',
            left_voicemail: 'Buzón de voz',
          },
          prompt: {
            callTitle: '¿Lograste contactar?',
            smsTitle: '¿Enviaste el mensaje?',
            emailTitle: '¿Enviaste el correo?',
            connected: 'Contestó',
            noAnswer: 'No contestó',
            sent: 'Enviado',
            dontLog: 'No registrar',
          },
          form: {
            addTitle: 'Registrar contacto',
            editTitle: 'Editar registro',
            typeLabel: 'Tipo',
            outcomeLabel: 'Resultado',
            outcomeNone: 'Sin resultado',
            directionLabel: 'Dirección',
            directionOutbound: 'Saliente',
            directionInbound: 'Entrante',
            dateLabel: 'Fecha',
            noteLabel: 'Nota',
            notePlaceholder: 'Detalles de la comunicación…',
            contactLabel: 'Persona de contacto',
            contactNone: 'Cliente (general)',
            save: 'Guardar',
            cancel: 'Cancelar',
            confirmDelete: '¿Eliminar este registro?',
            delete: 'Eliminar',
            edit: 'Editar',
          },
          rel: {
            now: 'ahora mismo',
            minute: 'hace {{n}} minuto',
            minutes: 'hace {{n}} minutos',
            hour: 'hace {{n}} hora',
            hours: 'hace {{n}} horas',
            day: 'hace {{n}} día',
            days: 'hace {{n}} días',
            week: 'hace {{n}} semana',
            weeks: 'hace {{n}} semanas',
            month: 'hace {{n}} mes',
            months: 'hace {{n}} meses',
            year: 'hace {{n}} año',
            years: 'hace {{n}} años',
          },
        },
      },
      importModal: {
        title: 'Importar clientes',
        colAdded: 'Agregado (fecha/hora)',
        colEdited: 'Última edición (fecha/hora)',
        mapTitle: 'Mapear columnas',
        previewTitle: 'Vista previa',
        doneTitle: '¡Importación completa!',
        uploadPrimary: 'Haz clic para seleccionar un archivo CSV',
        uploadSecondary: 'O arrastra y suelta aquí',
        templatePromptTitle: '¿Tienes el formato correcto?',
        templatePromptSub: 'Descarga la plantilla de ejemplo',
        templateBtn: 'Ejemplo CSV',
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
        pickFileBtn: 'Seleccionar archivo CSV',
        pickFileHint: 'Sube un .csv con encabezados',
        importContactsBtn: 'Importar desde contactos',
        importContactsHint: 'Elige contactos del teléfono',
        contactsPermissionDenied: 'Permiso denegado. Activa el acceso a contactos en Ajustes para usar esta función.',
        contactsImportedCount: '{{count}} contacto(s) importado(s)',
      },
    },
    jobs: {
      title: 'Trabajos',
      countTotal: '{{count}} en total',
      countFound: '{{count}} encontrados',
      pendingValue: '{{amount}} pendiente',
      inProgressValue: '{{amount}} en progreso',
      completedValue: '{{amount}} completado',
      newDropdown: {
        trigger: 'Nuevo',
        jobOption: 'Nuevo trabajo',
        jobOptionSub: 'Programar trabajo directamente',
        proposalOption: 'Nueva cotización',
        proposalOptionSub: 'Cotizar antes de trabajar',
      },
      searchPlaceholder: 'Buscar por nombre, cliente, número, ciudad...',
      clearFilters: 'Limpiar filtros',
      selectButton: 'Seleccionar',
      bulkDelete: 'Eliminar',
      bulkArchive: 'Archivar',
      bulkUnarchive: 'Desarchivar',
      bulkMoveClient: 'Mover a cliente',
      confirmArchiveBulk: '¿Archivar {{count}} trabajo(s)? Se ocultan de las listas pero siguen contando en reportes y horas.',
      archiveDisabledHint: 'Solo se archivan trabajos cerrados (completados, facturados, cancelados) que no estén ya archivados. Quita los demás de la selección.',
      archivedBadge: 'Archivado',
      confirmDeleteBulk: '¿Eliminar {{count}} trabajo(s) permanentemente? Se borrarán también sus fotos, líneas y asignaciones.',
      batchInvoice: {
        selectButton: 'Facturar',
        cancel: 'Cancelar',
        createButton: 'Crear factura',
        creating: 'Creando...',
        selectedCount: '{{count}} seleccionado(s)',
        sameClientHint: 'Solo trabajos del mismo cliente',
        multiClientHint: 'Se crearán {{count}} facturas (una por cliente)',
        createdMultiple: 'Se crearon {{count}} facturas, una por cliente.',
        multiConfirmTitle: 'Crear varias facturas',
        multiConfirmCreate: 'Crear {{count}} facturas',
        selectAll: 'Seleccionar todo',
        deselectAll: 'Quitar todo',
      },
      sort: {
        button: 'Ordenar',
        title: 'Ordenar y agrupar',
        sortByTitle: 'Ordenar por',
        groupByTitle: 'Agrupar por',
        by: {
          recent: 'Más recientes',
          status: 'Estado del trabajo',
          startDate: 'Fecha de inicio',
          priority: 'Prioridad',
          updated: 'Actualizados recientemente',
          title: 'Nombre del trabajo (A–Z)',
          endDate: 'Fecha de fin',
          client: 'Cliente',
          lead: 'Líder de equipo',
        },
        group: {
          none: 'Sin agrupar',
          client: 'Cliente',
          lead: 'Líder de equipo',
          company: 'Empresa',
          state: 'Estado (ubicación)',
        },
        noClient: 'Sin cliente',
        noLead: 'Sin líder',
        noCompany: 'Sin empresa',
        noState: 'Sin estado',
      },
      dateFilter: {
        button: 'Filtrar por fecha',
        title: 'Filtrar por fecha',
        from: 'Desde',
        to: 'Hasta',
        today: 'Hoy',
        yesterday: 'Ayer',
        last2Days: 'Últimos 2 días',
        last5Days: 'Últimos 5 días',
        apply: 'Aplicar filtro',
        clear: 'Borrar fechas',
        summary: '{{from}} — {{to}}',
      },
      tabs: {
        all: 'Todos',
        proposals: 'Cotizaciones',
        posible: 'Posibles',
        scheduled: 'Programados',
        in_progress: 'En progreso',
        completed: 'Completados',
        invoiced: 'Facturados',
        cancelled: 'Cancelados',
        archived: 'Archivados',
      },
      statuses: {
        proposal: 'Cotización',
        sent: 'Enviada',
        accepted: 'Aceptada',
        declined: 'Rechazada',
        posible: 'Posible',
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
      leadPrefix: 'Líder',
      emptyNoMatch: 'Sin resultados.',
      emptyAll: 'No tienes trabajos aún.',
      createFirst: 'Crear el primero →',
      dueShort: 'Vence {{date}}',
      alertChip: {
        today: 'Hoy',
        tomorrow: 'Mañana',
        inDays: 'En {{count}} días',
      },
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
        sendAction: 'Enviar cotización',
        sendActionMessage: 'Envíala por correo con el enlace para aceptar y firmar, o solo márcala como enviada.',
        markOnly: 'Solo marcar enviada',
        shareError: 'No se pudo compartir',
        statusUpdateError: 'No se pudo actualizar el estado. Intenta de nuevo.',
        printTooltip: 'Descargar PDF',
        editTooltip: 'Editar trabajo',
        duplicateTooltip: 'Duplicar trabajo',
        duplicateAskTitle: '¿Qué quieres copiar?',
        duplicateFullOption: 'Copiar todo',
        duplicateTeamOption: 'Solo cliente y equipo',
        deleteTooltip: 'Eliminar trabajo',
        generateInvoiceBtn: 'Generar factura',
        viewInvoiceBtn: 'Ver factura',
        unInvoiceBtn: 'Quitar de factura',
        unInvoiceConfirm: '¿Quitar este trabajo de la factura? Volverá a "Completado".',
        unInvoiceSentWarning: 'Esta factura ya fue enviada o pagada. Quitar el trabajo modificará una factura existente. ¿Continuar?',
        unInvoiceDeleteEmpty: 'La factura {{number}} quedó sin trabajos. ¿Eliminarla?',
        editItemsBtn: 'Editar',
        addItemsBtn: 'Agregar ítems',
        laborCost: {
          title: 'Nómina estimada',
          totalLabel: 'Total',
          hoursShort: 'h',
          salariedNote: '{{count}} con salario fijo no incluido(s)',
          hint: 'Horas del trabajo × tarifa de cada trabajador, más pago de chofer y tu fórmula de pago si aplica. No incluye horas extra.',
          showBreakdown: 'Ver desglose ({{count}})',
          hideBreakdown: 'Ocultar desglose',
        },
        scheduleWork: 'Programar trabajo',
        invoiceDirectly: 'Facturar directamente',
        cancelledBanner: 'Este trabajo fue cancelado.',
        declinedBanner: 'Esta cotización fue rechazada.',
        declinedByClientBanner: 'El cliente rechazó esta cotización.',
        cancelledOn: 'Cancelado el {{date}}',
        declinedOn: 'Rechazada el {{date}}',
        reinstate: 'Reactivar',
        emailAction: 'Enviar por correo',
        emailTooltip: 'Enviar por correo',
        sendNoEmail: 'Este cliente no tiene correo guardado. Agrégalo en su ficha para enviar la cotización.',
        emailSubject: 'Cotización {{numero}} de {{negocio}}',
        emailBody: 'Hola {{nombre}},\n\nLe compartimos la cotización {{numero}} por {{total}}.\n\nPuede verla, aceptarla y firmarla en línea aquí:\n{{enlace}}\n\nGracias,\n{{negocio}}',
        approvalTitle: 'Aprobación del cliente',
        signedByLine: 'Firmado por {{name}} el {{date}}',
        cancelSignedConfirm: 'Esta cotización fue firmada por el cliente. Si la cancelas y luego la reactivas, la aprobación firmada se eliminará y el cliente tendrá que aprobar y firmar de nuevo. ¿Cancelar el trabajo?',
        backStepSignedConfirm: 'Esta cotización fue firmada por el cliente. Al regresarla, la aprobación firmada se eliminará y el cliente tendrá que aceptar y firmar de nuevo. ¿Continuar?',
        signOnSite: 'Firmar en persona',
        signOnSiteHint: 'Entrega el dispositivo a tu cliente para que escriba su nombre y firme la cotización.',
        schedulePromptHint: 'Elige la fecha del trabajo para programarlo. Podrás ajustar horarios y más detalles editando el trabajo.',
        documentsHeading: 'Documentos',
        addDocumentBtn: 'Agregar documento',
        noDocuments: 'Sin documentos adjuntos.',
        docTooBig: 'El archivo supera el límite de 50 MB.',
        docLimitReached: 'Este trabajo ya tiene el máximo de {{max}} documentos.',
        docStorageFull: 'Tu negocio alcanzó el límite de almacenamiento de tu plan. Mejora tu plan o libera espacio.',
        deleteDocConfirm: '¿Eliminar este documento?',
        docUploadError: 'No se pudo subir el documento. Intenta de nuevo.',
        docImageWarn: 'Este archivo es una imagen. Las fotos del trabajo van en la sección Fotos. ¿Adjuntarla como documento de todos modos (por ejemplo, un contrato escaneado)?',
        docImageAttachAnyway: 'Adjuntar de todos modos',
        proposalHeading: 'Cotización',
        issuedAt: 'Emitida',
        validUntil: 'Válida hasta',
        detailsHeading: 'Detalles',
        scheduledDate: 'Fecha programada',
        location: 'Ubicación',
        callClient: '📞 Llamar a cliente',
        description: 'Descripción',
        copied: 'Copiado ✓',
        clientNote: 'Nota para cliente',
        internalNote: '📝 Nota interna',
        createdOn: 'Creado el {{date}}',
        lastEditedOn: 'Última edición {{date}}',
        byUser: 'por {{name}}',
        clientModalTitle: 'Cliente',
        locationModalTitle: 'Ubicación',
        openInMaps: 'Abrir en Mapas',
        noCustomFields: 'Sin campos personalizados.',
        coordinates: 'Coordenadas',
        shareLocation: 'Compartir ubicación',
        sendToCrew: 'Enviar a cuadrilla',
        crewTextClient: 'Cliente',
        crewTextDate: 'Fecha',
        workersHeading: 'Trabajadores',
        itemsHeadingProposal: 'Detalle de servicios',
        itemsHeadingJob: 'Materiales y mano de obra',
        noItems: 'Sin ítems registrados.',
        colUnitPriceShort: 'P/u',
        autopriceBtn: 'Autoprecio',
        autopriceVerify: 'Precios calculados automáticamente — por favor verifica cada línea, no siempre es exacto.',
        autopriceNoMatch: 'Ninguna línea coincidió con un precio. Agrega términos de coincidencia (ej. "torre", "reparación") a los precios en la Lista de precios.',
        autopriceAlreadyPriced: 'Las líneas que ya tienen un precio no se cambian con Autoprecio. Borra el precio de una línea si quieres recalcularla.',
        autopricePickTitle: 'Elige un precio',
        autopricePickSubtitle: 'Estas líneas coinciden con más de un precio. Elige el correcto para cada una.',
        autopricePickApply: 'Aplicar precios',
        measuredNote: 'medido {{qty}}',
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
        deleteJobConfirm: '¿Estás seguro de que deseas eliminar este trabajo? Esta acción no se puede deshacer.',
        cancelJobBtn: 'Cancelar trabajo',
        archiveBtn: 'Archivar trabajo',
        unarchiveBtn: 'Desarchivar trabajo',
        cancelJobConfirm: '¿Cancelar este trabajo?',
        deleteInvoiceWarning: 'Este trabajo tiene una factura vinculada — permanecerá en Facturas.',
        deleting: 'Eliminando...',
        deleteBtn: 'Eliminar',
        photos: {
          heading: 'Fotos',
          countLabel: '{{count}} de {{max}}',
          addBtn: 'Agregar foto',
          takePhoto: 'Tomar foto',
          chooseFromLibrary: 'Elegir de la galería',
          empty: 'Aún no hay fotos de este trabajo.',
          uploading: 'Subiendo...',
          uploadError: 'No se pudo subir la foto. Intenta de nuevo.',
          deleteError: 'No se pudo eliminar la foto. Intenta de nuevo.',
          limitHit: 'Máximo {{max}} fotos por trabajo.',
          deleteConfirm: '¿Eliminar esta foto?',
          viewerClose: 'Cerrar',
          pendingHint: 'Las fotos se subirán al guardar el trabajo.',
        },
      },
      new: {
        headingNewJob: 'Nuevo trabajo',
        headingNewProposal: 'Nueva cotización',
        headingEditJob: 'Editar trabajo',
        headingEditProposal: 'Editar cotización',
        subtitleNewJob: 'Completa los detalles del trabajo',
        subtitleNewProposal: 'Crea una cotización de precio para tu cliente',
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
        publishedToCrewLabel: 'Visible para la cuadrilla',
        publishedToCrewHint: 'Cuando esté apagado, solo tú y la oficina pueden ver este trabajo. La cuadrilla asignada no lo verá.',
        privateBadge: 'Privado',
        publicBadge: 'Pública',
        issueDateLabel: 'Fecha de emisión',
        expiryDateLabel: 'Válida hasta',
        projectStartLabel: 'Inicio del trabajo',
        statusLabel: 'Estado',
        priorityLabel: 'Prioridad',
        descriptionLabel: 'Descripción',
        descriptionPlaceholder: 'Detalle del trabajo a realizar...',
        locationHeading: 'Ubicación del trabajo',
        mapLinkLabel: 'Pegar enlace de mapa',
        mapLinkPlaceholder: 'https://maps.google.com/... o https://maps.apple.com/...',
        mapLinkHint: 'Pega un enlace de Google Maps o Apple Maps para capturar las coordenadas',
        coordinatesLabel: 'Coordenadas (lat, lng)',
        coordinatesPlaceholder: 'ej. 40.7128, -74.0060',
        coordinatesInvalid: 'Formato inválido. Usa "lat, lng" — ej. 40.7128, -74.0060',
        useMyLocation: 'Usar mi ubicación',
        gettingLocation: 'Obteniendo ubicación…',
        locationDenied: 'Permiso de ubicación denegado. Actívalo en Ajustes.',
        locationError: 'No se pudo obtener tu ubicación. Inténtalo de nuevo.',
        addressLabel: 'Dirección',
        addressPlaceholder: '123 County Road',
        cityLabel: 'Ciudad',
        cityPlaceholder: 'Omaha',
        stateLabel: 'Estado',
        stateNone: '—',
        scheduleHeading: 'Fecha y hora',
        allDayLabel: 'Todo el día',
        dateLabel: 'Fecha de inicio',
        endDateLabel: 'Fecha de fin',
        endDateHint: 'Ocúltala para usar una sola fecha (trabajos de un día).',
        dateFieldLabel: 'Fecha',
        timeFieldLabel: 'Hora',
        estimatedHoursLabel: 'Horas estimadas',
        estimatedHoursPlaceholder: 'ej. 52',
        timeStartLabel: 'Hora inicio',
        timeEndLabel: 'Hora fin',
        totalTimeLabel: 'Tiempo total',
        totalHoursLabel: 'Horas totales',
        totalHoursAutoHint: 'Calculado de las horas',
        totalHoursHint: 'Cuenta para las horas del trabajador',
        outOfHoursNote: 'Fuera del horario de atención',
        outOfHoursClosedNote: 'Este día está marcado como cerrado',
        workersHeading: 'Trabajadores asignados',
        additionalWorkersLabel: 'Trabajadores adicionales (manual)',
        workerNumberPlaceholder: 'Trabajador {{count}}',
        addWorker: '+ Agregar trabajador',
        leadBadge: 'Líder',
        markAsLead: 'Marcar como líder',
        leadLabel: 'Líder del trabajo',
        leadNone: 'Sin líder',
        crewLabel: 'Trabajadores',
        driverLabel: 'Conductor',
        driverNone: 'Sin conductor',
        driverHoursLabel: 'Horas de conductor',
        driverHoursHint: 'Horas extra pagadas solo al conductor',
        workerSearchPlaceholder: 'Buscar trabajador...',
        workerNoResults: 'Sin resultados',
        crewPlaceholder: 'Selecciona los trabajadores',
        crewSelectedCount: '{{count}} seleccionados',
        crewDoneBtn: 'Listo',
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
        workerNoteLabel: 'Notas para el trabajador',
        workerNotePlaceholder: 'Instrucciones específicas para el equipo asignado...',
        errorTitleRequiredJob: 'El título del trabajo es requerido',
        errorTitleRequiredProposal: 'El título es requerido',
        errorAtLeastOneItem: 'Agrega al menos un ítem',
        errorSaveGeneric: 'Error al guardar',
        conflictTitle: 'Conflicto de horario',
        conflictSoftHeading: 'También agendado ese día',
        conflictAllDay: 'todo el día',
        conflictUntitled: 'Trabajo sin título',
        conflictConfirmMessage: 'Algunas personas asignadas ya están ocupadas en ese horario. ¿Guardar de todos modos?',
        conflictSaveAnyway: 'Guardar de todos modos',
        conflictGoBack: 'Volver',
        submitCreateJob: 'Crear trabajo',
        submitCreateProposal: 'Crear cotización',
      },
      actuals: {
        heading: 'Registrar trabajo',
        subtitle: 'Horas y datos por trabajador.',
        hoursWorkedLabel: 'Horas trabajadas',
        hoursWorkedPlaceholder: '0.0',
        saveBtn: 'Guardar registro',
        markCompleteBtn: 'Marcar como completado',
        saveSuccess: 'Registro guardado.',
        saveError: 'No se pudo guardar el registro.',
      },
      myJobs: {
        title: 'Mis Trabajos',
        subtitle: 'Trabajos donde eres líder.',
        emptyAll: 'No tienes trabajos asignados como líder.',
      },
    },
    employees: {
      title: 'Equipo',
      summary: '{{active}} activos · {{hours}}h este periodo',
      logHours: 'Registrar horas',
      hoursLogged: 'Horas registradas',
      addHours: 'Agregar',
      hoursSearchPlaceholder: 'Buscar por empleado o trabajo...',
      hoursNoResults: 'No se encontraron registros.',
      hoursThisPeriod: 'Periodo de pago: {{period}}',
      emptyHourTotals: 'Sin horas en este periodo de pago.',
      deleteHoursConfirm: '¿Eliminar este registro de horas?',
      teamSearchPlaceholder: 'Buscar por nombre, teléfono o campo…',
      viewActive: 'Activos',
      viewInactive: 'Inactivos',
      resultsCount: '{{count}} resultados',
      selectAllShort: 'Todos',
      selectedCountSingle: '{{count}} seleccionado',
      selectedCountPlural: '{{count}} seleccionados',
      bulkDelete: 'Eliminar',
      confirmDeleteBulk: '¿Eliminar {{count}} empleados? Esta acción no se puede deshacer y borra su historial.',
      filter: {
        button: 'Filtrar',
        status: 'Estado',
        active: 'Activo',
        inactive: 'Inactivo',
        access: 'Acceso a la app',
        accessYes: 'Con acceso',
        accessInvited: 'Invitado',
        accessNo: 'Sin acceso',
        overtime: 'Horas extra',
        yes: 'Sí',
        no: 'No',
        payType: 'Tipo de pago',
        role: 'Rol',
        city: 'Ciudad',
        state: 'Estado (dirección)',
        empty: '(Vacío)',
        searchValue: 'Buscar valor…',
        clear: 'Limpiar filtros',
      },
      addBtn: 'Agregar',
      deleteBtn: 'Eliminar empleado',
      deleteConfirm: '¿Eliminar a {{name}}? Esta acción no se puede deshacer y borra su historial.',
      deactivateBtn: 'Desactivar empleado',
      rosterRemoveBtn: 'Quitar de cuadrillas',
      createdOnLine: 'Agregado el {{date}}',
      lastEditedOnLine: 'Última edición {{date}}',
      transferOwnershipBtn: 'Transferir propiedad',
      transferOwnershipConfirm: '¿Transferir la propiedad del negocio a {{name}}? Esa persona pasará a ser la dueña (control total, incluida la facturación) y tu rol cambiará a Administrador. Esta acción solo la puede revertir el nuevo dueño.',
      transferOwnershipError: 'No se pudo transferir la propiedad. Intenta de nuevo.',
      rosterAddBtn: 'Incluir en cuadrillas',
      rosterHint: 'No aparecerá al elegir líder, trabajadores o manejadores en un trabajo. Sigue activo para nómina y acceso.',
      reactivateBtn: 'Reactivar empleado',
      tabs: {
        empleados: 'Equipo',
        horas: 'Horas',
        historial: 'Historial',
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
        checkNameLabel: 'Nombre para el cheque',
        checkNamePlaceholder: 'Nombre legal completo',
        checkNameHint: 'Déjalo en blanco si es igual al nombre y apellido.',
        phoneLabel: 'Teléfono',
        phonePlaceholder: '+1 (555) 000-0000',
        roleLabel: 'Puesto',
        payTypeLabel: 'Tipo de pago',
        payRateLabel: 'Tarifa ({{unit}})',
        overtimeLabel: 'Recibe horas extra',
        overtimeThresholdLabel: 'Horas regulares/semana',
        overtimeMultiplierLabel: 'Multiplicador',
        overtimeDefaultPlaceholder: 'Predeterminado',
        errorFirstNameRequired: 'El nombre es requerido',
        requiredError: 'Campos requeridos: {{fields}}',
        emailLabel: 'Correo personal',
        emailPlaceholder: 'juan@ejemplo.com',
        birthdayLabel: 'Fecha de nacimiento',
        hireDateLabel: 'Fecha de contratación',
        addressLabel: 'Dirección',
        addressPlaceholder: '123 Main St',
        cityLabel: 'Ciudad',
        cityPlaceholder: 'Omaha',
        stateLabel: 'Estado',
        stateNone: '—',
        zipLabel: 'Código postal',
        zipPlaceholder: '68102',
        emergencyContactHeading: 'Contacto de emergencia',
        emergencyNameLabel: 'Nombre',
        emergencyNamePlaceholder: 'María Pérez',
        emergencyPhoneLabel: 'Teléfono',
        emergencyPhonePlaceholder: '+1 (555) 000-0000',
        customFieldsHeading: 'Campos personalizados',
        noCustomFields: 'No hay campos personalizados. Configúralos en Ajustes → Empleados.',
        basicInfoHeading: 'Información básica',
        personalHeading: 'Información personal',
        employmentHeading: 'Empleo y pago',
        appAccessHeading: 'Acceso a la app',
        appAccessNoneHint: 'Invita a esta persona a iniciar sesión en la app con un rol.',
        appAccessEmailRequired: 'Agrega un correo para poder invitar.',
        appAccessNoManage: 'No tienes permiso para administrar el acceso.',
      },
      timesheetModal: {
        title: 'Registrar horas',
        editTitle: 'Editar horas',
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
        selectEmployee: 'Seleccionar empleado',
        errorEmployeeRequired: 'Selecciona un empleado',
      },
      history: {
        title: 'Historial',
        openBtn: 'Ver historial',
        empty: 'Sin cambios registrados todavía.',
        events: {
          hired: 'Contratado',
          payChange: 'Cambio de pago',
          roleChange: 'Cambio de puesto',
          terminated: 'Inactivado',
          rehired: 'Reactivado',
          note: 'Nota',
        },
        payChangeSummary: '{{from}} → {{to}}',
        payChangeTypeSummary: '{{fromType}} → {{toType}}',
        roleChangeSummary: '{{from}} → {{to}}',
        hiredSummary: 'Iniciado como {{role}} · {{rate}}',
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
        scanHint: 'Apunta la cámara al código de barras',
        cameraDenied: 'Necesitamos acceso a la cámara para escanear.',
        scanSku: 'Escanear código',
        generateSku: 'Generar SKU',
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
      today: 'Hoy',
      views: {
        month: 'Mes',
        week: 'Semana',
        day: 'Día',
      },
      agenda: {
        empty: 'No hay nada este día',
        emptyAdd: '+ Agregar evento',
        allDay: 'Todo el día',
        count: '{{count}} en total',
      },
      availability: {
        button: 'Disponibilidad',
        title: 'Disponibilidad del equipo',
        hint: 'El número es cuántos trabajos asignados tiene cada persona ese día',
        available: 'Disponible',
        busy: 'Ocupado',
        noTeam: 'No hay empleados activos',
      },
      eventTypes: {
        job: 'Trabajo',
        meeting: 'Reunión',
        delivery: 'Entrega',
        reminder: 'Recordatorio',
        follow_up: 'Seguimiento',
        other: 'Otro',
      },
      modal: {
        newEventTitle: 'Nuevo evento — {{date}}',
        editTitle: 'Editar evento',
        titleLabel: 'Título *',
        titlePlaceholder: 'Reunión con cliente, entrega de material...',
        typeLabel: 'Tipo',
        allDayLabel: 'Todo el día',
        dateLabel: 'Fecha',
        endDateLabel: 'Fecha fin',
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
    workspaces: {
      switcherLabel: 'Cambiar negocio',
      createBusiness: 'Crear negocio',
      switchedToast: 'Cambiado a {{name}}',
      delegateBtn: 'Delegar a…',
      delegateModalTitle: 'Delegar trabajo',
      delegateChooseTarget: 'Elige a qué negocio mandar este trabajo.',
      delegateConfirm: 'Delegar',
      delegatedBadge: '→ Delegado a {{name}}',
      delegateSuccess: '¡Listo! Delegado a {{name}}.',
      delegateError: 'No se pudo delegar. Intenta de nuevo.',
      delegateAlreadyDone: 'Este trabajo ya fue delegado.',
      switchToTarget: 'Cambiar a {{name}}',
      delegatedFilterTab: 'Delegados',
    },
    settings: {
      title: 'Ajustes',
      importHub: {
        subtitle: 'Migra la información de tu negocio desde otra app o archivos CSV.',
        orderHint: 'Sigue el orden — cada paso enlaza con el anterior: los trabajos se vinculan a clientes y equipo por nombre, y las facturas se enlazan a los trabajos por su Project ID.',
        step1Title: 'Importar clientes',
        step1Desc: 'Primero — los trabajos y facturas se vincularán a estos clientes.',
        step2Title: 'Importar equipo',
        step2Desc: 'Los líderes y cuadrillas de los trabajos se vinculan por nombre.',
        step3Title: 'Importar trabajos',
        step3Desc: 'Se enlazan a clientes y equipo. Incluye el Project ID para enlazar las facturas.',
        step4Title: 'Subir fotos',
        step4Desc: 'Selecciona todas las fotos a la vez — se asignan a cada proyecto por el nombre de archivo de la columna "Fotos".',
        step5Title: 'Importar facturas',
        step5Desc: 'Al final — cada línea se enlaza a su trabajo por Project ID.',
        step6Title: 'Importar historial de nómina',
        step6Desc: 'Pagos anteriores por trabajador y período — aparecen en Nómina → Historial de pagos.',
        step7Title: 'Importar equipos',
        step7Desc: 'Vehículos y maquinaria: marca, modelo, placa, valor, seguro y más.',
        step8Title: 'Importar inventario',
        step8Desc: 'Materiales y artículos: cantidades, costos, categorías y alertas de stock.',
        recentTitle: 'Importaciones recientes',
        recentEmpty: 'Aún no hay importaciones registradas.',
        recNew: 'nuevos',
        recUpdated: 'actualizados',
        recExisted: 'ya existían',
        recFailed: 'con errores',
        photos: {
          title: 'Subir fotos de proyectos',
          intro: 'Selecciona todas las fotos de una vez. Cada archivo se asigna a su proyecto según la columna "Fotos (nombres de archivo)" del CSV de trabajos (o si el nombre contiene el Project ID). Las fotos sin coincidencia NO se suben ni ocupan almacenamiento.',
          pendingSummary: '{{names}} fotos esperadas en {{jobs}} proyectos.',
          pendingByRef: '{{jobs}} proyectos con Project ID. Empareja por el ID en el nombre del archivo (p. ej. "Proyecto-0a4f0ca7.Foto 1.jpg").',
          noPending: 'No hay fotos pendientes. Importa trabajos con la columna "Fotos (nombres de archivo)" primero.',
          chooseBtn: 'Elegir fotos',
          dropHint: 'o arrastra los archivos aquí',
          matchedSummary: '{{files}} fotos coinciden con {{jobs}} proyectos.',
          unmatchedTitle: 'Sin coincidencia ({{count}})',
          unmatchedHint: 'Estos archivos no se subirán. Revisa el nombre o agrégalos manualmente en el proyecto.',
          uploadBtn: 'Subir {{count}} fotos',
          uploading: 'Subiendo {{done}} de {{total}}…',
          doneMsg: '{{count}} fotos subidas.',
          failedMsg: '{{count}} fotos fallaron.',
          alreadyMsg: '{{count}} ya estaban subidas — omitidas.',
          retryBtn: 'Reintentar fallidas',
          limitSkipped: '{{count}} omitidas por el límite de {{max}} fotos por proyecto.',
          clearBtn: 'Elegir otras fotos',
        },
      },
      tabs: {
        negocio: 'Negocio',
        trabajos: 'Trabajos',
        clientes: 'Clientes',
        empleados: 'Equipo',
        precios: 'Precios',
        importar: 'Importar datos',
        facturas: 'Facturas',
        facturaTema: 'Tema de factura',
        cuenta: 'Cuenta',
        conexiones: 'Conexiones',
        equipo: 'Equipo',
        actividad: 'Actividad',
        tienda: 'Tienda de módulos',
        navegacion: 'Navegación',
        ubicaciones: 'Ubicaciones',
      },
      priceSheet: {
        title: 'Lista de precios',
        subtitle: 'Precios para cobrar trabajos automáticamente.',
        addBtn: 'Agregar precio',
        empty: 'Aún no hay precios. Agrega el primero para autocalcular trabajos.',
        nameLabel: 'Nombre',
        namePlaceholder: 'Ej. Ensamble de pivote nuevo',
        categoryLabel: 'Categoría',
        categoryPlaceholder: 'Ej. Pivotes nuevos',
        uncategorized: 'Sin categoría',
        modeLabel: 'Cómo se cobra',
        modePerUnit: 'Por unidad',
        modeFlat: 'Precio fijo',
        unitLabel: 'Unidad',
        unitPlaceholder: 'pies, corte, artículo…',
        rateLabel: 'Precio',
        flatWord: 'fijo',
        stateRatesLabel: 'Precios por estado',
        stateRatesHint: 'Opcional. Si el trabajo es en ese estado, se usa este precio.',
        clientRatesLabel: 'Precios por cliente',
        clientRatesHint: 'Opcional. Precio especial para un cliente — gana sobre el precio por estado.',
        addClientRate: '+ Agregar cliente',
        clientPickPlaceholder: 'Elegir cliente…',
        addStateRate: 'Agregar estado',
        addAllStates: 'Agregar todos los estados',
        statePlaceholder: 'Estado (ej. NE)',
        selectStatePlaceholder: 'Selecciona un estado',
        searchPlaceholder: 'Buscar precios...',
        unitHint: 'Opcional. Déjalo vacío para un precio fijo (no por unidad).',
        noResults: 'Sin resultados.',
        inactiveBadge: 'Inactivo',
        deactivate: 'Desactivar',
        activate: 'Activar',
        duplicate: 'Duplicar',
        copySuffix: '(copia)',
        deleteConfirm: '¿Eliminar este precio?',
        saveBtn: 'Guardar',
        tiersTitle: 'Niveles de precio',
        tiersHint: 'Modelos de precio para distintos clientes (ej. Estándar, Lejos, Mayoreo). Asigna un nivel a cada cliente.',
        addTier: 'Agregar nivel',
        tierNamePlaceholder: 'Ej. Lejos',
        deleteTierConfirm: '¿Eliminar este nivel?',
        tierRatesLabel: 'Precios por nivel',
        matchTermsLabel: 'Términos para autoprecio',
        matchTermsHint: 'Opcional. Otras formas de decirlo, siglas o abreviaturas — ayudan al botón Autoprecio a encontrar este precio.',
        matchTermsPlaceholder: 'torre, tower, pivote nuevo…',
        addonLabel: 'Es un cargo adicional (add-on)',
        addonHint: 'Se suma al precio base de cualquier línea cuyo texto contenga sus términos (ej. Boombacks +$0.25/pie). No es un precio base por sí solo.',
        addonBadge: 'Add-on',
        addonInlineLabel: 'Incluir en la línea del trabajo',
        addonInlineHint: 'En vez de una línea propia, suma este cargo al total de la línea que coincida (tarifa combinada). Útil si prefieres que no aparezca por separado.',
        clientTierLabel: 'Nivel de precio',
        clientTierNone: 'Estándar (base)',
        generateBtn: 'Generar hoja',
        generateTitle: 'Generar hoja de precios',
        forClient: 'Cliente',
        forState: 'Estado',
        selectClientPlaceholder: 'Elegir cliente…',
        searchClientPlaceholder: 'Buscar cliente por nombre o empresa…',
        noClientMatches: 'Sin resultados.',
        emailBtn: 'Enviar por correo',
        emailSubject: 'Lista de precios – {{business}}',
        emailBody: 'Hola {{name}},\n\nTe comparto nuestra lista de precios actualizada (adjunta en PDF).\n\nSaludos,\n{{business}}',
        generateForClientBtn: 'Generar lista de precios',
        preparedFor: 'Preparado para',
        sheetTitle: 'Hoja de precios',
        additionalCharges: 'Cargos adicionales',
        printBtn: 'Imprimir / Guardar PDF',
        generatedOn: 'Generado el',
        allStatesLabel: 'Todos los estados',
        genericSheet: 'Precios generales',
        customizeBtn: 'Personalizar',
        customizeTitle: 'Personalizar hoja de precios',
        accentColorLabel: 'Color principal',
        designLabel: 'Diseño',
        designClassic: 'Clásico',
        designCards: 'Tarjetas',
        designBold: 'Intenso',
        designElegant: 'Elegante',
        designMinimal: 'Minimalista',
        sectionOrderLabel: 'Orden de secciones',
        sectionOrderHint: 'Arrastra con las flechas para reordenar las categorías.',
      },
      navigation: {
        subtitle: 'Elige qué apps aparecen en la barra inferior.',
        title: 'Barra de navegación',
        intro: 'Elige hasta {{max}} apps para la barra inferior y arrástralas para ordenarlas. Inicio y Más siempre están.',
        inBarLabel: 'En la barra',
        availableLabel: 'Disponibles',
        reorderHint: 'Mantén presionada una app y arrástrala para reordenar.',
        inicioLabel: 'Inicio',
        masLabel: 'Más',
        fixedBadge: 'Fijo',
        maxNote: 'Hasta {{max}} apps personalizables',
        maxReached: 'Puedes elegir hasta {{max}} apps. Quita una para agregar otra.',
        minReached: 'Debes mantener al menos una app.',
        savedError: 'No se pudo guardar. Intenta de nuevo.',
      },
      employeesSection: {
        title: 'Campos de empleados',
        subtitle: 'Configura campos personalizados para tus empleados.',
        customFieldsSubtitle: 'Campos extra que aparecerán en el formulario de cada empleado.',
      },
      jobsSection: {
        title: 'Campos del trabajo',
        subtitle: 'Reordena los campos, marca cuáles son requeridos, y agrega campos personalizados.',
      },
      invoicesSection: {
        title: 'Campos de la factura',
        subtitle: 'Reordena los campos, marca cuáles son requeridos, y agrega campos personalizados.',
      },
      crewMode: {
        heading: 'Modo cuadrilla',
        subtitle: 'Permite a los líderes asignar la cuadrilla y registrar sus horas. Desactívalo si trabajas solo: oculta los selectores de líder, cuadrilla y choferes en los trabajos.',
        saveBtn: 'Guardar modo cuadrilla',
        saveSuccess: 'Modo cuadrilla guardado.',
        saveError: 'No se pudo guardar.',
      },
      itemTypes: {
        heading: 'Materiales y mano de obra',
        subtitle: 'Muestra la sección de Materiales y mano de obra (con etiquetas Mano de obra / Material / Equipo / Otro) en los trabajos. Desactívalo para ocultarla por completo — para negocios que no detallan líneas. Las propuestas siempre la mantienen.',
        toggleLabel: 'Mostrar sección',
        saveSuccess: 'Guardado',
        saveError: 'No se pudo guardar',
      },
      crewFinderToggle: {
        heading: 'Sugerir cuadrilla',
        subtitle: 'Muestra un botón “Sugerir cuadrilla” en el formulario de trabajo que ordena a tu equipo por cercanía al trabajo y quién está libre ese día. Desactívalo si solo asignas a tu propio equipo.',
        toggleLabel: 'Mostrar botón',
        saveSuccess: 'Guardado',
        saveError: 'No se pudo guardar',
      },
      privateOnInvoice: {
        heading: 'Privado al facturar',
        subtitle: 'Cambia automáticamente los trabajos a privado (ocultos para la cuadrilla) en cuanto se facturan. Aplica a todos los caminos: detalle, generación de factura e importación.',
        toggleLabel: 'Cambiar trabajos a privado al facturar',
      },
      jobAlerts: {
        heading: 'Alertas de trabajos próximos',
        subtitle: 'Resalta los trabajos cuya fecha de inicio se acerca para que sepas cuáles necesitan ser programados.',
        enabledLabel: 'Activar alertas',
        enabledHint: 'Cuando esté activo, cada trabajo programado mostrará un borde de color en la lista según los niveles configurados.',
        levelsHeading: 'Niveles de alerta',
        levelsEmpty: 'Agrega al menos un nivel para mostrar alertas en las tarjetas.',
        daysLabel: 'Días antes',
        colorLabel: 'Color',
        daysSuffixOne: 'día antes',
        daysSuffixMany: 'días antes',
        addLevelBtn: 'Agregar nivel',
        removeLevelLabel: 'Eliminar nivel',
        overdueHeading: 'Indicador de atrasados',
        overdueSubtitle: 'Marca en rojo los trabajos que ya pasaron su fecha programada y aún no se completan.',
        overdueBadge: 'Atrasado',
        colors: {
          red: 'Rojo',
          orange: 'Naranja',
          yellow: 'Amarillo',
          blue: 'Azul',
          purple: 'Morado',
        },
        saveBtn: 'Guardar alertas',
        saveSuccess: '¡Guardado!',
        saveError: 'Error al guardar.',
      },
      assignmentFieldsSection: {
        title: 'Campos por trabajador',
        subtitle: 'Campos que el líder llenará para cada trabajador.',
      },
      contactsStats: {
        heading: 'Resumen de contactos',
        clientsLabel: 'Clientes',
        contactsLabel: 'Personas de contacto',
        totalLabel: 'Total',
        googleHint: 'Los clientes y sus personas de contacto se sincronizan con Google Contacts cuando la sincronización está activa.',
      },
      unsavedChangesTitle: 'Cambios sin guardar',
      unsavedChangesMessage: '¿Descartar los cambios? Esta acción no se puede deshacer.',
      discardBtn: 'Descartar',
      fieldTypes: {
        text: 'Texto',
        note: 'Nota (texto largo)',
        number: 'Número',
        date: 'Fecha',
        boolean: 'Sí / No',
        select: 'Lista de opciones',
      },
      pipelineSteps: {
        proposal: { label: 'Cotización', description: 'Fase inicial de cotizaciones' },
        sent: { label: 'Enviada', description: 'Cotización enviada al cliente' },
        accepted: { label: 'Aceptada', description: 'Cotización aceptada por el cliente' },
        scheduled: { label: 'Programado', description: 'Trabajo agendado con fecha' },
        in_progress: { label: 'En progreso', description: 'Trabajo actualmente en ejecución' },
        completed: { label: 'Completado', description: 'Trabajo terminado' },
        invoiced: { label: 'Facturado', description: 'Factura generada para el trabajo' },
      },
      business: {
        heading: 'Información del negocio',
        subtitle: 'Datos básicos de tu empresa.',
        nameLabel: 'Nombre del negocio',
        logoLabel: 'Logo',
        logoUploadBtn: 'Subir logo',
        logoChangeBtn: 'Cambiar logo',
        logoRemoveBtn: 'Quitar logo',
        logoRemoveConfirm: '¿Quitar el logo? Se eliminará permanentemente.',
        logoUploading: 'Subiendo…',
        logoError: 'No se pudo subir el logo. Intenta de nuevo.',
        logoSizeError: 'La imagen supera el límite de 2 MB.',
        contactHeading: 'Contacto',
        emailLabel: 'Correo electrónico',
        phoneLabel: 'Teléfono',
        websiteLabel: 'Sitio web',
        addressHeading: 'Dirección',
        addressLabel: 'Dirección',
        cityLabel: 'Ciudad',
        stateLabel: 'Estado',
        zipLabel: 'Código postal',
        legalHeading: 'Información fiscal y legal',
        taxIdLabel: 'ID fiscal / EIN',
        licenseLabel: 'Número de licencia',
        invoiceHeading: 'Facturación',
        invoiceNotesLabel: 'Notas predeterminadas de factura',
        invoiceNotesPlaceholder: 'Términos de pago, instrucciones de transferencia, etc.',
        operatingHoursHeading: 'Horario de atención',
        operatingHoursSub: 'Define tu horario para recibir un aviso cuando un trabajo se programe fuera de él.',
        closedLabel: 'Cerrado',
        openTimeLabel: 'Abre',
        closeTimeLabel: 'Cierra',
        days: {
          mon: 'Lunes',
          tue: 'Martes',
          wed: 'Miércoles',
          thu: 'Jueves',
          fri: 'Viernes',
          sat: 'Sábado',
          sun: 'Domingo',
        },
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
      invoices: {
        heading: 'Configuración predeterminada',
        subtitle: 'Términos por defecto y campos personalizados de tus facturas.',
        defaultLanguageLabel: 'Idioma de factura por defecto',
        defaultLanguageHint: 'El idioma en que empiezan las facturas nuevas. Puedes cambiarlo en cada factura.',
        emailDeliveryLabel: 'Envío por correo',
        emailDeliveryHint: 'Qué se incluye al enviar una factura por correo.',
        emailDeliveryPdf: 'Solo adjuntar PDF',
        emailDeliveryLink: 'Solo enlace',
        emailDeliveryBoth: 'PDF y enlace',
        emailLinkMissingWarning: 'El envío incluye un enlace, pero tu mensaje no tiene el marcador {{enlace}} — el cliente no recibirá el enlace. Agrega {{enlace}} al mensaje o cambia a "Solo adjuntar PDF".',
        emailLinkUnusedWarning: 'El envío es "Solo adjuntar PDF", pero tu mensaje tiene el marcador {{enlace}} — se quitará y no se enviará ningún enlace. Cambia a "Solo enlace" o "PDF y enlace" para incluirlo, o quita {{enlace}}.',
        dueDaysLabel: 'Días de vencimiento por defecto',
        dueDaysHint: 'Al crear una factura, la fecha de vencimiento se pone automáticamente a estos días de la fecha de emisión. Si lo dejas vacío, se usan 30 días (Neto 30).',
        taxRateLabel: 'Impuesto por defecto (%)',
        taxRateHint: 'Se aplica a las facturas nuevas; puedes ajustarlo en cada factura. Déjalo vacío o en 0 para no cobrar impuesto. No cambia las facturas ya creadas.',
        qtyFieldLabel: 'Campo para la cantidad',
        qtyFieldHint: 'Cuando un trabajo no tiene materiales y mano de obra, usa el valor de este campo personalizado (ej. "Total pies") como la cantidad de la línea. Déjalo en "Ninguno" para usar 1.',
        qtyFieldNone: 'Ninguno (cantidad 1)',
        startNumberLabel: 'Número inicial de factura',
        startNumberHint: 'La primera factura usará este número y las siguientes se numeran en orden (FAC-1000, FAC-1001…). No cambia las facturas ya creadas.',
        notesLabel: 'Notas / términos por defecto',
        notesPlaceholder: 'Términos de pago, instrucciones de transferencia, etc.',
        emailHeading: 'Email al enviar factura',
        emailSubtitle: 'Personaliza el correo que se abre al presionar "Enviar factura". No cambia el documento de la factura.',
        emailSubjectLabel: 'Asunto del email',
        emailBodyLabel: 'Mensaje del email',
        emailVarsHint: 'Toca una variable para insertarla donde esté el cursor. Déjalo vacío para usar el mensaje estándar.',
        saveError: 'Error al guardar.',
        saveSuccess: '¡Guardado!',
        confirmDeleteField: '¿Eliminar este campo? Los datos en facturas existentes se perderán.',
        design: {
          title: 'Diseño de factura',
          subtitle: 'Elige una plantilla y personalízala. Se aplica a la vista, al PDF y al enlace público.',
          defaultLanguage: 'Idioma por defecto de la factura',
          defaultLanguageHint: 'Las facturas nuevas se crean en este idioma. Puedes cambiarlo en cada factura.',
          layout: 'Disposición',
          layoutModes: { structured: 'Estructurada', freeform: 'Libre' },
          builderHint: 'Arrastra cada sección para moverla y usa la esquina para cambiar su tamaño.',
          builderMobileHint: 'La disposición libre se edita desde la web. Aquí puedes ver el resultado.',
          preset: 'Plantilla',
          presets: {
            classic: 'Plantilla 1', band: 'Plantilla 2', sidebar: 'Plantilla 3', split: 'Plantilla 4',
            stamp: 'Plantilla 5', leftbar: 'Plantilla 6', centered: 'Plantilla 7', minimal: 'Plantilla 8',
            hero: 'Plantilla 9', ledger: 'Plantilla 10', masthead: 'Plantilla 11', boutique: 'Plantilla 12',
            wave: 'Plantilla 13', fresh: 'Plantilla 14', orbit: 'Plantilla 15', prism: 'Plantilla 16',
          },
          presetGroups: {},
          browseThemes: 'Ver plantillas',
          themesTitle: 'Elige una plantilla',
          useTheme: 'Usar esta plantilla',
          currentTheme: 'Plantilla actual',
          archetype: 'Estilo de encabezado',
          archetypeHint: 'Cambia la estructura del encabezado sin cambiar de plantilla.',
          archetypes: {
            classic: 'Clásico', band: 'Banda', centered: 'Centrado', sidebar: 'Lateral', minimal: 'Minimalista',
          },
          accent: 'Color de acento',
          font: 'Tipografía',
          fonts: { sans: 'Sans serif', helvetica: 'Helvetica', gillsans: 'Gill Sans', futura: 'Futura', avenir: 'Avenir', optima: 'Optima', trebuchet: 'Trebuchet', verdana: 'Verdana', serif: 'Serif (Georgia)', times: 'Times', palatino: 'Palatino', baskerville: 'Baskerville', didot: 'Didot', hoefler: 'Hoefler', typewriter: 'American Typewriter', copperplate: 'Copperplate', mono: 'Monoespaciada', courier: 'Courier' },
          density: 'Densidad',
          densities: { comfortable: 'Cómoda', compact: 'Compacta' },
          invertLogo: 'Invertir colores del logo',
          showLogo: 'Mostrar logo',
          logoSize: 'Tamaño del logo',
          logoSizes: { sm: 'Pequeño', md: 'Mediano', lg: 'Grande' },
          sections: 'Secciones',
          sectionNames: {
            header: 'Encabezado', billTo: 'Facturar a', lineItems: 'Conceptos', totals: 'Totales',
            customFields: 'Campos personalizados', notes: 'Notas', paymentInstructions: 'Instrucciones de pago', footer: 'Pie de página',
          },
          columns: 'Columnas',
          columnNames: { qty: 'Cant.', rate: 'Precio', total: 'Total' },
          textBlocks: 'Bloques de texto',
          headerNote: 'Nota del encabezado',
          paymentInstructionsField: 'Instrucciones de pago',
          footerField: 'Pie de página',
          preview: 'Vista previa',
          elements: {
            addText: 'Texto',
            addField: 'Campo',
            addLogo: 'Logo',
            addShape: 'Forma',
            addIcon: 'Ícono',
            shapeKinds: { rectangle: 'Rectángulo', ellipse: 'Círculo' },
            fillColor: 'Relleno',
            opacity: 'Opacidad',
            cornerRadius: 'Esquinas',
            selectField: 'Elige un campo…',
            textContent: 'Texto',
            fontSize: 'Tamaño',
            color: 'Color',
            align: 'Alineación',
            deleteEl: 'Eliminar',
            empty: 'Arrastra los elementos para colocarlos. Toca uno para editarlo.',
          },
          decoration: 'Decoración',
          decorations: { none: 'Ninguna', corners: 'Esquinas', wave: 'Onda', arc: 'Arco' },
          pageTint: 'Tinte de fondo',
          fields: {
            businessName: 'Nombre del negocio', businessContact: 'Contacto del negocio',
            invoiceTitle: 'Título (Factura)', invoiceNumber: 'Número de factura', status: 'Estado',
            issueDate: 'Fecha de emisión', dueDate: 'Fecha de vencimiento',
            billToLabel: 'Etiqueta "Facturar a"', billToName: 'Nombre del cliente', billToContact: 'Contacto del cliente',
            lineItems: 'Tabla de conceptos', subtotal: 'Subtotal', tax: 'Impuesto', total: 'Total',
            notes: 'Notas', paymentInstructions: 'Instrucciones de pago',
            headerNote: 'Nota del encabezado', footer: 'Pie de página',
          },
          elementFont: 'Fuente',
          undo: 'Deshacer',
          redo: 'Rehacer',
          copyTheme: 'Empezar desde una plantilla',
          copyThemeTitle: 'Empezar desde una plantilla',
          blankTheme: 'En blanco',
        },
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
        fieldNameLabelEs: 'Nombre (Español)',
        fieldNameLabelEn: 'Nombre (English)',
        translationHint: 'Completa al menos uno. Cada usuario ve el nombre en su idioma; si falta, se usa el otro.',
        keyLabel: 'Clave',
        fieldTypeLabel: 'Tipo de campo',
        optionsLabel: 'Opciones',
        optionsHint: '(una por línea)',
        optionsPlaceholder: 'Opción 1\nOpción 2\nOpción 3',
        requiredToggleLabel: 'Campo requerido',
        integerOnlyToggleLabel: 'Solo números enteros',
        integerOnlyHint: 'Sin decimales (ej. 5, no 5.5)',
        thousandsToggleLabel: 'Separador de miles',
        thousandsHint: 'Muestra 1,000 en vez de 1000',
        multiToggleLabel: 'Permitir varias opciones',
        multiHint: 'Se pueden marcar varias a la vez',
        addFieldBtn: 'Agregar campo',
        updateFieldBtn: 'Actualizar campo',
        errorNameRequired: 'El nombre del campo es requerido',
        errorDuplicate: 'Ya existe un campo con ese nombre',
        errorSave: 'Error al guardar.',
        confirmDelete: '¿Eliminar este campo? Los datos en clientes existentes se perderán.',
      },
      account: {
        heading: 'Cuenta',
        subtitle: 'Tu información de acceso.',
        emailLabel: 'Correo',
        roleLabel: 'Rol',
        firstNameLabel: 'Nombre',
        lastNameLabel: 'Apellido',
        saveNameBtn: 'Guardar nombre',
        nameSaveSuccess: 'Nombre actualizado.',
        nameSaveError: 'No se pudo guardar el nombre.',
        businessesHeading: 'Tus negocios',
        businessesSubtitle: 'Negocios donde eres miembro y tu rol en cada uno.',
        businessesEmpty: 'Aún no eres miembro de ningún negocio.',
        logoutConfirm: '¿Seguro que quieres cerrar sesión?',
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
        currentPasswordLabel: 'Contraseña actual',
        currentPasswordPlaceholder: 'Tu contraseña actual',
        newPasswordLabel: 'Nueva contraseña',
        newPasswordPlaceholder: 'Mínimo 8 caracteres',
        showPassword: 'Mostrar contraseña',
        hidePassword: 'Ocultar contraseña',
        saveBtn: 'Actualizar contraseña',
        errorMinLength: 'Mínimo 8 caracteres',
        errorCurrentRequired: 'Ingresa tu contraseña actual.',
        errorCurrentWrong: 'La contraseña actual es incorrecta.',
        errorPrefix: 'Error: {{message}}',
        successMsg: '¡Contraseña actualizada!',
      },
      support: {
        heading: 'Soporte y comentarios',
        subtitle: '¿Tienes un problema o una idea? Escríbenos y te ayudamos.',
        contactBtn: 'Enviar correo',
        emailSubject: 'Amixos — Soporte / Comentarios',
        noMailApp: 'No se pudo abrir tu app de correo. Escríbenos a {{email}}.',
      },
      google: {
        heading: 'Sincronizar con Google Contactos',
        subtitle: 'Cuando agregas un cliente, también se guarda en tus contactos de Google para que aparezca su nombre cuando te llamen.',
        scopeNote: 'Esta conexión es por negocio. Negocio activo: {{name}}',
        statusCheckError: 'No se pudo verificar la conexión. Revisa tu internet o la configuración del API.',
        connectBtn: 'Conectar con Google',
        reconnectBtn: 'Reconectar con Google',
        disconnectBtn: 'Desconectar',
        forceSyncBtn: 'Forzar sincronización manual',
        connected: 'Conectado',
        disconnected: 'Desconectado',
        reconnectNeeded: 'Reconexión requerida',
        contactGroupLabel: 'Grupo de contactos',
        contactGroupNoneOption: 'Mis contactos (predeterminado)',
        lastSyncedAt: 'Última sincronización',
        lastSyncError: 'Último error',
        connectError: 'No se pudo conectar con Google. Intenta de nuevo.',
        cancelled: 'Conexión cancelada.',
        disconnectTitle: 'Desconectar Google Contactos',
        disconnectBody: 'Tus clientes de Amixos ya no se sincronizarán con Google.',
        disconnectCountGeneric: '¿Qué quieres hacer con los contactos que Amixos agregó a Google?',
        disconnectCountWithNumber: '¿Qué quieres hacer con los {{count}} contactos que Amixos agregó a Google?',
        disconnectKeepBtn: 'Mantener en Google',
        disconnectDeleteBtn: 'Eliminar de Google',
        backfillTitle: 'Sincronizar clientes existentes',
        backfillBody: 'Tienes {{count}} clientes en Amixos que aún no están en Google. ¿Quieres agregarlos a tus contactos de Google ahora?',
        backfillSyncBtn: 'Sí, sincronizar',
        backfillSkipBtn: 'No, gracias',
        backfillProgress: 'Sincronizando {{count}} contactos...',
        backfillDoneTitle: '¡Sincronización completa!',
        backfillDoneBody: '{{created}} agregados, {{linked}} vinculados.',
        backfillFailedToast: 'No se pudo completar la sincronización.',
        templateTitle: 'Plantilla de notas',
        templateHint: 'Personaliza el campo "Notas" de Google Contacts. Algunos campos personalizados no se ven en dispositivos que no usan Google Contacts de forma nativa. Usa {{Etiqueta del campo}} para insertar el valor. Las líneas con campos vacíos se omiten automáticamente.',
        templatePlaceholder: 'Ej.\nMarca de Pivot: {{Marca de Pivot}}\nMarca de Granero: {{Marca de Granero}}',
        templateAvailable: 'Disponibles',
        templateSaveBtn: 'Guardar plantilla',
        templateSaving: 'Guardando…',
        templateSaved: 'Plantilla guardada. Se aplicará al próximo sync.',
        templateSaveError: 'No se pudo guardar la plantilla. Intenta de nuevo.',
        templateReapplyBtn: 'Aplicar a contactos existentes',
        templateReapplyEmpty: 'No hay contactos sincronizados a los que aplicar la plantilla todavía.',
        templateReapplyConfirmTitle: '¿Aplicar la plantilla a contactos existentes?',
        templateReapplyConfirmBody: 'Se actualizarán {{count}} contactos sincronizados con Google. Tomará varios minutos. Puedes cancelar en cualquier momento.',
        templateReapplyConfirmBtn: 'Aplicar',
      },
      team: {
        heading: 'Equipo',
        subtitle: 'Invita a tu equipo y administra sus permisos',
        membersHeading: 'Miembros',
        invitesHeading: 'Invitaciones pendientes',
        inviteBtn: 'Invitar miembro',
        inviteModalTitle: 'Invitar a un miembro',
        emailLabel: 'Correo electrónico',
        emailPlaceholder: 'correo@ejemplo.com',
        roleLabel: 'Rol',
        sendInviteBtn: 'Enviar invitación',
        sending: 'Enviando...',
        copyLinkBtn: 'Copiar enlace',
        linkCopied: 'Enlace copiado',
        pendingBadge: 'Pendiente',
        expiredBadge: 'Expirada',
        acceptedBadge: 'Aceptada',
        revokeBtn: 'Revocar',
        removeBtn: 'Quitar',
        verComoBtn: 'Ver como',
        verComoNotAllowed: 'No puedes ver la cuenta de este usuario.',
        verComoNotMember: 'Este usuario ya no es miembro.',
        verComoFailed: 'No se pudo iniciar “Ver como”. Inténtalo de nuevo.',
        changeRoleBtn: 'Cambiar rol',
        youSuffix: '(tú)',
        ownerSuffix: '(propietario)',
        noMembersYet: 'Aún no hay miembros además de ti.',
        noPendingInvites: 'No hay invitaciones pendientes.',
        inviteSentToast: 'Invitación enviada a {{email}}.',
        inviteFailedToast: 'No se pudo enviar la invitación.',
        confirmRemove: '¿Quitar a {{name}} del negocio?',
        confirmRevoke: '¿Revocar la invitación para {{email}}?',
        errorInviteSelf: 'No puedes invitarte a ti mismo.',
        errorAlreadyMember: 'Esta persona ya es miembro.',
        errorAlreadyInvited: 'Ya hay una invitación pendiente para este correo.',
      },
      activity: {
        heading: 'Actividad',
        subtitle: 'Registro de cambios importantes en este negocio',
        emptyState: 'Aún no hay actividad registrada.',
        loadMore: 'Cargar más',
        unknownUser: 'Usuario desconocido',
        searchPlaceholder: 'Buscar por persona, acción o detalle...',
        noResults: 'Ningún cambio coincide con tu búsqueda.',
        timeJustNow: 'ahora mismo',
        timeMinutesAgo: 'hace {{n}} min',
        timeHoursAgo: 'hace {{n}} h',
        timeDaysAgo: 'hace {{n}} d',
      },
      store: {
        heading: 'Tienda de módulos',
        subtitle: 'Activa o desactiva los módulos para tu negocio.',
        statusAvailable: 'Disponible',
        statusComingSoon: 'Próximamente',
        enabledBadge: 'Activo',
        enable: 'Activar',
        disable: 'Desactivar',
        enableConfirmTitle: '¿Activar {{name}}?',
        enableConfirmBody: 'Estos módulos no son necesarios — agregan funciones extra para tu negocio. Puedes desactivarlo en cualquier momento.',
        disableConfirmTitle: '¿Desactivar {{name}}?',
        disableConfirmBody: 'Perderás acceso a las funciones de este módulo. Tus datos se conservan y puedes volver a activarlo cuando quieras.',
        searchPlaceholder: 'Buscar módulo...',
        categoryAll: 'Todos',
        categoryTools: 'Herramientas',
        categoryIndustry: 'Industria',
        noResults: 'No se encontraron módulos.',
      },
    },
    modules: {
      placeholder: {
        heading: 'Próximamente',
        body: 'Este módulo aún está en desarrollo. Pronto podrás usarlo aquí.',
      },
      list: {
        map:          { name: 'Mapa',         description: 'Visualiza clientes, trabajos y empleados en un mapa' },
        mechanic:     { name: 'Mecánico',     description: 'Órdenes de trabajo, VIN, partes, diagnóstico' },
        salon:        { name: 'Salón',        description: 'Citas, comisiones de estilistas, menú de servicios' },
        landscaping:  { name: 'Jardinería',   description: 'Propiedades, calendario estacional, equipo' },
        restaurant:   { name: 'Restaurante',  description: 'Mesas, menú, pedidos, inventario de cocina' },
        cleaning:     { name: 'Limpieza',     description: 'Rutas, listas de tareas, productos' },
        construction: { name: 'Construcción', description: 'Permisos, planos, mediciones, subcontratistas' },
        rentals:      { name: 'Propiedades en renta', description: 'Inquilinos, pagos, contratos, solicitudes de mantenimiento' },
        loyalty:      { name: 'Programa de lealtad',   description: 'Recompensas y puntos de clientes frecuentes' },
        trainer:      { name: 'Entrenador',            description: 'Planes de entrenamiento y alimentación para tus clientes' },
        files:        { name: 'Archivos',              description: 'Manuales y documentos que tu equipo puede abrir (sube archivos o pega enlaces)' },
        fundraising:  { name: 'Recaudación',           description: 'Para organizaciones sin fines de lucro: metas y fondos recaudados' },
        equipment:    { name: 'Maquinaria',            description: 'Camiones, autos, equipo pesado y todo lo demás de tu negocio' },
        inventory:    { name: 'Inventario',            description: 'Productos, partes y materiales con conteo de existencias' },
        wedding:      { name: 'Bodas',                 description: 'Invitados, cronograma del evento y planeación' },
        dealership:   { name: 'Concesionario',         description: 'Inventario de autos y ventas del lote' },
        messaging:    { name: 'Mensajería SMS',        description: 'Envía mensajes de texto a tus clientes con Twilio o ClickSend' },
      },
      messaging: {
        title: 'Mensajería SMS',
        subtitle: 'Conecta tu proveedor y manda mensajes a tus clientes desde Amixos.',
        connectTitle: 'Conectar proveedor',
        providerLabel: 'Proveedor',
        providerHint: 'Usa tu propia cuenta de Twilio o ClickSend.',
        twilio: 'Twilio',
        clicksend: 'ClickSend',
        accountSidLabel: 'Account SID',
        authTokenLabel: 'Auth Token',
        usernameLabel: 'Usuario',
        apiKeyLabel: 'API Key',
        fromNumberLabel: 'Número remitente',
        fromNumberHint: 'El número desde el que se envían los SMS (formato +1...).',
        saveBtn: 'Conectar',
        verifying: 'Verificando…',
        connected: 'Conectado',
        connectedVia: 'Conectado con {{provider}}',
        fromShown: 'Desde {{number}}',
        change: 'Cambiar',
        disconnect: 'Desconectar',
        composeTitle: 'Enviar mensaje',
        clientLabel: 'Cliente',
        selectClient: 'Selecciona un cliente',
        manualNumber: 'Número manual',
        toLabel: 'Para',
        toPlaceholder: '+1 555 123 4567',
        messageLabel: 'Mensaje',
        messagePlaceholder: 'Escribe tu mensaje...',
        sendBtn: 'Enviar SMS',
        sending: 'Enviando…',
        sentToast: '¡Mensaje enviado!',
        onlyWriters: 'Solo el dueño o administradores pueden conectar el proveedor.',
        notConfigured: 'Conecta un proveedor para empezar a enviar mensajes.',
        errors: {
          invalid_credentials: 'Credenciales inválidas. Revisa tus datos.',
          missing_credentials: 'Faltan datos de la cuenta.',
          not_configured: 'No hay proveedor conectado.',
          network_error: 'No se pudo conectar con el proveedor.',
          generic: 'Algo salió mal. Intenta de nuevo.',
        },
      },
      map: {
        layers: {
          clients: 'Clientes',
          jobs: 'Trabajos',
          employees: 'Empleados',
        },
        searchPlaceholder: 'Buscar por nombre, ciudad, estado...',
        searchNoResults: 'Sin resultados.',
        searchResultsCount: '{{count}} resultados',
        layerToggleHint: 'Toca para mostrar / ocultar',
        resetView: 'Ver todos los pines',
        noPinsYet: 'Aún no hay pines para mostrar.',
        geocodeMissing: '{{count}} clientes sin coordenadas. Toca para localizarlos.',
        geocodeRunning: 'Localizando clientes...',
        geocodeDone: 'Listo. {{count}} clientes localizados.',
        geocodeProgress: 'Localizando: {{done}} de {{total}}…',
        geocodeBreakdown: '{{noAddr}} sin dirección · {{unresolved}} no encontrados · {{pending}} pendientes',
        geocodeBreakdownNoAddress: '{{count}} sin dirección',
        geocodeBreakdownUnresolved: '{{count}} no encontrados',
        geocodeBreakdownPending: '{{count}} pendientes',
        geocodeNoneLeft: 'No quedan clientes para localizar.',
        geocodeListTitle: 'Clientes sin coordenadas',
        geocodeListSectionNoAddress: 'Sin dirección',
        geocodeListSectionUnresolved: 'No encontrados',
        geocodeListSectionPending: 'Pendientes',
        geocodeListEmpty: 'No hay clientes sin coordenadas.',
        geocodeListNoAddressHint: 'Agrega calle, ciudad y estado en el detalle del cliente.',
        geocodeListUnresolvedHint: 'Google no pudo encontrar esta dirección. Verifica y corrige los campos.',
        geocodeListRetryBtn: 'Reintentar pendientes',
        geocodeListOpenClient: 'Abrir cliente',
        geocodeListUnnamed: 'Sin nombre',
        geocodeIgnoreBtn: 'Ignorar permanentemente',
        geocodeRestoreBtn: 'Restaurar',
        ignoredSectionTitle: 'Clientes ignorados',
        ignoredSectionSubtitle: 'Restaura un cliente para que vuelva a contar en el mapa.',
        outreachModeOn: 'Modo seguimiento',
        outreachModeOff: 'Quitar seguimiento',
        outreachModeBadge: 'Contactados en los últimos {{days}} días: marcados con ✓',
        outreachDaysLabel: 'Seguimiento de contacto',
        outreachDaysSubtitle: 'Días para marcar un cliente como contactado en el modo seguimiento.',
        outreachDaysValue: '{{days}} días',
        settingsTitle: 'Ajustes del mapa',
        mapTypeLabel: 'Tipo de mapa',
        mapTypeStandard: 'Estándar',
        mapTypeSatellite: 'Satélite',
        mapTypeHybrid: 'Híbrido',
        mapTypeTerrain: 'Terreno',
        clusteringLabel: 'Agrupar pines cercanos',
        clusteringSubtitle: 'Junta los pines en grupos cuando estén apilados.',
        pinSizeLabel: 'Tamaño del pin',
        pinSizeSmall: 'Pequeño',
        pinSizeMedium: 'Mediano',
        pinSizeLarge: 'Grande',
        pinRulesHeading: 'Estilos por capa',
        pinRulesSubtitle: 'Color y forma del pin según el valor de un campo.',
        pinLayerClients: 'Clientes',
        pinLayerJobs: 'Trabajos',
        pinLayerEmployees: 'Empleados',
        defaultStyleLabel: 'Estilo por defecto',
        colorByFieldLabel: 'Colorear según el campo',
        noFieldOption: 'Sin regla (usar estilo por defecto)',
        addRuleBtn: 'Agregar regla',
        rulesEmpty: 'Sin reglas. Agrega una para colorear según un valor.',
        ruleValueLabel: 'Valor',
        ruleValuePlaceholder: 'Ej. Valley',
        pinShapePin: 'Pin',
        pinShapeCircle: 'Círculo',
        pinShapeSquare: 'Cuadrado',
        pinShapeTriangle: 'Triángulo',
        pinShapeStar: 'Estrella',
        modeLabel: 'Modo',
        modeNoRule: 'Sin regla',
        modeCustom: 'Regla personalizada',
        applyRuleToLabel: 'Aplicar regla al campo',
        ruleFieldPlaceholder: 'Elige un campo',
        editStylePinHint: 'Editar estilo',
        stylePickerTitle: 'Color e icono',
        colorLabel: 'Color del pin',
        iconColorLabel: 'Color del icono',
        iconLabel: 'Icono',
        iconCategories: {
          location: 'Ubicación',
          buildings: 'Edificios',
          agriculture: 'Agricultura',
          weather: 'Clima',
          tools: 'Herramientas',
          vehicles: 'Vehículos',
          people: 'Personas',
          status: 'Estado',
          commerce: 'Comercio',
          tech: 'Tecnología',
        },
        iconSearchPlaceholder: 'Buscar icono… (ej. tornado, droplets)',
        iconSearchNoResults: 'No hay iconos que coincidan.',
        ruleMatchCount: '{{count}} coincidencias',
        ruleMatchCountSingle: '1 coincidencia',
        ruleMatchCountZero: 'Sin coincidencias',
        operatorEquals: 'Igual a',
        operatorNotEquals: 'Diferente de',
        operatorHasValue: 'Tiene cualquier valor',
        operatorContains: 'Contiene',
        operatorGt: 'Mayor que',
        operatorGte: 'Mayor o igual a',
        operatorLt: 'Menor que',
        operatorLte: 'Menor o igual a',
        anyValuePlaceholder: '(cualquier valor)',
        ruleHideTooltip: 'Ocultar pines que coincidan',
        ruleHiddenCount: '{{count}} ocultos',
        ruleHiddenCountSingle: '1 oculto',
        ruleOrderNote: 'El orden importa: la primera regla que coincide gana.',
        saveBtn: 'Guardar',
        saveSuccess: 'Ajustes guardados.',
        saveError: 'No se pudieron guardar los ajustes.',
        openRecord: 'Abrir',
        noClient: 'Sin cliente',
        noAddress: 'Sin dirección',
        assignedToJob: 'Asignado a',
        weather: {
          sectionTitle: 'Alertas de clima',
          sectionSubtitle: 'Activa para mostrar alertas del NWS (api.weather.gov) en el mapa.',
          enabledLabel: 'Activar alertas de clima',
          enabledSubtitle: 'Se mostrarán las alertas activas que coincidan con tus eventos.',
          retentionLabel: 'Retención de alertas (días)',
          retentionSubtitle: 'Las alertas vencidas se mantienen en caché este número de días antes de eliminarse.',
          proximityRadiusLabel: 'Radio de enfoque (millas)',
          proximityRadiusSubtitle: 'Distancia para filtrar clientes/trabajos/empleados cerca de una alerta cuando se activa el "Enfoque tormentas" en el mapa.',
          focusModeOn: 'Enfoque tormentas',
          focusModeOff: 'Quitar enfoque',
          focusModeBadge: 'Solo cerca de tormentas',
          excludedStatesLabel: 'Estados excluidos',
          excludedStatesPlaceholder: 'Ej: AK, HI, CA',
          eventsHeading: 'Tipos de alerta',
          eventsSubtitle: 'Sólo se mostrarán alertas cuyo "event" coincida con esta lista.',
          addEventBtn: 'Agregar Alerta',
          eventsEmpty: 'Sin tipos configurados.',
          eventNameLabel: 'Nombre del evento',
          eventNamePlaceholder: 'Selecciona un tipo',
          eventPickerTitle: 'Seleccionar tipo de alerta',
          eventPickerSearchPlaceholder: 'Buscar tipo...',
          eventPickerNoResults: 'Ningún tipo coincide.',
          eventCategories: {
            severe: 'Tormentas severas',
            wind: 'Viento',
            flood: 'Inundación',
            winter: 'Invierno',
            temperature: 'Temperatura',
            tropical: 'Tropical',
            fire: 'Fuego y aire',
            tsunami: 'Tsunami',
            general: 'General',
          },
          minWindLabel: 'Viento mínimo (mph)',
          minWindHint: 'Opcional. Filtra la alerta por velocidad de ráfaga reportada.',
          layerName: 'Clima',
          layerToggleHint: 'Toca para mostrar u ocultar las alertas activas.',
          refreshingNow: 'Actualizando alertas...',
          refreshLastAt: 'Actualizado {{when}}',
          refreshError: 'No se pudieron actualizar las alertas.',
          alertCount: '{{count}} alertas activas',
          alertCountSingle: '1 alerta activa',
          alertCountZero: 'Sin alertas activas',
          pinPopupExpires: 'Vence',
          pinPopupArea: 'Área',
          pinPopupSeverity: 'Severidad',
          pinPopupOpenNws: 'Abrir en NWS',
          pinPopupHeadline: 'Alerta',
          pinPopupEvent: 'Evento',
          pinPopupCity: 'Condado',
          pinPopupState: 'Estado',
          pinPopupStarts: 'Inicio',
          pinPopupEnds: 'Fin',
          pinPopupSent: 'Enviada NWS',
          pinPopupAdded: 'Agregada',
          pinPopupDescription: 'Descripción',
          pinPopupOtherAlerts: 'Otras alertas en esta ubicación',
          saveBtn: 'Guardar clima',
          saveSuccess: 'Configuración de clima guardada.',
          saveError: 'No se pudo guardar la configuración de clima.',
        },
      },
      equipment: {
        title: 'Maquinaria',
          subtitle: 'Camiones, autos, equipos pesados y todo lo demás.',
          countTotal: '{{count}} en total',
          addBtn: 'Agregar equipo',
          searchPlaceholder: 'Buscar por nombre, marca o placa...',
          emptyTitle: 'Sin equipos aún',
          emptyHint: 'Agrega tu primer equipo para empezar a darle seguimiento.',
          unassignedBadge: 'Sin asignar',
          paidOffBadge: 'Pagado',
          loanBadge: 'Préstamo',
          plateExpiresSoon: 'Placa vence en {{days}} días',
          plateExpired: 'Placa vencida',
          mileageUnit: '{{n}} mi',
          addTitle: 'Nuevo equipo',
          editTitle: 'Editar equipo',
          basicInfoHeading: 'Información básica',
          registrationHeading: 'Registro y placa',
          ownershipHeading: 'Propiedad',
          assignmentHeading: 'Asignación',
          photosHeading: 'Fotos',
          nameLabel: 'Nombre',
          namePlaceholder: 'Camión #1, Skid Loader, etc.',
          typeLabel: 'Tipo',
          typePlaceholder: 'Camión, auto, semi...',
          typeSuggestions: {
            truck: 'Camión',
            car: 'Auto',
            van: 'Camioneta',
            semi: 'Semi',
            trailer: 'Tráiler',
            skidLoader: 'Skid loader',
            tractor: 'Tractor',
            generator: 'Generador',
            other: 'Otro',
          },
          makeLabel: 'Marca',
          makePlaceholder: 'Ford, Chevrolet, John Deere...',
          modelLabel: 'Modelo',
          modelPlaceholder: 'F-150, Silverado, S650...',
          yearLabel: 'Año',
          yearPlaceholder: '2024',
          colorLabel: 'Color',
          colorPlaceholder: 'Blanco, negro, rojo...',
          vinLabel: 'VIN',
          vinPlaceholder: '17 caracteres',
          mileageLabel: 'Millaje',
          mileagePlaceholder: '0',
          plateNumberLabel: 'Número de placa',
          plateNumberPlaceholder: 'ABC-1234',
          plateExpirationLabel: 'Vencimiento de placa',
          paidOffLabel: 'Pagado por completo',
          loanLenderLabel: 'Prestamista',
          loanLenderPlaceholder: 'Banco, concesionario, persona...',
          assignedToLabel: 'Asignado a',
          assignedToNone: 'Sin asignar',
          notesLabel: 'Notas',
          notesPlaceholder: 'Detalles internos, recordatorios...',
          photoEmpty: 'Sin fotos aún. Agrega una para identificar este equipo.',
          photoAddBtn: 'Agregar foto',
          photoTakeBtn: 'Tomar foto',
          photoLibraryBtn: 'Elegir de la galería',
          photoUploading: 'Subiendo...',
          photoUploadError: 'No se pudo subir la foto.',
          photoDeleteConfirm: '¿Eliminar esta foto?',
          photoLimitHit: 'Máximo {{n}} fotos por equipo.',
          saveSuccess: 'Equipo guardado.',
          saveError: 'No se pudo guardar el equipo.',
          deleteBtn: 'Eliminar equipo',
          deleteConfirmTitle: 'Eliminar equipo',
          deleteConfirmMsg: 'Esta acción no se puede deshacer. ¿Continuar?',
          nameRequiredError: 'El nombre es requerido.',
          assignedToSearch: 'Buscar empleado...',
          selectNoResults: 'Sin resultados',
          scanVinHint: 'Apunta la cámara al código de barras del VIN',
          scanPermissionDenied: 'Permite el acceso a la cámara para escanear.',
          valueLabel: 'Valor',
          valuePlaceholder: '0',
          loanAmountLabel: 'Monto del préstamo',
          loanAmountPlaceholder: '0',
          detailTitle: 'Detalles del equipo',
          editBtn: 'Editar',
          createdLabel: 'Creado',
          updatedLabel: 'Última edición',
          setCoverBtn: 'Usar como portada',
          coverBadge: 'Portada',
          serialNumberLabel: 'Número de serie',
          serialNumberPlaceholder: 'Número de serie',
          insuranceHeading: 'Seguro',
          insuranceCarrierLabel: 'Aseguradora',
          insuranceCarrierPlaceholder: 'State Farm, Progressive...',
          insurancePolicyLabel: 'Número de póliza',
          insurancePolicyPlaceholder: 'Número de póliza',
          insuranceAgentLabel: 'Agente',
          insuranceAgentPlaceholder: 'Nombre del agente',
          insuranceAgentPhoneLabel: 'Teléfono del agente',
          insuranceAgentPhonePlaceholder: '(555) 123-4567',
          insuranceExpirationLabel: 'Vencimiento del seguro',
          insuranceExpired: 'Seguro vencido',
          insuranceExpiresSoon: 'Vence en {{days}} d',
          purchaseDateLabel: 'Fecha de compra',
          warrantyExpirationLabel: 'Vencimiento de garantía',
          locationLabel: 'Ubicación',
          locationPlaceholder: 'Taller, obra, almacén...',
          groups: {
            button: 'Agrupar',
            title: 'Agrupar por',
            none: 'Ninguno',
            lead: 'Encargado',
            type: 'Tipo',
            property: 'Propiedad',
            expiration: 'Vencimiento de placa',
            unassigned: 'Sin asignar',
            noType: 'Sin tipo',
            paid: 'Pagado',
            financed: 'Financiado',
            expired: 'Placas vencidas',
            expiringSoon: 'Por vencer',
            valid: 'Vigentes',
            noPlate: 'Sin placa',
          },
          filters: {
            title: 'Filtro rápido',
            all: 'Todo',
            plateExpired: 'Placa vencida',
            plateExpiring: 'Placa por vencer',
            policyExpired: 'Póliza vencida',
            policyExpiring: 'Póliza por vencer',
          },
        },
      rentals: {
        title: 'Propiedades en renta',
        subtitle: 'Inquilinos, rentas, contratos y mantenimiento.',
        saveError: 'No se pudo guardar. Intenta de nuevo.',
        tabs: { overview: 'Resumen', properties: 'Propiedades', tenants: 'Inquilinos' },
        propertiesCount: '{{count}} propiedades',
        searchPlaceholder: 'Buscar por nombre o dirección…',
        addProperty: 'Agregar propiedad',
        editProperty: 'Editar propiedad',
        deleteConfirmTitle: '¿Eliminar propiedad?',
        deleteConfirmBody: 'Se eliminarán también sus contratos, cobros, pagos, gastos y mantenimiento. Esta acción no se puede deshacer.',
        emptyTitle: 'Sin propiedades todavía',
        emptyHint: 'Agrega tu primera propiedad para empezar a llevar rentas y gastos.',
        propertyForm: {
          nameLabel: 'Nombre',
          namePlaceholder: 'Casa Calle 5, Duplex Norte…',
          addressLabel: 'Dirección',
          cityLabel: 'Ciudad',
          stateLabel: 'Estado',
          zipLabel: 'Código postal',
          typeLabel: 'Tipo',
          unitCountLabel: 'Número de unidades',
          unitCountHint: 'Unidades o cuartos que se rentan por separado (ej. 5 cuartos = 5). Déjalo vacío si se renta completa.',
          purchaseDateLabel: 'Fecha de compra',
          purchasePriceLabel: 'Precio de compra',
          notesLabel: 'Notas',
          statusLabel: 'Estado de la propiedad',
          branchLabel: 'Sucursal',
        },
        propertyTypes: { house: 'Casa', duplex: 'Dúplex', apartment: 'Apartamentos', commercial: 'Comercial', land: 'Terreno', other: 'Otro' },
        propertyStatus: { active: 'Activa', inactive: 'Inactiva' },
        photos: {
          heading: 'Fotos',
          addBtn: 'Agregar',
          takePhoto: 'Tomar foto',
          chooseFromLibrary: 'Elegir de la galería',
          uploading: 'Subiendo…',
          limitHit: 'Máximo {{max}} fotos por propiedad.',
          deleteConfirm: '¿Eliminar esta foto?',
        },
        detailTabs: { overview: 'Resumen', leases: 'Contratos', ledger: 'Pagos', expenses: 'Gastos', maintenance: 'Mantenimiento', photos: 'Fotos' },
        tenants: {
          title: 'Inquilinos',
          addBtn: 'Agregar inquilino',
          editTitle: 'Editar inquilino',
          empty: 'Sin inquilinos todavía.',
          deleteConfirmTitle: '¿Eliminar inquilino?',
          deleteConfirmBody: 'Se eliminarán también sus contratos y su historial de pagos. Esta acción no se puede deshacer.',
          copyFromClient: 'Copiar de cliente',
          activeLease: 'Contrato activo',
          form: {
            firstNameLabel: 'Nombre',
            lastNameLabel: 'Apellido',
            phoneLabel: 'Teléfono',
            emailLabel: 'Correo',
            emergencyNameLabel: 'Contacto de emergencia',
            emergencyPhoneLabel: 'Teléfono de emergencia',
            emergencyRelationLabel: 'Parentesco',
            emergencyRelationPlaceholder: 'Madre, esposo, amigo…',
            notesLabel: 'Notas',
          },
        },
        leases: {
          title: 'Contratos',
          addBtn: 'Nuevo contrato',
          editTitle: 'Editar contrato',
          empty: 'Sin contratos en esta propiedad.',
          endBtn: 'Terminar contrato',
          renewBtn: 'Renovar',
          renewTitle: 'Renovar contrato',
          endConfirmTitle: '¿Terminar contrato?',
          endConfirmBody: 'El contrato se marcará como terminado y ya no generará cobros de renta.',
          deleteConfirmTitle: '¿Eliminar contrato?',
          deleteConfirmBody: 'Se eliminarán también sus cobros, pagos y documentos. Esta acción no se puede deshacer.',
          monthToMonth: 'Mes a mes',
          endsInDays: 'Vence en {{days}} días',
          endedBadge: 'Terminado',
          expiredBadge: 'Vencido',
          form: {
            tenantLabel: 'Inquilino',
            tenantPlaceholder: 'Selecciona un inquilino',
            unitLabel: 'Unidad',
            unitPlaceholder: 'Apto 2, Unidad B… (opcional)',
            startLabel: 'Inicio del contrato',
            endLabel: 'Fin del contrato',
            endHint: 'Déjalo vacío si es mes a mes.',
            rentLabel: 'Renta mensual',
            dueDayLabel: 'Día de pago',
            dueDayHint: 'Día del mes en que vence la renta.',
            depositLabel: 'Depósito',
            notesLabel: 'Notas',
          },
          docs: {
            heading: 'Documentos del contrato',
            addBtn: 'Subir documento',
            empty: 'Sin documentos. Sube el contrato firmado (PDF o foto).',
            uploading: 'Subiendo…',
            tooLarge: 'El archivo supera el límite de 50 MB.',
            limitHit: 'Máximo {{max}} documentos por contrato.',
            deleteConfirm: '¿Eliminar este documento?',
          },
        },
        ledger: {
          title: 'Historial de renta',
          balanceLabel: 'Saldo pendiente',
          depositLabel: 'Depósito',
          statusPaid: 'Pagado',
          statusPartial: 'Parcial',
          statusUnpaid: 'Pendiente',
          statusLate: 'Atrasado',
          daysLate: '{{days}} días de atraso',
          recordPaymentBtn: 'Registrar pago',
          editChargeTitle: 'Editar cobro',
          chargeAmountLabel: 'Monto del cobro',
          noCharges: 'Aún no hay cobros generados.',
          paidOfAmount: '{{paid}} de {{total}}',
        },
        payments: {
          recordTitle: 'Registrar pago',
          editTitle: 'Editar pago',
          amountLabel: 'Monto',
          fullAmountBtn: 'Monto completo',
          methodLabel: 'Método de pago',
          methodPlaceholder: 'Efectivo, Zelle, cheque #1024…',
          dateLabel: 'Fecha de pago',
          photoLabel: 'Foto del pago',
          addPhoto: 'Agregar foto (ej. cheque)',
          changePhoto: 'Cambiar',
          removePhoto: 'Quitar',
          noteLabel: 'Nota',
          recordBtn: 'Registrar pago',
          deleteConfirmTitle: '¿Eliminar pago?',
          deleteConfirmBody: 'El monto volverá a quedar pendiente en el cobro.',
        },
        expenses: {
          title: 'Gastos',
          addBtn: 'Agregar gasto',
          editTitle: 'Editar gasto',
          empty: 'Sin gastos registrados.',
          totalLabel: 'Total',
          deleteConfirmTitle: '¿Eliminar gasto?',
          deleteConfirmBody: 'Esta acción no se puede deshacer.',
          fromMaintenance: 'De mantenimiento',
          form: {
            dateLabel: 'Fecha',
            amountLabel: 'Monto',
            categoryLabel: 'Categoría',
            vendorLabel: 'Proveedor',
            vendorPlaceholder: 'Plomería García, CFE…',
            noteLabel: 'Nota',
            receiptLabel: 'Recibo',
            addReceipt: 'Agregar foto del recibo',
            changeReceipt: 'Cambiar',
            removeReceipt: 'Quitar',
          },
          categories: {
            repairs: 'Reparaciones',
            utilities: 'Servicios',
            property_tax: 'Impuesto predial',
            insurance: 'Seguro',
            mortgage: 'Hipoteca',
            hoa: 'HOA',
            management: 'Administración',
            other: 'Otro',
          },
        },
        maintenance: {
          title: 'Mantenimiento',
          addBtn: 'Agregar',
          editTitle: 'Editar mantenimiento',
          empty: 'Sin registros de mantenimiento.',
          deleteConfirmTitle: '¿Eliminar registro?',
          deleteConfirmBody: 'Esta acción no se puede deshacer.',
          statusOpen: 'Abierto',
          statusInProgress: 'En progreso',
          statusDone: 'Terminado',
          createExpenseToggle: 'Registrar como gasto',
          createExpenseHint: 'Al terminar, el costo se agrega a los gastos de la propiedad.',
          form: {
            titleLabel: 'Problema',
            titlePlaceholder: 'Fuga en el baño, calentador…',
            descriptionLabel: 'Descripción',
            statusLabel: 'Estado',
            reportedLabel: 'Reportado el',
            completedLabel: 'Terminado el',
            costLabel: 'Costo',
            fixedByLabel: 'Reparado por',
            fixedByPlaceholder: 'Nombre o empresa',
            employeeLabel: 'Empleado',
          },
        },
        overview: {
          monthTitle: 'Rentas de {{month}}',
          collectedLabel: 'Cobrado',
          outstandingLabel: 'Pendiente',
          overdueLabel: 'Atrasados',
          occupancyLabel: 'Ocupación',
          occupiedOf: '{{occupied}} de {{capacity}} unidades',
          incomeLabel: 'Ingresos',
          expensesLabel: 'Gastos',
          netLabel: 'Neto',
          noLeases: 'Sin contratos activos este mes.',
          propertyColumn: 'Propiedad',
          tenantColumn: 'Inquilino',
          rentColumn: 'Renta',
          statusColumn: 'Estado',
        },
      },
    },
    assistant: {
      title: 'Ami',
      subtitle: 'Tu asistente de negocio',
      placeholder: 'Escríbele a Ami…',
      send: 'Enviar',
      editingHint: 'Editando tu mensaje — se responderá de nuevo desde aquí',
      listening: 'Escuchando…',
      micUnavailable: 'Dictado no disponible en este navegador',
      thinking: 'Ami está pensando…',
      emptyTitle: '¡Hola! Soy Ami 👋',
      emptyState: 'Pregúntame sobre tu negocio o dime qué agregar.',
      suggestion1: '¿Qué trabajos agregué esta semana?',
      suggestion2: '¿Quién trabajó ayer?',
      suggestion3: 'Agrega un trabajo nuevo para hoy',
      draftTitle: 'Borrador de trabajo',
      updateTitle: 'Cambio al trabajo',
      updated: 'Trabajo actualizado',
      timeLabel: 'Horario',
      allDayLabel: 'Todo el día',
      confirm: 'Confirmar',
      confirming: 'Creando…',
      created: 'Trabajo creado',
      viewJob: 'Ver trabajo',
      unresolvedClient: 'Cliente sin coincidencia',
      errorMsg: 'Ami no pudo responder. Intenta de nuevo.',
      clientLabel: 'Cliente',
      dateLabel: 'Fecha',
      hoursLabel: 'Horas',
      crewLabel: 'Cuadrilla',
      leadBadge: 'Líder',
      driverLabel: 'Chofer',
      notesLabel: 'Notas',
      newChat: 'Nueva conversación',
      callButton: 'Hablar con Ami',
      callListening: 'Te escucho…',
      callThinking: 'Pensando…',
      callSpeaking: 'Hablando…',
      callInterrupt: 'Toca para interrumpir',
      callThinkingHint: 'Un momento — buscando la respuesta.',
      callConnecting: 'Conectando…',
      callEnd: 'Terminar',
      callHint: 'Habla ahora — Ami te escucha.',
      callMicDenied: 'Ami necesita permiso de micrófono para la llamada.',
    },
    crewFinder: {
      openButton: 'Sugerir cuadrilla',
      title: 'Cuadrilla sugerida',
      subtitle: 'Más cercanos y disponibles primero',
      distanceMi: '{{n}} mi',
      noLocation: 'Sin ubicación',
      basisCurrentJob: 'En trabajo actual',
      basisJob: 'Según su trabajo',
      basisHome: 'Desde casa',
      freeOnDate: 'Libre este día',
      busyNextFree: 'Ocupado — libre {{date}}',
      busyNoFree: 'Ocupado',
      nearbyNote: 'Cerca: {{miles}} mi el {{day}}',
      add: 'Agregar',
      added: 'Agregado',
      scheduleThatDay: 'Programar {{day}}',
      geocoding: 'Ubicando empleados…',
      needsAddresses: '{{n}} sin dirección',
      targetNoCoords: 'Este trabajo no tiene ubicación (agrega dirección o cliente).',
      empty: 'Sin empleados para sugerir',
      offline: 'Sin conexión — no se puede sugerir',
      close: 'Cerrar',
    },
    reports: {
      payroll: {
        title: 'Nómina',
        subtitle: 'Horas y pago por trabajador',
        entry: 'Nómina',
        freqLabel: 'Frecuencia',
        freqWeekly: 'Semanal',
        freqCustom: 'Personalizado',
        customDaysLabel: 'Días por período (ej. 3)',
        settingsTitle: 'Configuración de nómina',
        componentsHeading: 'Componentes de pago',
        otEnable: 'Pagar horas extra',
        otThresholdLabel: 'Horas regulares por semana',
        otMultiplierLabel: 'Multiplicador (ej. 1.5)',
        otEligibleHeading: 'Quién recibe horas extra',
        otEligibleHint: 'Solo trabajadores por hora. Los cambios se guardan al instante.',
        driverHeading: 'Pago por manejo',
        driverSame: 'Misma tarifa',
        driverRate: 'Tarifa por hora',
        driverFlat: 'Fijo por viaje',
        driverRateLabel: 'Tarifa por hora manejada ($)',
        driverFlatLabel: 'Monto por viaje ($)',
        formulaHeading: 'Cálculo de pago',
        formulaStandardHint: 'Cálculo estándar: horas × tarifa, más horas extra y pago por manejo.',
        formulaCreate: 'Crear fórmula personalizada',
        formulaRemove: 'Usar cálculo estándar',
        formulaBuildHint: 'La fórmula calcula el pago bruto de los trabajadores por hora. Toca una ficha para quitarla.',
        formulaEmpty: 'Toca variables, operadores y números para armar la fórmula.',
        formulaInvalid: 'Fórmula incompleta — revisa paréntesis y operadores.',
        formulaVarsHeading: 'Variables',
        formulaEmpFieldsHeading: 'Campos del equipo',
        formulaJobFieldsHeading: 'Campos de trabajos',
        formulaJobFieldHint: 'Los campos de trabajos se suman entre los trabajos del período de cada trabajador.',
        formulaNumberPlaceholder: 'Número',
        formulaAddNumber: 'Agregar',
        formulaClear: 'Borrar todo',
        formulaVarNames: {
          pay_rate: 'Tarifa de pago',
          worked_hours: 'Horas trabajadas',
          driven_hours: 'Horas manejadas',
          total_hours: 'Horas totales',
          normal_hours: 'Horas normales',
          overtime_hours: 'Horas extra',
          normal_pay: 'Pago normal',
          overtime_pay: 'Pago de horas extra',
          driver_pay: 'Pago por manejo',
          standard_pay: 'Pago estándar',
        },
        formulaVarDescs: {
          pay_rate: 'La tarifa del trabajador según su tipo de pago (por hora, por día o salario).',
          worked_hours: 'Horas de trabajo del período: horas registradas + horas totales de los trabajos donde está asignado.',
          driven_hours: 'Horas de manejo del período: horas de manejo de los trabajos donde figura como chofer.',
          total_hours: 'Horas trabajadas + horas manejadas.',
          normal_hours: 'Horas hasta el límite de horas extra (p. ej. 40 por semana, ajustado al período). Si el trabajador no tiene horas extra activadas, son todas sus horas.',
          overtime_hours: 'Horas que superan el límite. Es 0 si el trabajador no tiene horas extra activadas.',
          normal_pay: 'Horas normales × tarifa. No incluye horas extra ni pago por manejo.',
          overtime_pay: 'Horas extra × tarifa × multiplicador (p. ej. 1.5). Es 0 si no aplica.',
          driver_pay: 'Pago por manejo según el modo elegido (tarifa por hora manejada o monto por viaje). Es 0 en modo «misma tarifa».',
          standard_pay: 'El cálculo estándar completo: pago normal + pago de horas extra + pago por manejo.',
        },
        formulaEcfDesc: 'Usa el valor de este campo en la ficha del trabajador.',
        formulaJcfDesc: 'Suma este campo entre los trabajos del trabajador en el período.',
        formulaEcfMatchDesc: 'Vale 1 si el campo del trabajador tiene esta respuesta; 0 si no.',
        formulaJcfCountDesc: 'Cuenta los trabajos del período del trabajador donde este campo tiene esta respuesta.',
        historyTitle: 'Historial de pagos',
        historyEmpty: 'Aún no hay pagos registrados. Marca un pago como pagado y quedará guardado aquí.',
        historyBonus: 'Bono',
        historySearchPlaceholder: 'Buscar por nombre, cheque o monto…',
        historyNoResults: 'Sin resultados para esta búsqueda.',
        historyFrom: 'Desde',
        historyTo: 'Hasta',
        historySelect: 'Seleccionar',
        historyCancelSelect: 'Cancelar',
        historySelectedCount: '{{count}} seleccionados',
        historyDeleteBtn: 'Eliminar',
        historyDeleteConfirm: '¿Eliminar {{count}} pago(s) del historial? Esta acción no se puede deshacer.',
        historyTotalLabel: 'Total mostrado',
        historyPaymentsCount: '{{count}} pagos',
        historyPresets: {
          thisPeriod: 'Este período de pago',
          lastPeriod: 'Período anterior',
          thisWeek: 'Esta semana',
          lastWeek: 'Semana pasada',
          last2Weeks: 'Últimas 2 semanas',
          thisMonth: 'Este mes',
          lastMonth: 'Mes pasado',
          thisYear: 'Este año',
          lastYear: 'Año pasado',
        },
        amountLabel: 'Monto a pagar',
        partialLabel: 'Parcial',
        hoursCoveredLabel: 'Horas que cubre este pago',
        alreadyPaidLabel: 'Pagos anteriores',
        paidSoFarLabel: 'Pagado',
        paidTag: 'pagado',
        paidDiffersNote: 'El monto pagado no coincide con el cálculo del período.',
        manualPayBtn: 'Registrar pago',
        manualWorkerLabel: 'Empleado',
        manualSelectWorker: 'Seleccionar empleado',
        manualPeriodLabel: 'Período de pago',
        clearPaymentsLabel: 'Eliminar todos los pagos',
        clearPaymentsConfirm: '¿Eliminar todos los pagos registrados de este período para {{name}}?',
        totalPending: 'Pendiente por pagar',
        ofTotal: 'de {{total}}',
        bonusLabel: 'Bono (opcional)',
        loanTitle: 'Préstamo',
        loanOwed: 'debe',
        loanDeductLabel: 'Descontar de este cheque',
        loanNetToPay: 'Neto a pagar',
        loanNoteFromCheckNum: 'Descontado del cheque #{{n}}',
        loanNoteFromCheck: 'Descontado del cheque',
        loanNoteFromWire: 'Descontado de la transferencia',
        loanNoteFromCash: 'Descontado del pago en efectivo',
        addLoanBtn: 'Agregar préstamo',
        loanAmountPlaceholder: 'Monto del préstamo',
        loanNotePlaceholder: 'Nota (opcional)',
        loanViewBtn: 'Ver préstamos',
        loanHistoryTitle: 'Préstamos',
        loanDateLabel: 'Fecha',
        loanGivenLabel: 'Préstamo',
        loanPaymentLabel: 'Abono',
        loanEmpty: 'Sin registros de préstamos',
        loanDeleteConfirm: '¿Eliminar este registro?',
        loanNewTitle: 'Nuevo préstamo',
        loanEditTitle: 'Editar registro',
        loanSaveBtn: 'Guardar',
        loanSearchPlaceholder: 'Buscar trabajador…',
        loanNoWorkerFound: 'No se encontró ningún trabajador',
        loanPickHint: 'Toca un trabajador para ver o agregar un préstamo',
        recordPaymentBtn: 'Registrar abono',
        loanPaymentNewTitle: 'Registrar abono',
        loanPickTitle: 'Elegir trabajador',
        otShort: 'extra',
        driveShort: 'manejo',
        freqBiweekly: 'Quincenal',
        freqMonthly: 'Mensual',
        anchorLabel: 'Inicio de pago',
        anchorHint: 'Los períodos se calculan a partir de esta fecha.',
        colWorker: 'Trabajador',
        colHours: 'Horas',
        colPay: 'Pago',
        totalHours: 'Horas totales',
        totalPay: 'Pago total',
        paidSummary: '{{paid}} de {{total}} pagados',
        markPaid: 'Marcar pagado',
        paidBadge: 'Pagado',
        undo: 'Deshacer',
        methodHeading: 'Método de pago',
        methodCash: 'Efectivo',
        methodCheck: 'Cheque',
        methodWire: 'Transferencia',
        checkNumberLabel: 'Número de cheque',
        checkNumberPlaceholder: 'Opcional',
        confirmBtn: 'Confirmar',
        saveBtn: 'Guardar cambios',
        removePayment: 'Quitar pago',
        checkPrefix: 'Cheque #',
        empty: 'No hay trabajadores con horas.',
        breakdownHours: 'Desglose de horas',
        hoursWorked: 'Trabajadas',
        hoursDriven: 'Manejadas',
        hoursLogged: 'Registradas',
        projectsHeading: 'Trabajos',
        untitledJob: 'Trabajo sin título',
        noBreakdown: 'Sin horas en este periodo.',
      },
      title: 'Reportes',
      subtitle: 'Analiza el rendimiento de tu negocio',
      ranges: {
        month: 'Este mes',
        last_month: 'Mes anterior',
        quarter: 'Últimos 3 meses',
        half: 'Últimos 6 meses',
        year: 'Este año',
        last_year: 'Año pasado',
        all: 'Todo el tiempo',
      },
      customRange: 'Personalizado',
      kpis: {
        revenueCollected: 'Facturado y pagado',
        pendingToCollect: 'Pendiente de cobro',
        avgJobValue: 'Valor promedio/trabajo',
        hoursLogged: 'Horas registradas',
        paidInvoicesCountSingle: '{{count}} factura pagada',
        paidInvoicesCountPlural: '{{count}} facturas pagadas',
        noPaidInvoices: 'Sin facturas pagadas',
        overdueSuffix: '{{amount}} vencido',
        completedJobsCount: '{{count}} trabajos completados',
        estPayrollSub: 'Est. nómina: {{amount}}',
        payroll: 'Nómina estimada',
        payrollWorkersSub: '{{count}} trabajadores',
        grossMargin: 'Margen bruto est.',
        grossMarginSub: '{{percent}}% de margen',
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
      byLocation: {
        title: 'Por ubicación',
        jobs: 'trabajos',
        unassigned: 'Sin ubicación',
      },
      newClientsBlock: {
        newCount: 'clientes nuevos',
        totalAccumulated: '{{count}} total acumulado',
      },
      financial: {
        revenueCollected: 'Facturado y pagado',
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
    files: {
      title: 'Archivos',
      subtitle: 'Manuales y documentos para tu equipo',
      empty: 'Aún no hay archivos',
      emptyHint: 'Pídele a tu oficina que suba manuales y documentos.',
      newCategory: 'Nueva categoría',
      newSection: 'Nueva sección',
      addEntry: 'Agregar archivo',
      categoryNameLabel: 'Nombre de la categoría',
      categoryNamePlaceholder: 'Ej. Manuales, Seguridad, Contratos',
      sectionNameLabel: 'Nombre de la sección',
      sectionNamePlaceholder: 'Ej. Tractores, Bombas',
      entryTitleLabel: 'Título',
      entryTitlePlaceholder: 'Ej. Manual del operador',
      crewVisibleLabel: 'Visible para el equipo',
      crewVisibleHint: 'Si está apagado, solo la oficina ve esta categoría.',
      officeOnlyBadge: 'Solo oficina',
      crewBadge: 'Equipo',
      kindFile: 'Subir archivo',
      kindLink: 'Pegar enlace',
      uploadBtn: 'Subir',
      uploading: 'Subiendo…',
      chooseFile: 'Elegir archivo',
      linkUrlLabel: 'Enlace',
      linkUrlPlaceholder: 'https://… (Drive, Dropbox, YouTube)',
      linkBadge: 'Enlace',
      openBtn: 'Abrir',
      noSections: 'Sin secciones todavía',
      noEntries: 'Sin archivos todavía',
      deleteCategoryConfirm: '¿Eliminar esta categoría y todo su contenido?',
      deleteSectionConfirm: '¿Eliminar esta sección y sus archivos?',
      deleteEntryConfirm: '¿Eliminar este archivo?',
      tooBig: 'El archivo supera el límite de 50 MB. Usa un enlace.',
      sectionsCount: '{{count}} secciones',
      filesCount: '{{count}} archivos',
      selectedCount: '{{count}} seleccionados',
      moveBtn: 'Mover',
      moveTitle: 'Mover a…',
      moveHere: 'Mover aquí',
      moveFolderTitle: 'Mover carpeta a…',
      moveHint: 'Toca una carpeta para mover ahí · ›  para abrirla',
      itemsOne: '1 elemento',
      itemsMany: '{{count}} elementos',
      itemsEmpty: 'Vacía',
      selectPrompt: 'Selecciona archivos o carpetas para mover',
      newFolder: 'Nueva carpeta',
      folderNameLabel: 'Nombre de la carpeta',
      folderNamePlaceholder: 'Ej. Tractores, Corner, Manuales',
      deleteFolderConfirm: '¿Eliminar esta carpeta y todo su contenido?',
      emptyFolder: 'Esta carpeta está vacía',
      visibilityLabel: 'Visibilidad',
      visInherit: 'Heredar',
    },
    dateLocale: 'es-MX',
  },
  en: {
    sidebar: {
      inicio: 'Home',
      trabajos: 'Jobs',
      clientes: 'Clients',
      facturas: 'Invoices',
      empleados: 'Team',
      equipo: 'Team',
      calendario: 'Calendar',
      inventario: 'Inventory',
      archivos: 'Files',
      reportes: 'Reports',
      ajustes: 'Settings',
      mas: 'More',
      logout: 'Sign out',
      appsSection: 'Apps',
      collapseSidebar: 'Collapse menu',
      expandSidebar: 'Expand menu',
      descriptions: {
        clientes: 'Your clients and contacts.',
        trabajos: 'Jobs, proposals, and their progress.',
        facturas: 'Create and send invoices to clients.',
        empleados: 'Manage your team, access, schedules, and pay.',
        equipo: 'Invite users and manage access roles.',
        calendario: 'Appointments, scheduled jobs, and hours.',
        inventario: 'Products, parts, and materials.',
        archivos: 'Manuals and documents for your team.',
        reportes: 'Revenue, jobs, hours, and more.',
        tienda: 'Enable or disable modules for your business.',
        ajustes: 'Configure your business, team, and connections.',
      },
    },
    fieldHome: {
      greeting: 'Hi 👋',
      clockIn: 'Clock in',
      clockOut: 'Clock out',
      clockedInSince: 'Working since {{time}}',
      notClockedIn: 'Not clocked in',
      clockError: 'Could not save. Try again.',
      todayTitle: 'My jobs today',
      upcomingTitle: 'Upcoming jobs',
      empty: 'You have no assigned jobs.',
      lead: 'Lead',
      start: 'Start',
      complete: 'Complete',
      noClient: 'No client',
      noDate: 'No date',
      summaryTitle: 'My summary',
      statAssigned: 'Assigned',
      statCompleted: 'Completed (mo.)',
      statHoursWeek: 'Hours (week)',
      statHoursMonth: 'Hours (month)',
      statActiveHours: 'Active hours',
      hoursToggleActive: 'Active',
      hoursToggleWeek: 'Week',
      hoursToggleMonth: 'Month',
      recentCompletedTitle: 'Recently completed',
      logJob: 'Log job',
      logTitle: 'Log a job',
      jobTitleLabel: 'Job title',
      jobTitlePlaceholder: 'What did you do?',
      clientLabel: 'Client (optional)',
      clientSearch: 'Search client...',
      noClientOption: '— No client —',
      dateLabel: 'Date',
      notesLabel: 'Notes (optional)',
      titleRequired: 'Enter a title',
      saveError2: 'Could not log. Try again.',
      saved: 'Job logged',
      noResults: 'No results',
      locCapturing: 'Capturing location…',
      locUnavailable: 'Location unavailable',
    },
    roles: {
      title: 'Roles & permissions',
      subtitle: 'Customize what each role can see and do.',
      entry: 'Roles & permissions',
      ownerLocked: 'The owner always has full control.',
      customized: 'Customized',
      reset: 'Reset to default',
      resetConfirm: 'Reset this role to default permissions?',
      saved: 'Changes saved',
      saveError: 'Could not save. Try again.',
      sectionData: 'Data access',
      sectionSystem: 'Administration',
      colView: 'View',
      colCreate: 'Create',
      colEdit: 'Edit',
      colDelete: 'Delete',
      scopeNone: 'No',
      scopeAssigned: 'Assigned',
      scopeAll: 'All',
      resourceNames: { jobs: 'Jobs', clients: 'Clients', invoices: 'Invoices', employees: 'Employees', calendar: 'Calendar', inventory: 'Inventory', equipment: 'Equipment', rentals: 'Rental properties', reports: 'Reports' },
      capNames: { manageSettings: 'Business settings', manageMembers: 'Manage team & roles', viewAuditLog: 'View activity', viewAllTimesheets: 'View all hours', assignWorkers: 'Assign workers to any job', createEstimates: 'Allow estimates', clockInOut: 'Clock in/out', scheduleJobs: 'Schedule jobs (not just completed)', completedByDefault: 'Mark jobs as completed by default', switchLocations: 'Switch between branches (else limited to their own)' },
      newRole: 'New role',
      newRoleTitle: 'Create custom role',
      roleNameLabel: 'Role name',
      roleNamePlaceholder: 'e.g. Mechanic',
      baseRoleLabel: 'Start with the permissions of',
      createBtn: 'Create role',
      createError: 'Could not create the role. Does one with that name already exist?',
      customRoleDesc: 'Custom role for your business.',
      customRoleBadge: 'Custom role',
      renameRole: 'Rename',
      renameRoleTitle: 'Rename role',
      deleteRole: 'Delete role',
      deleteRoleConfirm: 'Delete this role? This cannot be undone.',
      deleteRoleInUse: 'Members or pending invites still use this role. Assign them another role first.',
      deleteRoleError: 'Could not delete the role.',
    },
    home: {
      welcome: 'Welcome 👋',
      newInvoice: 'New invoice',
      customize: {
        editBtn: 'Customize',
        doneBtn: 'Done',
        dragHint: 'Drag to reorder your widgets',
        hideLabel: 'Hide widget',
        addTitle: 'Add widgets',
        addEmpty: "You're already showing every widget.",
        saveError: "Couldn't save your layout. Try again.",
        sizes: {
          sm: 'Small',
          md: 'Medium',
          lg: 'Large',
        },
      },
      widgetNames: {
        quickActions: 'Quick actions',
        earningsMonth: 'Earnings this month',
        invoicesPending: 'Pending invoices',
        clientsTotal: 'Clients',
        invoicesOverdue: 'Overdue invoices',
        clockedIn: 'Active now',
        earningsYear: 'Earnings this year',
        jobsActive: 'Active jobs',
        monthlyChart: 'Revenue by month',
        upcomingJobs: 'Upcoming jobs',
        recentInvoices: 'Recent invoices',
      },
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
        jobsActiveLabel: 'Active jobs',
        jobsActiveSub: 'scheduled or in progress',
        vsLastMonth: '{{pct}} vs last month',
        avgPerMonth: 'Avg {{amount}}/mo',
      },
      quickActions: {
        newInvoice: 'New invoice',
        newClient: 'New client',
        newJob: 'New job',
        calendar: 'Calendar',
      },
      monthlyChart: {
        title: 'Revenue by month',
        empty: 'No payments yet this year.',
        totalLabel: 'Total {{year}}',
        avgLabel: 'Monthly average',
      },
      upcomingJobs: {
        title: 'Upcoming jobs',
        viewAll: 'View all',
        empty: 'No scheduled jobs.',
        noClient: 'No client',
        today: 'Today',
        tomorrow: 'Tomorrow',
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
      total_loss: 'Total loss',
    },
    invoices: {
      title: 'Invoices',
      countTotal: '{{count}} total',
      countFound: '{{count}} found',
      selectButton: 'Select',
      selectAll: 'All',
      bulkDelete: 'Delete',
      confirmDeleteBulk: 'Permanently delete {{count}} invoice(s)? Linked jobs go back to Completed and can be re-invoiced.',
      selectedCountSingle: '{{count}} selected',
      selectedCountPlural: '{{count}} selected',
      newInvoice: 'New invoice',
      filters: {
        all: 'All',
        drafts: 'Drafts',
        sent: 'Sent',
        paid: 'Paid',
        overdue: 'Overdue',
        totalLoss: 'Total loss',
      },
      filters2: {
        button: 'Filters',
        title: 'Filter',
        company: 'Company',
        state: 'State',
        allCompanies: 'All companies',
        allStates: 'All states',
        clear: 'Clear filters',
      },
      group: {
        button: 'Group',
        title: 'Group by',
        none: 'None',
        company: 'Company',
        state: 'State',
        status: 'Status',
      },
      searchPlaceholder: 'Search number, client, job or amount...',
      summarySingle: '{{count}} invoice',
      summaryPlural: '{{count}} invoices',
      summaryTotal: 'Total',
      empty: 'No invoices yet.',
      createFirst: 'Create the first one →',
      noClient: 'No client',
      dueShort: 'Due {{date}}',
      markSent: 'Mark sent',
      undoSent: 'Undo sent',
      markPaid: 'Mark paid',
      markTotalLoss: 'Mark as total loss',
      markTotalLossConfirm: 'Mark this invoice as a total loss? It drops out of overdue and stops counting toward your revenue.',
      reinstateInvoice: 'Reinstate invoice',
      daysOverdue: 'by {{n}} days',
      overdueAgo: 'overdue by {{n}}d',
      sentAgo: 'sent {{n}}d ago',
      sentToday: 'sent today',
      payments: {
        title: 'Payments',
        recordTitle: 'Record payment',
        editTitle: 'Edit payment',
        recordBtn: 'Record payment',
        amountLabel: 'Amount',
        fullAmountBtn: 'Full amount',
        methodLabel: 'Payment method',
        dateLabel: 'Payment date',
        remaining: 'Balance due',
        partialPill: 'Partially paid',
        paidInFullHint: 'This payment settles the invoice in full.',
        deleteConfirm: 'Delete this payment?',
        undoPaid: 'Mark unpaid',
        undoPaidConfirm: 'The invoice will go back to sent and its recorded payments will be removed.',
        otherPlaceholder: 'Specify…',
        addPhoto: 'Add photo (e.g. check)',
        changePhoto: 'Change photo',
        removePhoto: 'Remove photo',
        photoLabel: 'Payment photo',
        methods: { cash: 'Cash', check: 'Check', card: 'Card', transfer: 'Bank transfer', zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo', paypal: 'PayPal', moneyOrder: 'Money order', other: 'Other' },
      },
      sendInvoice: 'Send invoice',
      emailSubject: 'Invoice {{number}}',
      emailBody: 'Hi,\n\nPlease find your invoice attached.\nYou can view it here: {{link}}\n\nThank you for your business.',
      sendNoEmail: 'This client has no email on file.',
      createdLabel: 'Created',
      moreActionsTitle: 'More actions',
      shareLinkAction: 'Share link',
      clientPrices: {
        viewBtn: 'View prices',
        title: 'Prices for this client',
        flatWord: 'flat',
        tierNote: "This client's special price",
      },
      autonameBtn: 'Autoname',
      autonameDone: '{{count}} job name(s) updated.',
      autonameNone: 'Names already look good.',
      lastEditedLabel: 'Last edited',
      byUser: 'by {{name}}',
      print: 'Print / PDF',
      linkCopied: 'Invoice link copied',
      notFound: 'Invoice not found.',
      editTitle: 'Edit invoice',
      jobsSection: {
        title: 'Jobs on this invoice',
        empty: 'No jobs linked.',
        addBtn: 'Add job',
        removeBtn: 'Remove',
        moveBtn: 'Move',
        clearPricesBtn: 'Clear prices',
        serviceDateLabel: 'Date performed (optional)',
        excludeHint: 'Exclude from invoice (temporary — totals and the document omit it)',
        sortByDateBtn: 'Sort by date',
        clearPricesConfirm: 'Clear all prices on this invoice? Lines reset to $0 so you can re-run Autoprice.',
        linkBtn: 'Link',
        linkTitle: 'Link to a job',
        moveTitle: 'Move to another invoice',
        moveEmpty: 'No other draft invoices for this client.',
        addTitle: 'Add to invoice',
        addEmpty: 'No un-invoiced completed jobs. Search to find other clients’.',
        addSearchPlaceholder: 'Search a job (any client)…',
        addConfirm: 'Add',
        manualHeading: 'Custom item',
        manualDescPlaceholder: 'Description (e.g. Travel)',
        manualAddBtn: 'Add item',
        jobsHeading: 'Completed jobs',
        removeItemConfirm: 'Remove this item from the invoice?',
        editItemTitle: 'Edit item',
        viewProject: 'Go to job',
        previewDescription: 'Description',
        previewNoDescription: 'No description',
        previewNotes: 'Notes',
      },
      deleteTitle: 'Delete invoice',
      deleteConfirm: 'Delete invoice <strong>{{number}}</strong>? This cannot be undone.',
      deleting: 'Deleting...',
      errorDelete: 'Could not delete the invoice.',
      new: {
        heading: 'New invoice',
        headingEdit: 'Edit invoice',
        subtitleNew: 'Fill in the invoice details',
        subtitleEdit: 'Update the invoice details',
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
        notesUseDefault: 'Use default',
        notesCustom: 'Custom',
        internalNotesLabel: 'Internal notes (only for you)',
        internalNotesPlaceholder: 'Private reminders — not shown on the invoice...',
        customFieldsHeading: 'Custom fields',
        errorAtLeastOne: 'Add at least one item',
        errorRequiredField: 'The "{{field}}" field is required',
        errorSave: 'Save error. Try again.',
        saveDraft: 'Save draft',
        sendInvoice: 'Create',
      },
      dateLocale: 'en-US',
    },
    clients: {
      title: 'Clients',
      countTotal: '{{count}} total',
      countFound: '{{count}} found',
      newClient: 'New client',
      group: {
        button: 'Group',
        title: 'Group by',
        name: 'Name (A–Z)',
        company: 'Company',
        state: 'State',
        city: 'City',
        noCompany: 'No company',
        noState: 'No state',
        noCity: 'No city',
        noValue: 'No value',
      },
      importBtn: 'Import clients from CSV',
      importHint: 'Upload a CSV or pull from your phone contacts. Useful when migrating from another app.',
      searchPlaceholder: 'Search clients...',
      selectButton: 'Select',
      selectAll: 'Select all',
      selectAllShort: 'All',
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
        actionCall: 'Call',
        actionText: 'Text',
        actionEmail: 'Email',
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
        shareTitle: 'Share',
        sharePdfBtn: 'Print / PDF',
        shareCsvBtn: 'Share as CSV',
        shareDialogTitle: 'What to include?',
        shareDialogBasic: 'Contact details only',
        shareDialogAll: 'All fields + invoices',
        pdfInvoicesHeading: 'Invoices',
        pdfInvoicesTotal: 'Total invoiced',
        pdfGeneratedOn: 'Generated on {{date}}',
        shareError: "Couldn't share. Try again.",
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
          ccLabel: 'CC on invoices',
          ccBadge: 'CC',
          addBtn: 'Add contact',
          confirmDelete: 'Delete this contact?',
        },
        commLog: {
          heading: 'Communications',
          lastContacted: 'Last contact: {{rel}}',
          neverContacted: 'No contact yet',
          add: 'Log contact',
          empty: "You haven't contacted this client yet.",
          emptyFiltered: 'No contacts match the filters.',
          withContact: 'with {{name}}',
          types: {
            call: 'Call',
            sms: 'Text',
            email: 'Email',
            in_person: 'In person',
            whatsapp: 'WhatsApp',
            note: 'Note',
          },
          outcomes: {
            connected: 'Answered',
            no_answer: 'No answer',
            sent: 'Sent',
            left_voicemail: 'Voicemail',
          },
          prompt: {
            callTitle: 'Did you reach them?',
            smsTitle: 'Did you send the message?',
            emailTitle: 'Did you send the email?',
            connected: 'Answered',
            noAnswer: 'No answer',
            sent: 'Sent',
            dontLog: "Don't log",
          },
          form: {
            addTitle: 'Log contact',
            editTitle: 'Edit entry',
            typeLabel: 'Type',
            outcomeLabel: 'Outcome',
            outcomeNone: 'No outcome',
            directionLabel: 'Direction',
            directionOutbound: 'Outbound',
            directionInbound: 'Inbound',
            dateLabel: 'Date',
            noteLabel: 'Note',
            notePlaceholder: 'Communication details…',
            contactLabel: 'Contact person',
            contactNone: 'Client (general)',
            save: 'Save',
            cancel: 'Cancel',
            confirmDelete: 'Delete this entry?',
            delete: 'Delete',
            edit: 'Edit',
          },
          rel: {
            now: 'just now',
            minute: '{{n}} minute ago',
            minutes: '{{n}} minutes ago',
            hour: '{{n}} hour ago',
            hours: '{{n}} hours ago',
            day: '{{n}} day ago',
            days: '{{n}} days ago',
            week: '{{n}} week ago',
            weeks: '{{n}} weeks ago',
            month: '{{n}} month ago',
            months: '{{n}} months ago',
            year: '{{n}} year ago',
            years: '{{n}} years ago',
          },
        },
      },
      importModal: {
        title: 'Import clients',
        colAdded: 'Added (date/time)',
        colEdited: 'Last edited (date/time)',
        mapTitle: 'Map columns',
        previewTitle: 'Preview',
        doneTitle: 'Import complete!',
        uploadPrimary: 'Click to select a CSV file',
        uploadSecondary: 'Or drag and drop here',
        templatePromptTitle: 'Need the right format?',
        templatePromptSub: 'Download the example template',
        templateBtn: 'CSV example',
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
        pickFileBtn: 'Select CSV file',
        pickFileHint: 'Upload a .csv with headers',
        importContactsBtn: 'Import from contacts',
        importContactsHint: 'Pick from your phone contacts',
        contactsPermissionDenied: 'Permission denied. Enable contacts access in Settings to use this.',
        contactsImportedCount: '{{count}} contact(s) imported',
      },
    },
    jobs: {
      title: 'Jobs',
      countTotal: '{{count}} total',
      countFound: '{{count}} found',
      pendingValue: '{{amount}} pending',
      inProgressValue: '{{amount}} in progress',
      completedValue: '{{amount}} completed',
      newDropdown: {
        trigger: 'New',
        jobOption: 'New job',
        jobOptionSub: 'Schedule a job directly',
        proposalOption: 'New estimate',
        proposalOptionSub: 'Estimate before working',
      },
      searchPlaceholder: 'Search by name, client, number, city...',
      clearFilters: 'Clear filters',
      selectButton: 'Select',
      bulkDelete: 'Delete',
      bulkArchive: 'Archive',
      bulkUnarchive: 'Unarchive',
      bulkMoveClient: 'Move to client',
      confirmArchiveBulk: 'Archive {{count}} job(s)? They are hidden from lists but still count in reports and hours.',
      archiveDisabledHint: "Only closed jobs (completed, invoiced, cancelled) that aren't already archived can be archived. Unselect the others.",
      archivedBadge: 'Archived',
      confirmDeleteBulk: 'Delete {{count}} job(s) permanently? Their photos, line items, and assignments will be removed too.',
      batchInvoice: {
        selectButton: 'Invoice',
        cancel: 'Cancel',
        createButton: 'Create invoice',
        creating: 'Creating...',
        selectedCount: '{{count}} selected',
        sameClientHint: 'Same-client jobs only',
        multiClientHint: 'Will create {{count}} invoices (one per client)',
        createdMultiple: 'Created {{count}} invoices, one per client.',
        multiConfirmTitle: 'Create multiple invoices',
        multiConfirmCreate: 'Create {{count}} invoices',
        selectAll: 'Select all',
        deselectAll: 'Deselect all',
      },
      sort: {
        button: 'Sort',
        title: 'Sort & group',
        sortByTitle: 'Sort by',
        groupByTitle: 'Group by',
        by: {
          recent: 'Newest',
          status: 'Job status',
          startDate: 'Start date',
          priority: 'Priority',
          updated: 'Recently updated',
          title: 'Job title (A–Z)',
          endDate: 'End date',
          client: 'Client',
          lead: 'Crew lead',
        },
        group: {
          none: 'No grouping',
          client: 'Client',
          lead: 'Crew lead',
          company: 'Company',
          state: 'State (location)',
        },
        noClient: 'No client',
        noLead: 'No lead',
        noCompany: 'No company',
        noState: 'No state',
      },
      dateFilter: {
        button: 'Filter by date',
        title: 'Filter by date',
        from: 'From',
        to: 'To',
        today: 'Today',
        yesterday: 'Yesterday',
        last2Days: 'Last 2 days',
        last5Days: 'Last 5 days',
        apply: 'Apply filter',
        clear: 'Clear dates',
        summary: '{{from}} — {{to}}',
      },
      tabs: {
        all: 'All',
        proposals: 'Estimates',
        posible: 'Possible',
        scheduled: 'Scheduled',
        in_progress: 'In progress',
        completed: 'Completed',
        invoiced: 'Invoiced',
        cancelled: 'Cancelled',
        archived: 'Archived',
      },
      statuses: {
        proposal: 'Estimate',
        sent: 'Sent',
        accepted: 'Accepted',
        declined: 'Declined',
        posible: 'Possible',
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
      leadPrefix: 'Lead',
      emptyNoMatch: 'No results.',
      emptyAll: 'No jobs yet.',
      createFirst: 'Create the first one →',
      dueShort: 'Due {{date}}',
      alertChip: {
        today: 'Today',
        tomorrow: 'Tomorrow',
        inDays: 'In {{count}} days',
      },
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
        sendAction: 'Send estimate',
        sendActionMessage: 'Send it by email with the accept-and-sign link, or just mark it as sent.',
        markOnly: 'Mark sent only',
        shareError: 'Could not share',
        statusUpdateError: "Couldn't update the status. Try again.",
        printTooltip: 'Download PDF',
        editTooltip: 'Edit job',
        duplicateTooltip: 'Duplicate job',
        duplicateAskTitle: 'What do you want to copy?',
        duplicateFullOption: 'Copy everything',
        duplicateTeamOption: 'Client and crew only',
        deleteTooltip: 'Delete job',
        generateInvoiceBtn: 'Generate invoice',
        viewInvoiceBtn: 'View invoice',
        unInvoiceBtn: 'Remove from invoice',
        unInvoiceConfirm: 'Remove this job from the invoice? It will return to "Completed".',
        unInvoiceSentWarning: 'This invoice was already sent or paid. Removing the job will change an existing invoice. Continue?',
        unInvoiceDeleteEmpty: 'Invoice {{number}} has no jobs left. Delete it?',
        editItemsBtn: 'Edit',
        addItemsBtn: 'Add items',
        laborCost: {
          title: 'Estimated labor cost',
          totalLabel: 'Total',
          hoursShort: 'h',
          salariedNote: '{{count}} salaried worker(s) not included',
          hint: "Job hours × each worker's rate, plus driver pay and your pay formula if set. Excludes overtime.",
          showBreakdown: 'Show breakdown ({{count}})',
          hideBreakdown: 'Hide breakdown',
        },
        scheduleWork: 'Schedule work',
        invoiceDirectly: 'Invoice directly',
        cancelledBanner: 'This job was cancelled.',
        declinedBanner: 'This estimate was declined.',
        declinedByClientBanner: 'The client declined this estimate.',
        cancelledOn: 'Cancelled on {{date}}',
        declinedOn: 'Declined on {{date}}',
        reinstate: 'Reinstate',
        emailAction: 'Send by email',
        emailTooltip: 'Send by email',
        sendNoEmail: 'This client has no email on file. Add one to their profile to send the estimate.',
        emailSubject: 'Estimate {{number}} from {{business}}',
        emailBody: 'Hi {{first_name}},\n\nHere is estimate {{number}} for {{total}}.\n\nYou can review, accept and sign it online here:\n{{link}}\n\nThank you,\n{{business}}',
        approvalTitle: 'Client approval',
        signedByLine: 'Signed by {{name}} on {{date}}',
        cancelSignedConfirm: 'This estimate was signed by the client. If you cancel it and later reinstate it, the signed approval will be removed and the client will need to approve and sign again. Cancel the job?',
        backStepSignedConfirm: 'This estimate was signed by the client. Going back will remove the signed approval and the client will need to accept and sign again. Continue?',
        signOnSite: 'Sign in person',
        signOnSiteHint: 'Hand the device to your client so they can enter their name and sign the estimate.',
        schedulePromptHint: 'Pick the work date to schedule it. You can fine-tune times and other details by editing the job.',
        documentsHeading: 'Documents',
        addDocumentBtn: 'Add document',
        noDocuments: 'No documents attached.',
        docTooBig: 'The file exceeds the 50 MB limit.',
        docLimitReached: 'This job already has the maximum of {{max}} documents.',
        docStorageFull: "Your business reached its plan's storage limit. Upgrade your plan or free up space.",
        deleteDocConfirm: 'Delete this document?',
        docUploadError: 'The document could not be uploaded. Try again.',
        docImageWarn: 'This file is an image. Job photos belong in the Photos section. Attach it as a document anyway (e.g. a scanned contract)?',
        docImageAttachAnyway: 'Attach anyway',
        proposalHeading: 'Estimate',
        issuedAt: 'Issued',
        validUntil: 'Valid until',
        detailsHeading: 'Details',
        scheduledDate: 'Scheduled date',
        location: 'Location',
        callClient: '📞 Call client',
        description: 'Description',
        copied: 'Copied ✓',
        clientNote: 'Note for client',
        internalNote: '📝 Internal note',
        createdOn: 'Created on {{date}}',
        lastEditedOn: 'Last edited {{date}}',
        byUser: 'by {{name}}',
        clientModalTitle: 'Client',
        locationModalTitle: 'Location',
        openInMaps: 'Open in Maps',
        noCustomFields: 'No custom fields.',
        coordinates: 'Coordinates',
        shareLocation: 'Share location',
        sendToCrew: 'Send to crew',
        crewTextClient: 'Client',
        crewTextDate: 'Date',
        workersHeading: 'Workers',
        itemsHeadingProposal: 'Service details',
        itemsHeadingJob: 'Materials and labor',
        noItems: 'No items recorded.',
        colUnitPriceShort: 'U/p',
        autopriceBtn: 'Autoprice',
        autopriceVerify: 'Prices were auto-calculated — please double-check each line, it is not always exact.',
        autopriceNoMatch: 'No lines matched a price. Add match terms (e.g. "tower", "repair") to your items in the Price sheet.',
        autopriceAlreadyPriced: 'Lines that already have a price are left unchanged by Autoprice. Clear a line\'s price if you want it recalculated.',
        autopricePickTitle: 'Choose a price',
        autopricePickSubtitle: 'These lines match more than one price. Pick the right one for each.',
        autopricePickApply: 'Apply prices',
        measuredNote: 'measured {{qty}}',
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
        deleteJobConfirm: 'Are you sure you want to delete this job? This action cannot be undone.',
        cancelJobBtn: 'Cancel job',
        archiveBtn: 'Archive job',
        unarchiveBtn: 'Unarchive job',
        cancelJobConfirm: 'Cancel this job?',
        deleteInvoiceWarning: 'This job has a linked invoice — it will stay in Facturas.',
        deleting: 'Deleting...',
        deleteBtn: 'Delete',
        photos: {
          heading: 'Photos',
          countLabel: '{{count}} of {{max}}',
          addBtn: 'Add photo',
          takePhoto: 'Take photo',
          chooseFromLibrary: 'Choose from library',
          empty: 'No photos for this job yet.',
          uploading: 'Uploading...',
          uploadError: "Couldn't upload the photo. Try again.",
          deleteError: "Couldn't delete the photo. Try again.",
          limitHit: 'Maximum {{max}} photos per job.',
          deleteConfirm: 'Delete this photo?',
          viewerClose: 'Close',
          pendingHint: "Photos will upload when you save the job.",
        },
      },
      new: {
        headingNewJob: 'New job',
        headingNewProposal: 'New estimate',
        headingEditJob: 'Edit job',
        headingEditProposal: 'Edit estimate',
        subtitleNewJob: 'Fill in the job details',
        subtitleNewProposal: 'Create a price estimate for your client',
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
        publishedToCrewLabel: 'Visible to crew',
        publishedToCrewHint: "When off, only you and the office see this job. Assigned crew won't see it.",
        privateBadge: 'Private',
        publicBadge: 'Public',
        issueDateLabel: 'Issue date',
        expiryDateLabel: 'Valid until',
        projectStartLabel: 'Job start',
        statusLabel: 'Status',
        priorityLabel: 'Priority',
        descriptionLabel: 'Description',
        descriptionPlaceholder: 'Details of the work to be done...',
        locationHeading: 'Job location',
        mapLinkLabel: 'Paste map link',
        mapLinkPlaceholder: 'https://maps.google.com/... or https://maps.apple.com/...',
        mapLinkHint: 'Paste a Google Maps or Apple Maps link to capture coordinates',
        coordinatesLabel: 'Coordinates (lat, lng)',
        coordinatesPlaceholder: 'e.g. 40.7128, -74.0060',
        coordinatesInvalid: 'Invalid format. Use "lat, lng" — e.g. 40.7128, -74.0060',
        useMyLocation: 'Use my location',
        gettingLocation: 'Getting location…',
        locationDenied: 'Location permission denied. Enable it in Settings.',
        locationError: 'Could not get your location. Please try again.',
        addressLabel: 'Address',
        addressPlaceholder: '123 County Road',
        cityLabel: 'City',
        cityPlaceholder: 'Omaha',
        stateLabel: 'State',
        stateNone: '—',
        scheduleHeading: 'Date and time',
        allDayLabel: 'All day',
        dateLabel: 'Start date',
        endDateLabel: 'Finish date',
        endDateHint: 'Hide it to use a single date (one-day jobs).',
        dateFieldLabel: 'Date',
        timeFieldLabel: 'Time',
        estimatedHoursLabel: 'Estimated hours',
        estimatedHoursPlaceholder: 'e.g. 52',
        timeStartLabel: 'Start time',
        timeEndLabel: 'End time',
        totalTimeLabel: 'Total time',
        totalHoursLabel: 'Total hours',
        totalHoursAutoHint: 'From start/end',
        totalHoursHint: 'Counts toward worker hours',
        outOfHoursNote: 'Outside business hours',
        outOfHoursClosedNote: 'This day is marked as closed',
        workersHeading: 'Assigned workers',
        additionalWorkersLabel: 'Additional workers (manual)',
        workerNumberPlaceholder: 'Worker {{count}}',
        addWorker: '+ Add worker',
        leadBadge: 'Lead',
        markAsLead: 'Mark as lead',
        leadLabel: 'Job lead',
        leadNone: 'No lead',
        crewLabel: 'Crew',
        driverLabel: 'Driver',
        driverNone: 'No driver',
        driverHoursLabel: 'Driver hours',
        driverHoursHint: 'Extra hours paid only to the driver',
        workerSearchPlaceholder: 'Search worker...',
        workerNoResults: 'No results',
        crewPlaceholder: 'Select crew',
        crewSelectedCount: '{{count}} selected',
        crewDoneBtn: 'Done',
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
        workerNoteLabel: 'Notes for the worker',
        workerNotePlaceholder: 'Specific instructions for the assigned crew...',
        errorTitleRequiredJob: 'Job title is required',
        errorTitleRequiredProposal: 'Title is required',
        errorAtLeastOneItem: 'Add at least one item',
        errorSaveGeneric: 'Save error',
        conflictTitle: 'Scheduling conflict',
        conflictSoftHeading: 'Also scheduled that day',
        conflictAllDay: 'all day',
        conflictUntitled: 'Untitled job',
        conflictConfirmMessage: 'Some assigned people are already booked at this time. Save anyway?',
        conflictSaveAnyway: 'Save anyway',
        conflictGoBack: 'Go back',
        submitCreateJob: 'Create job',
        submitCreateProposal: 'Create estimate',
      },
      actuals: {
        heading: 'Log job',
        subtitle: 'Hours and data per worker.',
        hoursWorkedLabel: 'Hours worked',
        hoursWorkedPlaceholder: '0.0',
        saveBtn: 'Save log',
        markCompleteBtn: 'Mark as completed',
        saveSuccess: 'Log saved.',
        saveError: 'Could not save log.',
      },
      myJobs: {
        title: 'My Jobs',
        subtitle: "Jobs where you're the lead.",
        emptyAll: "You don't have any jobs as lead.",
      },
    },
    employees: {
      title: 'Team',
      summary: '{{active}} active · {{hours}}h this period',
      logHours: 'Log hours',
      hoursLogged: 'Hours logged',
      addHours: 'Add',
      hoursSearchPlaceholder: 'Search by employee or work...',
      hoursNoResults: 'No entries found.',
      hoursThisPeriod: 'Pay period: {{period}}',
      emptyHourTotals: 'No hours this pay period.',
      deleteHoursConfirm: 'Delete this hours entry?',
      teamSearchPlaceholder: 'Search name, phone or field…',
      viewActive: 'Active',
      viewInactive: 'Inactive',
      resultsCount: '{{count}} results',
      selectAllShort: 'All',
      selectedCountSingle: '{{count}} selected',
      selectedCountPlural: '{{count}} selected',
      bulkDelete: 'Delete',
      confirmDeleteBulk: 'Delete {{count}} employees? This cannot be undone and removes their history.',
      filter: {
        button: 'Filter',
        status: 'Status',
        active: 'Active',
        inactive: 'Inactive',
        access: 'App access',
        accessYes: 'Has access',
        accessInvited: 'Invited',
        accessNo: 'No access',
        overtime: 'Overtime',
        yes: 'Yes',
        no: 'No',
        payType: 'Pay type',
        role: 'Role',
        city: 'City',
        state: 'State',
        empty: '(Empty)',
        searchValue: 'Search value…',
        clear: 'Clear filters',
      },
      addBtn: 'Add',
      deleteBtn: 'Delete employee',
      deleteConfirm: 'Delete {{name}}? This cannot be undone and removes their history.',
      deactivateBtn: 'Deactivate employee',
      rosterRemoveBtn: 'Remove from crews',
      createdOnLine: 'Added on {{date}}',
      lastEditedOnLine: 'Last edited {{date}}',
      transferOwnershipBtn: 'Transfer ownership',
      transferOwnershipConfirm: 'Transfer business ownership to {{name}}? They will become the owner (full control, including billing) and your role will change to Admin. Only the new owner can reverse this.',
      transferOwnershipError: 'Could not transfer ownership. Try again.',
      rosterAddBtn: 'Include in crews',
      rosterHint: 'Won\'t be offered when picking a lead, workers or drivers on a job. Still active for payroll and app access.',
      reactivateBtn: 'Reactivate employee',
      tabs: {
        empleados: 'Team',
        horas: 'Hours',
        historial: 'History',
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
        checkNameLabel: 'Check name',
        checkNamePlaceholder: 'Full legal name',
        checkNameHint: 'Leave blank if it\'s the same as the first and last name.',
        phoneLabel: 'Phone',
        phonePlaceholder: '+1 (555) 000-0000',
        roleLabel: 'Role',
        payTypeLabel: 'Pay type',
        payRateLabel: 'Rate ({{unit}})',
        overtimeLabel: 'Gets overtime',
        overtimeThresholdLabel: 'Regular hours/week',
        overtimeMultiplierLabel: 'Multiplier',
        overtimeDefaultPlaceholder: 'Default',
        errorFirstNameRequired: 'First name is required',
        requiredError: 'Required fields: {{fields}}',
        emailLabel: 'Personal email',
        emailPlaceholder: 'john@example.com',
        birthdayLabel: 'Date of birth',
        hireDateLabel: 'Hire date',
        addressLabel: 'Address',
        addressPlaceholder: '123 Main St',
        cityLabel: 'City',
        cityPlaceholder: 'Omaha',
        stateLabel: 'State',
        stateNone: '—',
        zipLabel: 'ZIP code',
        zipPlaceholder: '68102',
        emergencyContactHeading: 'Emergency contact',
        emergencyNameLabel: 'Name',
        emergencyNamePlaceholder: 'Mary Doe',
        emergencyPhoneLabel: 'Phone',
        emergencyPhonePlaceholder: '+1 (555) 000-0000',
        customFieldsHeading: 'Custom fields',
        noCustomFields: 'No custom fields. Configure them in Settings → Employees.',
        basicInfoHeading: 'Basic info',
        personalHeading: 'Personal info',
        employmentHeading: 'Employment & pay',
        appAccessHeading: 'App access',
        appAccessNoneHint: 'Invite this person to sign in to the app with a role.',
        appAccessEmailRequired: 'Add an email to send an invite.',
        appAccessNoManage: 'You do not have permission to manage access.',
      },
      timesheetModal: {
        title: 'Log hours',
        editTitle: 'Edit hours',
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
        selectEmployee: 'Select employee',
        errorEmployeeRequired: 'Select an employee',
      },
      history: {
        title: 'History',
        openBtn: 'View history',
        empty: 'No changes logged yet.',
        events: {
          hired: 'Hired',
          payChange: 'Pay change',
          roleChange: 'Role change',
          terminated: 'Deactivated',
          rehired: 'Reactivated',
          note: 'Note',
        },
        payChangeSummary: '{{from}} → {{to}}',
        payChangeTypeSummary: '{{fromType}} → {{toType}}',
        roleChangeSummary: '{{from}} → {{to}}',
        hiredSummary: 'Started as {{role}} · {{rate}}',
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
        scanHint: 'Point the camera at the barcode',
        cameraDenied: 'Camera access is needed to scan.',
        scanSku: 'Scan code',
        generateSku: 'Generate SKU',
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
      today: 'Today',
      views: {
        month: 'Month',
        week: 'Week',
        day: 'Day',
      },
      agenda: {
        empty: 'Nothing on this day',
        emptyAdd: '+ Add event',
        allDay: 'All day',
        count: '{{count}} total',
      },
      availability: {
        button: 'Availability',
        title: 'Team availability',
        hint: 'The number is how many jobs each person has that day',
        available: 'Available',
        busy: 'Busy',
        noTeam: 'No active employees',
      },
      eventTypes: {
        job: 'Job',
        meeting: 'Meeting',
        delivery: 'Delivery',
        reminder: 'Reminder',
        follow_up: 'Follow-up',
        other: 'Other',
      },
      modal: {
        newEventTitle: 'New event — {{date}}',
        editTitle: 'Edit event',
        titleLabel: 'Title *',
        titlePlaceholder: 'Client meeting, material delivery...',
        typeLabel: 'Type',
        allDayLabel: 'All day',
        dateLabel: 'Date',
        endDateLabel: 'End date',
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
    workspaces: {
      switcherLabel: 'Switch business',
      createBusiness: 'Create business',
      switchedToast: 'Switched to {{name}}',
      delegateBtn: 'Delegate to…',
      delegateModalTitle: 'Delegate job',
      delegateChooseTarget: 'Pick which business should take over this job.',
      delegateConfirm: 'Delegate',
      delegatedBadge: '→ Delegated to {{name}}',
      delegateSuccess: 'Delegated to {{name}}.',
      delegateError: 'Couldn\'t delegate. Try again.',
      delegateAlreadyDone: 'This job has already been delegated.',
      switchToTarget: 'Switch to {{name}}',
      delegatedFilterTab: 'Delegated',
    },
    settings: {
      title: 'Settings',
      importHub: {
        subtitle: "Migrate your business data from another app or CSV files.",
        orderHint: 'Follow the order — each step links to the previous one: jobs match clients and team by name, and invoices link to jobs by their Project ID.',
        step1Title: 'Import clients',
        step1Desc: 'First — jobs and invoices will link to these clients.',
        step2Title: 'Import team',
        step2Desc: 'Job leads and crews are matched by name.',
        step3Title: 'Import jobs',
        step3Desc: 'They link to clients and team. Include the Project ID so invoices can link later.',
        step4Title: 'Upload photos',
        step4Desc: 'Select all photos at once — each is matched to its project by the file name from the "Photos" column.',
        step5Title: 'Import invoices',
        step5Desc: 'Last — each line links to its job by Project ID.',
        step6Title: 'Import payroll history',
        step6Desc: 'Past payments per worker and period — they show up in Payroll → Payment history.',
        step7Title: 'Import equipment',
        step7Desc: 'Vehicles and machinery: make, model, plate, value, insurance and more.',
        step8Title: 'Import inventory',
        step8Desc: 'Materials and items: quantities, costs, categories and stock alerts.',
        recentTitle: 'Recent imports',
        recentEmpty: 'No imports recorded yet.',
        recNew: 'new',
        recUpdated: 'updated',
        recExisted: 'already existed',
        recFailed: 'failed',
        photos: {
          title: 'Upload project photos',
          intro: 'Select all your photos at once. Each file is matched to its project using the jobs CSV\'s "Photos (file names)" column (or a file name containing the Project ID). Unmatched photos are NOT uploaded and use no storage.',
          pendingSummary: '{{names}} photos expected across {{jobs}} projects.',
          pendingByRef: '{{jobs}} projects with a Project ID. Matched by the ID in the file name (e.g. "Proyecto-0a4f0ca7.Foto 1.jpg").',
          noPending: 'No pending photos. Import jobs with the "Photos (file names)" column first.',
          chooseBtn: 'Choose photos',
          dropHint: 'or drag the files here',
          matchedSummary: '{{files}} photos match {{jobs}} projects.',
          unmatchedTitle: 'No match ({{count}})',
          unmatchedHint: 'These files will not be uploaded. Check the name or add them manually on the project.',
          uploadBtn: 'Upload {{count}} photos',
          uploading: 'Uploading {{done}} of {{total}}…',
          doneMsg: '{{count}} photos uploaded.',
          failedMsg: '{{count}} photos failed.',
          alreadyMsg: '{{count}} were already uploaded — skipped.',
          retryBtn: 'Retry failed',
          limitSkipped: '{{count}} skipped by the {{max}} photos-per-project limit.',
          clearBtn: 'Choose different photos',
        },
      },
      tabs: {
        negocio: 'Business',
        trabajos: 'Jobs',
        clientes: 'Clients',
        empleados: 'Team',
        precios: 'Price sheet',
        importar: 'Import data',
        facturas: 'Invoices',
        facturaTema: 'Invoice theme',
        cuenta: 'Account',
        conexiones: 'Connections',
        equipo: 'Team',
        actividad: 'Activity',
        tienda: 'Module Store',
        navegacion: 'Navigation',
        ubicaciones: 'Locations',
      },
      priceSheet: {
        title: 'Price sheet',
        subtitle: 'Prices used to autoprice jobs.',
        addBtn: 'Add price',
        empty: 'No prices yet. Add the first to autoprice jobs.',
        nameLabel: 'Name',
        namePlaceholder: 'e.g. New pivot assembly',
        categoryLabel: 'Category',
        categoryPlaceholder: 'e.g. New pivots',
        uncategorized: 'Uncategorized',
        modeLabel: 'How it is charged',
        modePerUnit: 'Per unit',
        modeFlat: 'Flat price',
        unitLabel: 'Unit',
        unitPlaceholder: 'ft, cut, item…',
        rateLabel: 'Price',
        flatWord: 'flat',
        stateRatesLabel: 'Prices by state',
        stateRatesHint: 'Optional. Used when the job is in that state.',
        clientRatesLabel: 'Prices by client',
        clientRatesHint: 'Optional. A special price for one client — beats state pricing.',
        addClientRate: '+ Add client',
        clientPickPlaceholder: 'Pick a client…',
        addStateRate: 'Add state',
        addAllStates: 'Add all states',
        statePlaceholder: 'State (e.g. NE)',
        selectStatePlaceholder: 'Select a state',
        searchPlaceholder: 'Search prices...',
        unitHint: 'Optional. Leave empty for a flat price (not per unit).',
        noResults: 'No results.',
        inactiveBadge: 'Inactive',
        deactivate: 'Deactivate',
        activate: 'Activate',
        duplicate: 'Duplicate',
        copySuffix: '(copy)',
        deleteConfirm: 'Delete this price?',
        saveBtn: 'Save',
        tiersTitle: 'Price tiers',
        tiersHint: 'Pricing models for different clients (e.g. Standard, Far, Wholesale). Assign a tier to each client.',
        addTier: 'Add tier',
        tierNamePlaceholder: 'e.g. Far',
        deleteTierConfirm: 'Delete this tier?',
        tierRatesLabel: 'Prices by tier',
        matchTermsLabel: 'Auto-price terms',
        matchTermsHint: 'Optional. Other phrasings, acronyms or abbreviations — help the Auto-price button find this price.',
        matchTermsPlaceholder: 'tower, pivot, new pivot…',
        addonLabel: 'This is an add-on (surcharge)',
        addonHint: 'Adds on top of the base price for any line whose text contains its terms (e.g. Boombacks +$0.25/ft). Not a base price on its own.',
        addonBadge: 'Add-on',
        addonInlineLabel: "Bundle into the job's line",
        addonInlineHint: 'Instead of its own line, fold this fee into the matched line’s total (blended rate). Use it when you’d rather it not show separately.',
        clientTierLabel: 'Price tier',
        clientTierNone: 'Standard (base)',
        generateBtn: 'Generate sheet',
        generateTitle: 'Generate price sheet',
        forClient: 'Client',
        forState: 'State',
        selectClientPlaceholder: 'Choose a client…',
        searchClientPlaceholder: 'Search client by name or company…',
        noClientMatches: 'No matches.',
        emailBtn: 'Email',
        emailSubject: 'Price sheet – {{business}}',
        emailBody: 'Hi {{name}},\n\nSharing our current price sheet (PDF attached).\n\nBest,\n{{business}}',
        generateForClientBtn: 'Generate price sheet',
        preparedFor: 'Prepared for',
        sheetTitle: 'Price Sheet',
        additionalCharges: 'Additional charges',
        printBtn: 'Print / Save as PDF',
        generatedOn: 'Generated on',
        allStatesLabel: 'All states',
        genericSheet: 'General pricing',
        customizeBtn: 'Customize',
        customizeTitle: 'Customize price sheet',
        accentColorLabel: 'Accent color',
        designLabel: 'Design',
        designClassic: 'Classic',
        designCards: 'Cards',
        designBold: 'Bold',
        designElegant: 'Elegant',
        designMinimal: 'Minimal',
        sectionOrderLabel: 'Section order',
        sectionOrderHint: 'Use the arrows to reorder the categories.',
      },
      navigation: {
        subtitle: 'Choose which apps appear in the bottom bar.',
        title: 'Navigation bar',
        intro: 'Pick up to {{max}} apps for the bottom bar and drag to reorder them. Home and More are always shown.',
        inBarLabel: 'In the bar',
        availableLabel: 'Available',
        reorderHint: 'Press and hold an app, then drag to reorder.',
        inicioLabel: 'Home',
        masLabel: 'More',
        fixedBadge: 'Fixed',
        maxNote: 'Up to {{max}} custom apps',
        maxReached: 'You can pick up to {{max}} apps. Remove one to add another.',
        minReached: 'You must keep at least one app.',
        savedError: "Couldn't save. Please try again.",
      },
      employeesSection: {
        title: 'Employee fields',
        subtitle: 'Configure custom fields for your employees.',
        customFieldsSubtitle: 'Extra fields shown on every employee form.',
      },
      jobsSection: {
        title: 'Job fields',
        subtitle: 'Reorder fields, mark which are required, and add custom ones.',
      },
      invoicesSection: {
        title: 'Invoice fields',
        subtitle: 'Reorder fields, mark which are required, and add custom ones.',
      },
      crewMode: {
        heading: 'Crew mode',
        subtitle: 'Lets leads assign a crew and record their hours. Turn off if you work solo: hides the lead, crew and driver pickers on jobs.',
        saveBtn: 'Save crew mode',
        saveSuccess: 'Crew mode saved.',
        saveError: 'Could not save.',
      },
      itemTypes: {
        heading: 'Materials & labor',
        subtitle: 'Shows the Materials & Labor section (with Labor / Material / Equipment / Other tags) on jobs. Turn off to hide the section entirely — for businesses that don’t itemize. Proposals always keep it.',
        toggleLabel: 'Show section',
        saveSuccess: 'Saved',
        saveError: 'Could not save',
      },
      crewFinderToggle: {
        heading: 'Suggest crew',
        subtitle: 'Shows a “Suggest crew” button on the job form that ranks your team by distance to the job and who’s free that day. Turn off if you just assign your own team.',
        toggleLabel: 'Show button',
        saveSuccess: 'Saved',
        saveError: 'Could not save',
      },
      privateOnInvoice: {
        heading: 'Private after invoicing',
        subtitle: 'Automatically switches jobs to private (hidden from the crew) as soon as they are invoiced. Applies everywhere: job detail, invoice generation and imports.',
        toggleLabel: 'Automatically switch jobs to private after invoice',
      },
      jobAlerts: {
        heading: 'Upcoming-job alerts',
        subtitle: "Highlight jobs whose start date is approaching so you know which ones still need to be scheduled.",
        enabledLabel: 'Enable alerts',
        enabledHint: 'When on, each scheduled job shows a colored border on the list depending on the level it matches.',
        levelsHeading: 'Alert levels',
        levelsEmpty: 'Add at least one level to highlight job cards.',
        daysLabel: 'Days before',
        colorLabel: 'Color',
        daysSuffixOne: 'day before',
        daysSuffixMany: 'days before',
        addLevelBtn: 'Add level',
        removeLevelLabel: 'Remove level',
        overdueHeading: 'Overdue indicator',
        overdueSubtitle: 'Flag jobs in red when they\'re past their scheduled date and not yet completed.',
        overdueBadge: 'Overdue',
        colors: {
          red: 'Red',
          orange: 'Orange',
          yellow: 'Yellow',
          blue: 'Blue',
          purple: 'Purple',
        },
        saveBtn: 'Save alerts',
        saveSuccess: 'Saved!',
        saveError: 'Save error.',
      },
      assignmentFieldsSection: {
        title: 'Per-worker fields',
        subtitle: 'Fields the lead fills out for each worker.',
      },
      contactsStats: {
        heading: 'Contacts summary',
        clientsLabel: 'Clients',
        contactsLabel: 'Contact persons',
        totalLabel: 'Total',
        googleHint: 'Clients and their contact persons sync to Google Contacts when sync is enabled.',
      },
      unsavedChangesTitle: 'Unsaved changes',
      unsavedChangesMessage: 'Discard your changes? This cannot be undone.',
      discardBtn: 'Discard',
      fieldTypes: {
        text: 'Text',
        note: 'Note (long text)',
        number: 'Number',
        date: 'Date',
        boolean: 'Yes / No',
        select: 'Dropdown list',
      },
      pipelineSteps: {
        proposal: { label: 'Estimate', description: 'Initial estimate phase' },
        sent: { label: 'Sent', description: 'Estimate sent to client' },
        accepted: { label: 'Accepted', description: 'Estimate accepted by client' },
        scheduled: { label: 'Scheduled', description: 'Job scheduled with a date' },
        in_progress: { label: 'In progress', description: 'Job currently in execution' },
        completed: { label: 'Completed', description: 'Job finished' },
        invoiced: { label: 'Invoiced', description: 'Invoice generated for the job' },
      },
      business: {
        heading: 'Business info',
        subtitle: 'Basic information about your company.',
        nameLabel: 'Business name',
        logoLabel: 'Logo',
        logoUploadBtn: 'Upload logo',
        logoChangeBtn: 'Change logo',
        logoRemoveBtn: 'Remove logo',
        logoRemoveConfirm: 'Remove the logo? It will be permanently deleted.',
        logoUploading: 'Uploading…',
        logoError: "Couldn't upload the logo. Try again.",
        logoSizeError: 'Image exceeds the 2 MB limit.',
        contactHeading: 'Contact',
        emailLabel: 'Email',
        phoneLabel: 'Phone',
        websiteLabel: 'Website',
        addressHeading: 'Address',
        addressLabel: 'Street address',
        cityLabel: 'City',
        stateLabel: 'State',
        zipLabel: 'ZIP code',
        legalHeading: 'Tax & legal',
        taxIdLabel: 'Tax ID / EIN',
        licenseLabel: 'License number',
        invoiceHeading: 'Invoicing',
        invoiceNotesLabel: 'Default invoice notes',
        invoiceNotesPlaceholder: 'Payment terms, transfer instructions, etc.',
        operatingHoursHeading: 'Operating hours',
        operatingHoursSub: 'Set your hours to get a heads-up when a job is scheduled outside them.',
        closedLabel: 'Closed',
        openTimeLabel: 'Opens',
        closeTimeLabel: 'Closes',
        days: {
          mon: 'Monday',
          tue: 'Tuesday',
          wed: 'Wednesday',
          thu: 'Thursday',
          fri: 'Friday',
          sat: 'Saturday',
          sun: 'Sunday',
        },
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
      invoices: {
        heading: 'Default configuration',
        subtitle: 'Default terms and custom fields for your invoices.',
        defaultLanguageLabel: 'Default invoice language',
        defaultLanguageHint: 'The language new invoices start in. You can still change it per invoice.',
        emailDeliveryLabel: 'Email delivery',
        emailDeliveryHint: 'What to include when you email an invoice.',
        emailDeliveryPdf: 'Attach PDF only',
        emailDeliveryLink: 'Link only',
        emailDeliveryBoth: 'PDF + link',
        emailLinkMissingWarning: 'Delivery includes a link, but your message has no {{link}} placeholder — the client won\'t get the link. Add {{link}} to the message or switch to "Attach PDF only".',
        emailLinkUnusedWarning: 'Delivery is "Attach PDF only", but your message has a {{link}} placeholder — it will be removed and no link is sent. Switch to "Link only" or "PDF + link" to include it, or remove {{link}}.',
        dueDaysLabel: 'Default due window (days)',
        dueDaysHint: 'When you create an invoice, the due date is auto-set this many days from the issue date. Leave empty to use the default of 30 days (Net 30).',
        taxRateLabel: 'Default tax rate (%)',
        taxRateHint: 'Applied to new invoices; adjustable per invoice. Leave empty or 0 for no tax. Existing invoices are unchanged.',
        qtyFieldLabel: 'Quantity field',
        qtyFieldHint: 'When a job has no Materials & Labor, use this custom field\'s value (e.g. "Total ft") as the line quantity. Set to "None" to use 1.',
        qtyFieldNone: 'None (quantity 1)',
        startNumberLabel: 'Starting invoice number',
        startNumberHint: 'Your first invoice uses this number and the rest are numbered in order (INV-1000, INV-1001…). Existing invoices are unchanged.',
        notesLabel: 'Default notes / terms',
        notesPlaceholder: 'Payment terms, transfer instructions, etc.',
        emailHeading: 'Send-invoice email',
        emailSubtitle: 'Customizes the email opened by "Send invoice". It does not change the invoice document.',
        emailSubjectLabel: 'Email subject',
        emailBodyLabel: 'Email message',
        emailVarsHint: 'Tap a variable to insert it at the cursor. Leave empty to use the standard message.',
        saveError: 'Save error.',
        saveSuccess: 'Saved!',
        confirmDeleteField: 'Delete this field? Data on existing invoices will be lost.',
        design: {
          title: 'Invoice design',
          subtitle: 'Pick a template and customize it. Applies to the view, the PDF, and the public link.',
          defaultLanguage: 'Default invoice language',
          defaultLanguageHint: 'New invoices are created in this language. You can change it on each invoice.',
          layout: 'Layout',
          layoutModes: { structured: 'Structured', freeform: 'Freeform' },
          builderHint: 'Drag a section to move it, and use the corner handle to resize.',
          builderMobileHint: 'Freeform layout is edited on the web. Here you can preview the result.',
          preset: 'Template',
          presets: {
            classic: 'Theme 1', band: 'Theme 2', sidebar: 'Theme 3', split: 'Theme 4',
            stamp: 'Theme 5', leftbar: 'Theme 6', centered: 'Theme 7', minimal: 'Theme 8',
            hero: 'Theme 9', ledger: 'Theme 10', masthead: 'Theme 11', boutique: 'Theme 12',
            wave: 'Theme 13', fresh: 'Theme 14', orbit: 'Theme 15', prism: 'Theme 16',
          },
          presetGroups: {},
          browseThemes: 'Browse templates',
          themesTitle: 'Choose a template',
          useTheme: 'Use this template',
          currentTheme: 'Current template',
          archetype: 'Header style',
          archetypeHint: 'Change the header structure without switching template.',
          archetypes: {
            classic: 'Classic', band: 'Band', centered: 'Centered', sidebar: 'Sidebar', minimal: 'Minimal',
          },
          accent: 'Accent color',
          font: 'Font',
          fonts: { sans: 'Sans serif', helvetica: 'Helvetica', gillsans: 'Gill Sans', futura: 'Futura', avenir: 'Avenir', optima: 'Optima', trebuchet: 'Trebuchet', verdana: 'Verdana', serif: 'Serif (Georgia)', times: 'Times', palatino: 'Palatino', baskerville: 'Baskerville', didot: 'Didot', hoefler: 'Hoefler', typewriter: 'American Typewriter', copperplate: 'Copperplate', mono: 'Monospace', courier: 'Courier' },
          density: 'Density',
          densities: { comfortable: 'Comfortable', compact: 'Compact' },
          invertLogo: 'Invert logo colors',
          showLogo: 'Show logo',
          logoSize: 'Logo size',
          logoSizes: { sm: 'Small', md: 'Medium', lg: 'Large' },
          sections: 'Sections',
          sectionNames: {
            header: 'Header', billTo: 'Bill to', lineItems: 'Line items', totals: 'Totals',
            customFields: 'Custom fields', notes: 'Notes', paymentInstructions: 'Payment instructions', footer: 'Footer',
          },
          columns: 'Columns',
          columnNames: { qty: 'Qty', rate: 'Rate', total: 'Total' },
          textBlocks: 'Text blocks',
          headerNote: 'Header note',
          paymentInstructionsField: 'Payment instructions',
          footerField: 'Footer',
          preview: 'Preview',
          elements: {
            addText: 'Text',
            addField: 'Field',
            addLogo: 'Logo',
            addShape: 'Shape',
            addIcon: 'Icon',
            shapeKinds: { rectangle: 'Rectangle', ellipse: 'Circle' },
            fillColor: 'Fill',
            opacity: 'Opacity',
            cornerRadius: 'Corners',
            selectField: 'Pick a field…',
            textContent: 'Text',
            fontSize: 'Size',
            color: 'Color',
            align: 'Align',
            deleteEl: 'Delete',
            empty: 'Drag elements to place them. Tap one to edit it.',
          },
          decoration: 'Decoration',
          decorations: { none: 'None', corners: 'Corners', wave: 'Wave', arc: 'Arc' },
          pageTint: 'Background tint',
          fields: {
            businessName: 'Business name', businessContact: 'Business contact',
            invoiceTitle: 'Title (Invoice)', invoiceNumber: 'Invoice number', status: 'Status',
            issueDate: 'Issue date', dueDate: 'Due date',
            billToLabel: '"Bill to" label', billToName: 'Client name', billToContact: 'Client contact',
            lineItems: 'Line-items table', subtotal: 'Subtotal', tax: 'Tax', total: 'Total',
            notes: 'Notes', paymentInstructions: 'Payment instructions',
            headerNote: 'Header note', footer: 'Footer',
          },
          elementFont: 'Font',
          undo: 'Undo',
          redo: 'Redo',
          copyTheme: 'Start from a template',
          copyThemeTitle: 'Start from a template',
          blankTheme: 'Blank',
        },
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
        fieldNameLabelEs: 'Name (Español)',
        fieldNameLabelEn: 'Name (English)',
        translationHint: 'Fill at least one. Each user sees the name in their language; if missing, the other is used.',
        keyLabel: 'Key',
        fieldTypeLabel: 'Field type',
        optionsLabel: 'Options',
        optionsHint: '(one per line)',
        optionsPlaceholder: 'Option 1\nOption 2\nOption 3',
        requiredToggleLabel: 'Required field',
        integerOnlyToggleLabel: 'Whole numbers only',
        integerOnlyHint: 'No decimals (e.g. 5, not 5.5)',
        thousandsToggleLabel: 'Thousands separator',
        thousandsHint: 'Shows 1,000 instead of 1000',
        multiToggleLabel: 'Allow multiple options',
        multiHint: 'Several can be selected at once',
        addFieldBtn: 'Add field',
        updateFieldBtn: 'Update field',
        errorNameRequired: 'Field name is required',
        errorDuplicate: 'A field with that name already exists',
        errorSave: 'Save error.',
        confirmDelete: 'Delete this field? Data in existing clients will be lost.',
      },
      account: {
        heading: 'Account',
        subtitle: 'Your sign-in information.',
        emailLabel: 'Email',
        roleLabel: 'Role',
        firstNameLabel: 'First name',
        lastNameLabel: 'Last name',
        saveNameBtn: 'Save name',
        nameSaveSuccess: 'Name updated.',
        nameSaveError: "Couldn't save your name.",
        businessesHeading: 'Your businesses',
        businessesSubtitle: 'Businesses you belong to and your role in each one.',
        businessesEmpty: 'You are not a member of any business yet.',
        logoutConfirm: 'Are you sure you want to sign out?',
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
        currentPasswordLabel: 'Current password',
        currentPasswordPlaceholder: 'Your current password',
        newPasswordLabel: 'New password',
        newPasswordPlaceholder: 'At least 8 characters',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        saveBtn: 'Update password',
        errorMinLength: 'At least 8 characters',
        errorCurrentRequired: 'Enter your current password.',
        errorCurrentWrong: 'Your current password is incorrect.',
        errorPrefix: 'Error: {{message}}',
        successMsg: 'Password updated!',
      },
      support: {
        heading: 'Support & feedback',
        subtitle: 'Got a problem or an idea? Email us and we\'ll help.',
        contactBtn: 'Email us',
        emailSubject: 'Amixos — Support / Feedback',
        noMailApp: "Couldn't open your mail app. Email us at {{email}}.",
      },
      google: {
        heading: 'Sync with Google Contacts',
        subtitle: 'When you add a client, they\'re also saved to your Google Contacts so their name shows up when they call you.',
        scopeNote: 'This connection is per business. Active business: {{name}}',
        statusCheckError: "Couldn't check the connection. Check your internet or the API configuration.",
        connectBtn: 'Connect Google',
        reconnectBtn: 'Reconnect Google',
        disconnectBtn: 'Disconnect',
        forceSyncBtn: 'Force manual sync',
        connected: 'Connected',
        disconnected: 'Disconnected',
        reconnectNeeded: 'Reconnect required',
        contactGroupLabel: 'Contact group',
        contactGroupNoneOption: 'My Contacts (default)',
        lastSyncedAt: 'Last synced',
        lastSyncError: 'Last error',
        connectError: 'Couldn\'t connect to Google. Try again.',
        cancelled: 'Connection cancelled.',
        disconnectTitle: 'Disconnect Google Contacts',
        disconnectBody: "Your Amixos clients won't sync to Google anymore.",
        disconnectCountGeneric: 'What about the contacts Amixos added to Google?',
        disconnectCountWithNumber: 'What about the {{count}} contacts Amixos added to Google?',
        disconnectKeepBtn: 'Keep in Google',
        disconnectDeleteBtn: 'Remove from Google',
        backfillTitle: 'Sync existing clients',
        backfillBody: "You have {{count}} clients in Amixos that aren't in Google yet. Add them to your Google contacts now?",
        backfillSyncBtn: 'Yes, sync them',
        backfillSkipBtn: 'No thanks',
        backfillProgress: 'Syncing {{count}} contacts...',
        backfillDoneTitle: 'Sync complete!',
        backfillDoneBody: '{{created}} added, {{linked}} linked.',
        backfillFailedToast: "Couldn't complete the sync.",
        templateTitle: 'Notes template',
        templateHint: 'Customize the Google Contacts "Notes" field. Some custom fields don\'t appear on devices that don\'t use Google Contacts natively. Use {{Field Label}} to insert a value. Lines with empty fields are skipped automatically.',
        templatePlaceholder: 'e.g.\nPivot Brand: {{Pivot Brand}}\nGrain Bin Brand: {{Grain Bin Brand}}',
        templateAvailable: 'Available',
        templateSaveBtn: 'Save template',
        templateSaving: 'Saving…',
        templateSaved: 'Template saved. It applies on the next sync.',
        templateSaveError: "Couldn't save the template. Try again.",
        templateReapplyBtn: 'Apply to existing contacts',
        templateReapplyEmpty: "No synced contacts to apply the template to yet.",
        templateReapplyConfirmTitle: 'Apply template to existing contacts?',
        templateReapplyConfirmBody: '{{count}} synced Google contacts will be updated. Takes a few minutes. You can cancel anytime.',
        templateReapplyConfirmBtn: 'Apply',
      },
      team: {
        heading: 'Team',
        subtitle: 'Invite your team and manage their permissions',
        membersHeading: 'Members',
        invitesHeading: 'Pending invites',
        inviteBtn: 'Invite member',
        inviteModalTitle: 'Invite a member',
        emailLabel: 'Email',
        emailPlaceholder: 'name@example.com',
        roleLabel: 'Role',
        sendInviteBtn: 'Send invite',
        sending: 'Sending...',
        copyLinkBtn: 'Copy link',
        linkCopied: 'Link copied',
        pendingBadge: 'Pending',
        expiredBadge: 'Expired',
        acceptedBadge: 'Accepted',
        revokeBtn: 'Revoke',
        removeBtn: 'Remove',
        verComoBtn: 'View as',
        verComoNotAllowed: "You can't view this user's account.",
        verComoNotMember: 'This user is no longer a member.',
        verComoFailed: 'Could not start “View as”. Please try again.',
        changeRoleBtn: 'Change role',
        youSuffix: '(you)',
        ownerSuffix: '(owner)',
        noMembersYet: 'No members yet besides you.',
        noPendingInvites: 'No pending invites.',
        inviteSentToast: 'Invite sent to {{email}}.',
        inviteFailedToast: 'Could not send invite.',
        confirmRemove: 'Remove {{name}} from the business?',
        confirmRevoke: 'Revoke the invite for {{email}}?',
        errorInviteSelf: "You can't invite yourself.",
        errorAlreadyMember: 'This person is already a member.',
        errorAlreadyInvited: 'There is already a pending invite for this email.',
      },
      activity: {
        heading: 'Activity',
        subtitle: 'Log of important changes in this business',
        emptyState: 'No activity recorded yet.',
        loadMore: 'Load more',
        unknownUser: 'Unknown user',
        searchPlaceholder: 'Search by person, action, or detail...',
        noResults: 'No changes match your search.',
        timeJustNow: 'just now',
        timeMinutesAgo: '{{n}} min ago',
        timeHoursAgo: '{{n}} h ago',
        timeDaysAgo: '{{n}} d ago',
      },
      store: {
        heading: 'Module Store',
        subtitle: 'Enable or disable modules for your business.',
        statusAvailable: 'Available',
        statusComingSoon: 'Coming soon',
        enabledBadge: 'Active',
        enable: 'Enable',
        disable: 'Disable',
        enableConfirmTitle: 'Enable {{name}}?',
        enableConfirmBody: "These modules aren't required — they add extra features for your business. You can disable it anytime.",
        disableConfirmTitle: 'Disable {{name}}?',
        disableConfirmBody: "You'll lose access to this module's features. Your data stays and you can turn it back on whenever you want.",
        searchPlaceholder: 'Search modules...',
        categoryAll: 'All',
        categoryTools: 'Tools',
        categoryIndustry: 'Industry',
        noResults: 'No modules found.',
      },
    },
    modules: {
      placeholder: {
        heading: 'Coming soon',
        body: "This module is still in development. You'll be able to use it here shortly.",
      },
      list: {
        map:          { name: 'Map',          description: 'See clients, jobs, and employees on a map' },
        mechanic:     { name: 'Mechanic',     description: 'Work orders, VIN, parts, diagnostics' },
        salon:        { name: 'Salon',        description: 'Appointments, stylist commissions, service menu' },
        landscaping:  { name: 'Landscaping',  description: 'Properties, seasonal scheduling, equipment' },
        restaurant:   { name: 'Restaurant',   description: 'Tables, menu, orders, kitchen inventory' },
        cleaning:     { name: 'Cleaning',     description: 'Routes, task lists, supplies' },
        construction: { name: 'Construction', description: 'Permits, blueprints, measurements, subcontractors' },
        rentals:      { name: 'Rental Properties', description: 'Tenants, payments, leases, work-order requests' },
        loyalty:      { name: 'Loyalty Program',   description: 'Track customer loyalty points and rewards' },
        trainer:      { name: 'Trainer',           description: 'Workout and meal plans for your clients' },
        files:        { name: 'Files',             description: 'Manuals and documents your team can open (upload files or paste links)' },
        fundraising:  { name: 'Fundraising',       description: 'For nonprofits: track goals and money raised' },
        equipment:    { name: 'Equipment',         description: 'Trucks, cars, heavy equipment, and everything else your business owns' },
        inventory:    { name: 'Inventory',         description: 'Products, parts, and materials with stock counts' },
        wedding:      { name: 'Wedding Planner',   description: 'Guest counts, event schedule, and planning' },
        dealership:   { name: 'Car Dealership',    description: 'Vehicle inventory and lot sales' },
        messaging:    { name: 'SMS Messaging',     description: 'Text your clients using your own Twilio or ClickSend account' },
      },
      messaging: {
        title: 'SMS Messaging',
        subtitle: 'Connect your provider and text clients right from Amixos.',
        connectTitle: 'Connect a provider',
        providerLabel: 'Provider',
        providerHint: 'Use your own Twilio or ClickSend account.',
        twilio: 'Twilio',
        clicksend: 'ClickSend',
        accountSidLabel: 'Account SID',
        authTokenLabel: 'Auth Token',
        usernameLabel: 'Username',
        apiKeyLabel: 'API Key',
        fromNumberLabel: 'From number',
        fromNumberHint: 'The number texts are sent from (+1... format).',
        saveBtn: 'Connect',
        verifying: 'Verifying…',
        connected: 'Connected',
        connectedVia: 'Connected with {{provider}}',
        fromShown: 'From {{number}}',
        change: 'Change',
        disconnect: 'Disconnect',
        composeTitle: 'Send a message',
        clientLabel: 'Client',
        selectClient: 'Select a client',
        manualNumber: 'Manual number',
        toLabel: 'To',
        toPlaceholder: '+1 555 123 4567',
        messageLabel: 'Message',
        messagePlaceholder: 'Type your message...',
        sendBtn: 'Send SMS',
        sending: 'Sending…',
        sentToast: 'Message sent!',
        onlyWriters: 'Only the owner or admins can connect the provider.',
        notConfigured: 'Connect a provider to start sending messages.',
        errors: {
          invalid_credentials: 'Invalid credentials. Double-check your details.',
          missing_credentials: 'Missing account details.',
          not_configured: 'No provider connected.',
          network_error: 'Could not reach the provider.',
          generic: 'Something went wrong. Try again.',
        },
      },
      map: {
        layers: {
          clients: 'Clients',
          jobs: 'Jobs',
          employees: 'Employees',
        },
        searchPlaceholder: 'Search by name, city, state...',
        searchNoResults: 'No results.',
        searchResultsCount: '{{count}} results',
        layerToggleHint: 'Tap to show / hide',
        resetView: 'View all pins',
        noPinsYet: 'No pins to show yet.',
        geocodeMissing: '{{count}} clients without coordinates. Tap to locate them.',
        geocodeRunning: 'Locating clients...',
        geocodeDone: 'Done. {{count}} clients located.',
        geocodeProgress: 'Locating: {{done}} of {{total}}…',
        geocodeBreakdown: '{{noAddr}} no address · {{unresolved}} not found · {{pending}} pending',
        geocodeBreakdownNoAddress: '{{count}} no address',
        geocodeBreakdownUnresolved: '{{count}} not found',
        geocodeBreakdownPending: '{{count}} pending',
        geocodeNoneLeft: 'No clients left to locate.',
        geocodeListTitle: 'Clients without coordinates',
        geocodeListSectionNoAddress: 'No address',
        geocodeListSectionUnresolved: 'Not found',
        geocodeListSectionPending: 'Pending',
        geocodeListEmpty: 'No clients without coordinates.',
        geocodeListNoAddressHint: 'Add street, city, and state on the client detail page.',
        geocodeListUnresolvedHint: 'Google could not find this address. Verify and correct the fields.',
        geocodeListRetryBtn: 'Retry pending',
        geocodeListOpenClient: 'Open client',
        geocodeListUnnamed: 'Unnamed',
        geocodeIgnoreBtn: 'Permanently ignore',
        geocodeRestoreBtn: 'Restore',
        ignoredSectionTitle: 'Ignored clients',
        ignoredSectionSubtitle: 'Restore a client so it counts toward the map again.',
        outreachModeOn: 'Outreach mode',
        outreachModeOff: 'Clear outreach',
        outreachModeBadge: 'Contacted within {{days}} days are marked with ✓',
        outreachDaysLabel: 'Contact follow-up',
        outreachDaysSubtitle: 'Days a client counts as contacted in outreach mode.',
        outreachDaysValue: '{{days}} days',
        settingsTitle: 'Map settings',
        mapTypeLabel: 'Map type',
        mapTypeStandard: 'Standard',
        mapTypeSatellite: 'Satellite',
        mapTypeHybrid: 'Hybrid',
        mapTypeTerrain: 'Terrain',
        clusteringLabel: 'Cluster nearby pins',
        clusteringSubtitle: 'Group pins that overlap into a single bubble.',
        pinSizeLabel: 'Pin size',
        pinSizeSmall: 'Small',
        pinSizeMedium: 'Medium',
        pinSizeLarge: 'Large',
        pinRulesHeading: 'Layer styles',
        pinRulesSubtitle: 'Color and shape based on a field value.',
        pinLayerClients: 'Clients',
        pinLayerJobs: 'Jobs',
        pinLayerEmployees: 'Employees',
        defaultStyleLabel: 'Default style',
        colorByFieldLabel: 'Color by field',
        noFieldOption: 'No rule (use default style)',
        addRuleBtn: 'Add rule',
        rulesEmpty: 'No rules yet. Add one to color by value.',
        ruleValueLabel: 'Value',
        ruleValuePlaceholder: 'e.g. Valley',
        pinShapePin: 'Pin',
        pinShapeCircle: 'Circle',
        pinShapeSquare: 'Square',
        pinShapeTriangle: 'Triangle',
        pinShapeStar: 'Star',
        modeLabel: 'Mode',
        modeNoRule: 'No rule',
        modeCustom: 'Custom rule',
        applyRuleToLabel: 'Apply rule to field',
        ruleFieldPlaceholder: 'Choose a field',
        editStylePinHint: 'Edit style',
        stylePickerTitle: 'Color and icon',
        colorLabel: 'Pin color',
        iconColorLabel: 'Icon color',
        iconLabel: 'Icon',
        iconCategories: {
          location: 'Location',
          buildings: 'Buildings',
          agriculture: 'Agriculture',
          weather: 'Weather',
          tools: 'Tools',
          vehicles: 'Vehicles',
          people: 'People',
          status: 'Status',
          commerce: 'Commerce',
          tech: 'Tech',
        },
        iconSearchPlaceholder: 'Search icon… (e.g. tornado, droplets)',
        iconSearchNoResults: 'No icons match.',
        ruleMatchCount: '{{count}} matches',
        ruleMatchCountSingle: '1 match',
        ruleMatchCountZero: 'No matches',
        operatorEquals: 'Equals',
        operatorNotEquals: 'Not equals',
        operatorHasValue: 'Has any value',
        operatorContains: 'Contains',
        operatorGt: 'Greater than',
        operatorGte: 'Greater than or equal',
        operatorLt: 'Less than',
        operatorLte: 'Less than or equal',
        anyValuePlaceholder: '(any value)',
        ruleHideTooltip: 'Hide matching pins',
        ruleHiddenCount: '{{count}} hidden',
        ruleHiddenCountSingle: '1 hidden',
        ruleOrderNote: 'Order matters: the first matching rule wins.',
        saveBtn: 'Save',
        saveSuccess: 'Settings saved.',
        saveError: 'Could not save settings.',
        openRecord: 'Open',
        noClient: 'No client',
        noAddress: 'No address',
        assignedToJob: 'Assigned to',
        weather: {
          sectionTitle: 'Weather alerts',
          sectionSubtitle: 'Turn on to show active NWS alerts (api.weather.gov) on the map.',
          enabledLabel: 'Enable weather alerts',
          enabledSubtitle: "Active alerts matching your event types will be shown.",
          retentionLabel: 'Alert retention (days)',
          retentionSubtitle: 'Expired alerts are kept in the cache for this many days before being deleted.',
          proximityRadiusLabel: 'Focus radius (miles)',
          proximityRadiusSubtitle: 'Distance used to filter clients/jobs/employees near an alert when the map’s "Storm focus" mode is on.',
          focusModeOn: 'Storm focus',
          focusModeOff: 'Clear focus',
          focusModeBadge: 'Showing pins near storms only',
          excludedStatesLabel: 'Excluded states',
          excludedStatesPlaceholder: 'e.g. AK, HI, CA',
          eventsHeading: 'Alert types',
          eventsSubtitle: 'Only alerts whose "event" matches this list are shown.',
          addEventBtn: 'Add Alert',
          eventsEmpty: 'No alert types yet.',
          eventNameLabel: 'Event name',
          eventNamePlaceholder: 'Select a type',
          eventPickerTitle: 'Select alert type',
          eventPickerSearchPlaceholder: 'Search type...',
          eventPickerNoResults: 'No types match.',
          eventCategories: {
            severe: 'Severe storms',
            wind: 'Wind',
            flood: 'Flood',
            winter: 'Winter',
            temperature: 'Temperature',
            tropical: 'Tropical',
            fire: 'Fire & air',
            tsunami: 'Tsunami',
            general: 'General',
          },
          minWindLabel: 'Min wind (mph)',
          minWindHint: 'Optional. Filters the alert by reported gust speed.',
          layerName: 'Weather',
          layerToggleHint: 'Tap to show or hide active alerts.',
          refreshingNow: 'Refreshing alerts...',
          refreshLastAt: 'Updated {{when}}',
          refreshError: 'Could not refresh alerts.',
          alertCount: '{{count}} active alerts',
          alertCountSingle: '1 active alert',
          alertCountZero: 'No active alerts',
          pinPopupExpires: 'Expires',
          pinPopupArea: 'Area',
          pinPopupSeverity: 'Severity',
          pinPopupOpenNws: 'Open in NWS',
          pinPopupHeadline: 'Alert',
          pinPopupEvent: 'Event',
          pinPopupCity: 'County',
          pinPopupState: 'State',
          pinPopupStarts: 'Starts',
          pinPopupEnds: 'Ends',
          pinPopupSent: 'NWS sent',
          pinPopupAdded: 'Added',
          pinPopupDescription: 'Description',
          pinPopupOtherAlerts: 'Other alerts at this location',
          saveBtn: 'Save weather',
          saveSuccess: 'Weather settings saved.',
          saveError: 'Could not save weather settings.',
        },
      },
      equipment: {
        title: 'Equipment',
          subtitle: 'Trucks, cars, heavy equipment, and everything else.',
          countTotal: '{{count}} total',
          addBtn: 'Add equipment',
          searchPlaceholder: 'Search by name, make, or plate...',
          emptyTitle: 'No equipment yet',
          emptyHint: 'Add your first piece of equipment to start tracking it.',
          unassignedBadge: 'Unassigned',
          paidOffBadge: 'Paid off',
          loanBadge: 'Loan',
          plateExpiresSoon: 'Plate expires in {{days}} days',
          plateExpired: 'Plate expired',
          mileageUnit: '{{n}} mi',
          addTitle: 'New equipment',
          editTitle: 'Edit equipment',
          basicInfoHeading: 'Basic info',
          registrationHeading: 'Registration & plate',
          ownershipHeading: 'Ownership',
          assignmentHeading: 'Assignment',
          photosHeading: 'Photos',
          nameLabel: 'Name',
          namePlaceholder: 'Truck #1, Skid Loader, etc.',
          typeLabel: 'Type',
          typePlaceholder: 'Truck, car, semi...',
          typeSuggestions: {
            truck: 'Truck',
            car: 'Car',
            van: 'Van',
            semi: 'Semi',
            trailer: 'Trailer',
            skidLoader: 'Skid loader',
            tractor: 'Tractor',
            generator: 'Generator',
            other: 'Other',
          },
          makeLabel: 'Make',
          makePlaceholder: 'Ford, Chevrolet, John Deere...',
          modelLabel: 'Model',
          modelPlaceholder: 'F-150, Silverado, S650...',
          yearLabel: 'Year',
          yearPlaceholder: '2024',
          colorLabel: 'Color',
          colorPlaceholder: 'White, black, red...',
          vinLabel: 'VIN',
          vinPlaceholder: '17 characters',
          mileageLabel: 'Mileage',
          mileagePlaceholder: '0',
          plateNumberLabel: 'Plate number',
          plateNumberPlaceholder: 'ABC-1234',
          plateExpirationLabel: 'Plate expiration',
          paidOffLabel: 'Paid off',
          loanLenderLabel: 'Lender',
          loanLenderPlaceholder: 'Bank, dealer, person...',
          assignedToLabel: 'Assigned to',
          assignedToNone: 'Unassigned',
          notesLabel: 'Notes',
          notesPlaceholder: 'Internal details, reminders...',
          photoEmpty: 'No photos yet. Add one to identify this equipment.',
          photoAddBtn: 'Add photo',
          photoTakeBtn: 'Take photo',
          photoLibraryBtn: 'Choose from library',
          photoUploading: 'Uploading...',
          photoUploadError: 'Could not upload photo.',
          photoDeleteConfirm: 'Delete this photo?',
          photoLimitHit: 'Maximum {{n}} photos per equipment.',
          saveSuccess: 'Equipment saved.',
          saveError: 'Could not save equipment.',
          deleteBtn: 'Delete equipment',
          deleteConfirmTitle: 'Delete equipment',
          deleteConfirmMsg: 'This cannot be undone. Continue?',
          nameRequiredError: 'Name is required.',
          assignedToSearch: 'Search employee...',
          selectNoResults: 'No results',
          scanVinHint: 'Point the camera at the VIN barcode',
          scanPermissionDenied: 'Allow camera access to scan.',
          valueLabel: 'Value',
          valuePlaceholder: '0',
          loanAmountLabel: 'Loan amount',
          loanAmountPlaceholder: '0',
          detailTitle: 'Equipment details',
          editBtn: 'Edit',
          createdLabel: 'Created',
          updatedLabel: 'Last edited',
          setCoverBtn: 'Use as cover',
          coverBadge: 'Cover',
          serialNumberLabel: 'Serial number',
          serialNumberPlaceholder: 'Serial number',
          insuranceHeading: 'Insurance',
          insuranceCarrierLabel: 'Carrier',
          insuranceCarrierPlaceholder: 'State Farm, Progressive...',
          insurancePolicyLabel: 'Policy number',
          insurancePolicyPlaceholder: 'Policy number',
          insuranceAgentLabel: 'Agent',
          insuranceAgentPlaceholder: 'Agent name',
          insuranceAgentPhoneLabel: 'Agent phone',
          insuranceAgentPhonePlaceholder: '(555) 123-4567',
          insuranceExpirationLabel: 'Insurance expiration',
          insuranceExpired: 'Insurance expired',
          insuranceExpiresSoon: 'Expires in {{days}}d',
          purchaseDateLabel: 'Purchase date',
          warrantyExpirationLabel: 'Warranty expiration',
          locationLabel: 'Location',
          locationPlaceholder: 'Shop, job site, storage...',
          groups: {
            button: 'Group',
            title: 'Group by',
            none: 'None',
            lead: 'Assigned lead',
            type: 'Type',
            property: 'Ownership',
            expiration: 'Plate expiration',
            unassigned: 'Unassigned',
            noType: 'No type',
            paid: 'Paid off',
            financed: 'Financed',
            expired: 'Expired plates',
            expiringSoon: 'Expiring soon',
            valid: 'Current',
            noPlate: 'No plate',
          },
          filters: {
            title: 'Quick filter',
            all: 'All',
            plateExpired: 'Plate expired',
            plateExpiring: 'Plate expiring soon',
            policyExpired: 'Policy expired',
            policyExpiring: 'Policy expiring soon',
          },
        },
      rentals: {
        title: 'Rental Properties',
        subtitle: 'Tenants, rent, leases, and maintenance.',
        saveError: 'Could not save. Please try again.',
        tabs: { overview: 'Overview', properties: 'Properties', tenants: 'Tenants' },
        propertiesCount: '{{count}} properties',
        searchPlaceholder: 'Search by name or address…',
        addProperty: 'Add property',
        editProperty: 'Edit property',
        deleteConfirmTitle: 'Delete property?',
        deleteConfirmBody: 'Its leases, charges, payments, expenses, and maintenance will also be deleted. This cannot be undone.',
        emptyTitle: 'No properties yet',
        emptyHint: 'Add your first property to start tracking rent and expenses.',
        propertyForm: {
          nameLabel: 'Name',
          namePlaceholder: '5th St House, North Duplex…',
          addressLabel: 'Address',
          cityLabel: 'City',
          stateLabel: 'State',
          zipLabel: 'ZIP code',
          typeLabel: 'Type',
          unitCountLabel: 'Number of units',
          unitCountHint: 'Units or rooms rented separately (e.g. 5 rooms = 5). Leave empty if rented as a whole.',
          purchaseDateLabel: 'Purchase date',
          purchasePriceLabel: 'Purchase price',
          notesLabel: 'Notes',
          statusLabel: 'Property status',
          branchLabel: 'Branch',
        },
        propertyTypes: { house: 'House', duplex: 'Duplex', apartment: 'Apartments', commercial: 'Commercial', land: 'Land', other: 'Other' },
        propertyStatus: { active: 'Active', inactive: 'Inactive' },
        photos: {
          heading: 'Photos',
          addBtn: 'Add',
          takePhoto: 'Take photo',
          chooseFromLibrary: 'Choose from library',
          uploading: 'Uploading…',
          limitHit: 'Maximum {{max}} photos per property.',
          deleteConfirm: 'Delete this photo?',
        },
        detailTabs: { overview: 'Overview', leases: 'Leases', ledger: 'Payments', expenses: 'Expenses', maintenance: 'Maintenance', photos: 'Photos' },
        tenants: {
          title: 'Tenants',
          addBtn: 'Add tenant',
          editTitle: 'Edit tenant',
          empty: 'No tenants yet.',
          deleteConfirmTitle: 'Delete tenant?',
          deleteConfirmBody: 'Their leases and payment history will also be deleted. This cannot be undone.',
          copyFromClient: 'Copy from client',
          activeLease: 'Active lease',
          form: {
            firstNameLabel: 'First name',
            lastNameLabel: 'Last name',
            phoneLabel: 'Phone',
            emailLabel: 'Email',
            emergencyNameLabel: 'Emergency contact',
            emergencyPhoneLabel: 'Emergency phone',
            emergencyRelationLabel: 'Relationship',
            emergencyRelationPlaceholder: 'Mother, spouse, friend…',
            notesLabel: 'Notes',
          },
        },
        leases: {
          title: 'Leases',
          addBtn: 'New lease',
          editTitle: 'Edit lease',
          empty: 'No leases on this property.',
          endBtn: 'End lease',
          renewBtn: 'Renew',
          renewTitle: 'Renew lease',
          endConfirmTitle: 'End lease?',
          endConfirmBody: 'The lease will be marked as ended and will no longer generate rent charges.',
          deleteConfirmTitle: 'Delete lease?',
          deleteConfirmBody: 'Its charges, payments, and documents will also be deleted. This cannot be undone.',
          monthToMonth: 'Month to month',
          endsInDays: 'Ends in {{days}} days',
          endedBadge: 'Ended',
          expiredBadge: 'Expired',
          form: {
            tenantLabel: 'Tenant',
            tenantPlaceholder: 'Select a tenant',
            unitLabel: 'Unit',
            unitPlaceholder: 'Apt 2, Unit B… (optional)',
            startLabel: 'Lease start',
            endLabel: 'Lease end',
            endHint: 'Leave empty for month to month.',
            rentLabel: 'Monthly rent',
            dueDayLabel: 'Due day',
            dueDayHint: 'Day of the month rent is due.',
            depositLabel: 'Deposit',
            notesLabel: 'Notes',
          },
          docs: {
            heading: 'Lease documents',
            addBtn: 'Upload document',
            empty: 'No documents. Upload the signed lease (PDF or photo).',
            uploading: 'Uploading…',
            tooLarge: 'File exceeds the 50 MB limit.',
            limitHit: 'Maximum {{max}} documents per lease.',
            deleteConfirm: 'Delete this document?',
          },
        },
        ledger: {
          title: 'Rent history',
          balanceLabel: 'Outstanding balance',
          depositLabel: 'Deposit',
          statusPaid: 'Paid',
          statusPartial: 'Partial',
          statusUnpaid: 'Due',
          statusLate: 'Late',
          daysLate: '{{days}} days late',
          recordPaymentBtn: 'Record payment',
          editChargeTitle: 'Edit charge',
          chargeAmountLabel: 'Charge amount',
          noCharges: 'No charges generated yet.',
          paidOfAmount: '{{paid}} of {{total}}',
        },
        payments: {
          recordTitle: 'Record payment',
          editTitle: 'Edit payment',
          amountLabel: 'Amount',
          fullAmountBtn: 'Full amount',
          methodLabel: 'Payment method',
          methodPlaceholder: 'Cash, Zelle, check #1024…',
          dateLabel: 'Payment date',
          photoLabel: 'Payment photo',
          addPhoto: 'Add photo (e.g. check)',
          changePhoto: 'Change',
          removePhoto: 'Remove',
          noteLabel: 'Note',
          recordBtn: 'Record payment',
          deleteConfirmTitle: 'Delete payment?',
          deleteConfirmBody: 'The amount will become due on the charge again.',
        },
        expenses: {
          title: 'Expenses',
          addBtn: 'Add expense',
          editTitle: 'Edit expense',
          empty: 'No expenses recorded.',
          totalLabel: 'Total',
          deleteConfirmTitle: 'Delete expense?',
          deleteConfirmBody: 'This cannot be undone.',
          fromMaintenance: 'From maintenance',
          form: {
            dateLabel: 'Date',
            amountLabel: 'Amount',
            categoryLabel: 'Category',
            vendorLabel: 'Vendor',
            vendorPlaceholder: 'García Plumbing, utility co…',
            noteLabel: 'Note',
            receiptLabel: 'Receipt',
            addReceipt: 'Add receipt photo',
            changeReceipt: 'Change',
            removeReceipt: 'Remove',
          },
          categories: {
            repairs: 'Repairs',
            utilities: 'Utilities',
            property_tax: 'Property tax',
            insurance: 'Insurance',
            mortgage: 'Mortgage',
            hoa: 'HOA',
            management: 'Management',
            other: 'Other',
          },
        },
        maintenance: {
          title: 'Maintenance',
          addBtn: 'Add',
          editTitle: 'Edit maintenance',
          empty: 'No maintenance records.',
          deleteConfirmTitle: 'Delete record?',
          deleteConfirmBody: 'This cannot be undone.',
          statusOpen: 'Open',
          statusInProgress: 'In progress',
          statusDone: 'Done',
          createExpenseToggle: 'Record as expense',
          createExpenseHint: 'When done, the cost is added to the property\'s expenses.',
          form: {
            titleLabel: 'Issue',
            titlePlaceholder: 'Bathroom leak, water heater…',
            descriptionLabel: 'Description',
            statusLabel: 'Status',
            reportedLabel: 'Reported on',
            completedLabel: 'Completed on',
            costLabel: 'Cost',
            fixedByLabel: 'Fixed by',
            fixedByPlaceholder: 'Name or company',
            employeeLabel: 'Employee',
          },
        },
        overview: {
          monthTitle: '{{month}} rent',
          collectedLabel: 'Collected',
          outstandingLabel: 'Outstanding',
          overdueLabel: 'Overdue',
          occupancyLabel: 'Occupancy',
          occupiedOf: '{{occupied}} of {{capacity}} units',
          incomeLabel: 'Income',
          expensesLabel: 'Expenses',
          netLabel: 'Net',
          noLeases: 'No active leases this month.',
          propertyColumn: 'Property',
          tenantColumn: 'Tenant',
          rentColumn: 'Rent',
          statusColumn: 'Status',
        },
      },
    },
    assistant: {
      title: 'Ami',
      subtitle: 'Your business assistant',
      placeholder: 'Message Ami…',
      send: 'Send',
      editingHint: 'Editing your message — Ami will reply again from here',
      listening: 'Listening…',
      micUnavailable: 'Dictation not available in this browser',
      thinking: 'Ami is thinking…',
      emptyTitle: "Hi! I'm Ami 👋",
      emptyState: 'Ask me about your business or tell me what to add.',
      suggestion1: 'What jobs did I add this week?',
      suggestion2: 'Who worked yesterday?',
      suggestion3: 'Add a new job for today',
      draftTitle: 'Job draft',
      updateTitle: 'Job update',
      updated: 'Job updated',
      timeLabel: 'Time',
      allDayLabel: 'All day',
      confirm: 'Confirm',
      confirming: 'Creating…',
      created: 'Job created',
      viewJob: 'View job',
      unresolvedClient: 'No client match',
      errorMsg: "Ami couldn't respond. Try again.",
      clientLabel: 'Client',
      dateLabel: 'Date',
      hoursLabel: 'Hours',
      crewLabel: 'Crew',
      leadBadge: 'Lead',
      driverLabel: 'Driver',
      notesLabel: 'Notes',
      newChat: 'New conversation',
      callButton: 'Talk to Ami',
      callListening: "I'm listening…",
      callThinking: 'Thinking…',
      callSpeaking: 'Speaking…',
      callInterrupt: 'Tap to interrupt',
      callThinkingHint: 'One moment — looking that up.',
      callConnecting: 'Connecting…',
      callEnd: 'End',
      callHint: 'Speak now — Ami is listening.',
      callMicDenied: 'Ami needs microphone permission for the call.',
    },
    crewFinder: {
      openButton: 'Suggest crew',
      title: 'Suggested crew',
      subtitle: 'Nearest and available first',
      distanceMi: '{{n}} mi',
      noLocation: 'No location',
      basisCurrentJob: 'On current job',
      basisJob: 'From their job',
      basisHome: 'From home',
      freeOnDate: 'Free this day',
      busyNextFree: 'Busy — free {{date}}',
      busyNoFree: 'Busy',
      nearbyNote: 'Nearby: {{miles}} mi on {{day}}',
      add: 'Add',
      added: 'Added',
      scheduleThatDay: 'Schedule {{day}}',
      geocoding: 'Locating employees…',
      needsAddresses: '{{n}} without address',
      targetNoCoords: 'This job has no location (add an address or client).',
      empty: 'No employees to suggest',
      offline: 'Offline — can\'t suggest',
      close: 'Close',
    },
    reports: {
      payroll: {
        title: 'Payroll',
        subtitle: 'Hours and pay per worker',
        entry: 'Payroll',
        freqLabel: 'Frequency',
        freqWeekly: 'Weekly',
        freqCustom: 'Custom',
        customDaysLabel: 'Days per period (e.g. 3)',
        settingsTitle: 'Payroll settings',
        componentsHeading: 'Pay components',
        otEnable: 'Pay overtime',
        otThresholdLabel: 'Regular hours per week',
        otMultiplierLabel: 'Multiplier (e.g. 1.5)',
        otEligibleHeading: 'Who gets overtime',
        otEligibleHint: 'Hourly workers only. Changes save instantly.',
        driverHeading: 'Driver pay',
        driverSame: 'Same rate',
        driverRate: 'Hourly rate',
        driverFlat: 'Flat per trip',
        driverRateLabel: 'Rate per driven hour ($)',
        driverFlatLabel: 'Amount per trip ($)',
        formulaHeading: 'Pay calculation',
        formulaStandardHint: 'Standard calculation: hours × rate, plus overtime and driver pay.',
        formulaCreate: 'Create custom formula',
        formulaRemove: 'Use standard calculation',
        formulaBuildHint: 'The formula computes gross pay for hourly workers. Tap a chip to remove it.',
        formulaEmpty: 'Tap variables, operators and numbers to build the formula.',
        formulaInvalid: 'Incomplete formula — check parentheses and operators.',
        formulaVarsHeading: 'Variables',
        formulaEmpFieldsHeading: 'Team fields',
        formulaJobFieldsHeading: 'Job fields',
        formulaJobFieldHint: 'Job fields are summed across each worker\'s jobs in the period.',
        formulaNumberPlaceholder: 'Number',
        formulaAddNumber: 'Add',
        formulaClear: 'Clear all',
        formulaVarNames: {
          pay_rate: 'Pay rate',
          worked_hours: 'Worked hours',
          driven_hours: 'Driven hours',
          total_hours: 'Total hours',
          normal_hours: 'Normal hours',
          overtime_hours: 'Overtime hours',
          normal_pay: 'Normal pay',
          overtime_pay: 'Overtime pay',
          driver_pay: 'Driver pay',
          standard_pay: 'Standard pay',
        },
        formulaVarDescs: {
          pay_rate: 'The worker\'s rate based on their pay type (hourly, daily or salary).',
          worked_hours: 'Work hours in the period: logged timesheets + total hours of jobs they\'re assigned to.',
          driven_hours: 'Driving hours in the period: driver hours of jobs where they\'re listed as a driver.',
          total_hours: 'Worked hours + driven hours.',
          normal_hours: 'Hours up to the overtime threshold (e.g. 40 per week, scaled to the period). If the worker doesn\'t have overtime enabled, this is all their hours.',
          overtime_hours: 'Hours above the threshold. 0 if the worker doesn\'t have overtime enabled.',
          normal_pay: 'Normal hours × rate. Excludes overtime and driver pay.',
          overtime_pay: 'Overtime hours × rate × multiplier (e.g. 1.5). 0 when it doesn\'t apply.',
          driver_pay: 'Driver pay per the chosen mode (rate per driven hour or amount per trip). 0 in "same rate" mode.',
          standard_pay: 'The full standard calculation: normal pay + overtime pay + driver pay.',
        },
        formulaEcfDesc: 'Uses this field\'s value from the worker\'s record.',
        formulaJcfDesc: 'Sums this field across the worker\'s jobs in the period.',
        formulaEcfMatchDesc: '1 if the worker\'s field has this answer, 0 otherwise.',
        formulaJcfCountDesc: 'Counts the worker\'s jobs in the period where this field has this answer.',
        historyTitle: 'Payment history',
        historyEmpty: 'No payments recorded yet. Mark someone as paid and it will be saved here.',
        historyBonus: 'Bonus',
        historySearchPlaceholder: 'Search name, check or amount…',
        historyNoResults: 'No results for this search.',
        historyFrom: 'From',
        historyTo: 'To',
        historySelect: 'Select',
        historyCancelSelect: 'Cancel',
        historySelectedCount: '{{count}} selected',
        historyDeleteBtn: 'Delete',
        historyDeleteConfirm: 'Delete {{count}} payment(s) from history? This cannot be undone.',
        historyTotalLabel: 'Shown total',
        historyPaymentsCount: '{{count}} payments',
        historyPresets: {
          thisPeriod: 'This pay period',
          lastPeriod: 'Last pay period',
          thisWeek: 'This week',
          lastWeek: 'Last week',
          last2Weeks: 'Last 2 weeks',
          thisMonth: 'This month',
          lastMonth: 'Last month',
          thisYear: 'This year',
          lastYear: 'Last year',
        },
        amountLabel: 'Amount to pay',
        partialLabel: 'Partial',
        hoursCoveredLabel: 'Hours this payment covers',
        alreadyPaidLabel: 'Previous payments',
        paidSoFarLabel: 'Paid',
        paidTag: 'paid',
        paidDiffersNote: 'The amount paid does not match this period\'s calculation.',
        manualPayBtn: 'Record payment',
        manualWorkerLabel: 'Employee',
        manualSelectWorker: 'Select employee',
        manualPeriodLabel: 'Pay period',
        clearPaymentsLabel: 'Delete all payments',
        clearPaymentsConfirm: 'Delete all recorded payments for {{name}} in this period?',
        totalPending: 'Pending to pay',
        ofTotal: 'of {{total}}',
        bonusLabel: 'Bonus (optional)',
        loanTitle: 'Loan',
        loanOwed: 'owed',
        loanDeductLabel: 'Deduct from this check',
        loanNetToPay: 'Net to pay',
        loanNoteFromCheckNum: 'Deducted from check #{{n}}',
        loanNoteFromCheck: 'Deducted from check',
        loanNoteFromWire: 'Deducted from wire',
        loanNoteFromCash: 'Deducted from cash payment',
        addLoanBtn: 'Add loan',
        loanAmountPlaceholder: 'Loan amount',
        loanNotePlaceholder: 'Note (optional)',
        loanViewBtn: 'View loans',
        loanHistoryTitle: 'Loans',
        loanDateLabel: 'Date',
        loanGivenLabel: 'Loan',
        loanPaymentLabel: 'Payment',
        loanEmpty: 'No loan entries yet',
        loanDeleteConfirm: 'Delete this entry?',
        loanNewTitle: 'New loan',
        loanEditTitle: 'Edit entry',
        loanSaveBtn: 'Save',
        loanSearchPlaceholder: 'Search worker…',
        loanNoWorkerFound: 'No worker found',
        loanPickHint: 'Tap a worker to view or add a loan',
        recordPaymentBtn: 'Record payment',
        loanPaymentNewTitle: 'Record payment',
        loanPickTitle: 'Select worker',
        otShort: 'OT',
        driveShort: 'driving',
        freqBiweekly: 'Biweekly',
        freqMonthly: 'Monthly',
        anchorLabel: 'Pay start date',
        anchorHint: 'Pay periods are calculated from this date.',
        colWorker: 'Worker',
        colHours: 'Hours',
        colPay: 'Pay',
        totalHours: 'Total hours',
        totalPay: 'Total pay',
        paidSummary: '{{paid}} of {{total}} paid',
        markPaid: 'Mark paid',
        paidBadge: 'Paid',
        undo: 'Undo',
        methodHeading: 'Payment method',
        methodCash: 'Cash',
        methodCheck: 'Check',
        methodWire: 'Wire',
        checkNumberLabel: 'Check number',
        checkNumberPlaceholder: 'Optional',
        confirmBtn: 'Confirm',
        saveBtn: 'Save changes',
        removePayment: 'Remove payment',
        checkPrefix: 'Check #',
        empty: 'No workers with hours.',
        breakdownHours: 'Hours breakdown',
        hoursWorked: 'Worked',
        hoursDriven: 'Driven',
        hoursLogged: 'Logged',
        projectsHeading: 'Jobs',
        untitledJob: 'Untitled job',
        noBreakdown: 'No hours this period.',
      },
      title: 'Reports',
      subtitle: 'Analyze your business performance',
      ranges: {
        month: 'This month',
        last_month: 'Last month',
        quarter: 'Last 3 months',
        half: 'Last 6 months',
        year: 'This year',
        last_year: 'Last year',
        all: 'All time',
      },
      customRange: 'Custom',
      kpis: {
        revenueCollected: 'Billed & paid',
        pendingToCollect: 'Pending to collect',
        avgJobValue: 'Avg. job value',
        hoursLogged: 'Hours logged',
        paidInvoicesCountSingle: '{{count}} paid invoice',
        paidInvoicesCountPlural: '{{count}} paid invoices',
        noPaidInvoices: 'No paid invoices',
        overdueSuffix: '{{amount}} overdue',
        completedJobsCount: '{{count}} completed jobs',
        estPayrollSub: 'Est. payroll: {{amount}}',
        payroll: 'Estimated payroll',
        payrollWorkersSub: '{{count}} workers',
        grossMargin: 'Gross margin est.',
        grossMarginSub: '{{percent}}% margin',
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
      byLocation: {
        title: 'By location',
        jobs: 'jobs',
        unassigned: 'No location',
      },
      newClientsBlock: {
        newCount: 'new clients',
        totalAccumulated: '{{count}} total accumulated',
      },
      financial: {
        revenueCollected: 'Billed & paid',
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
    files: {
      title: 'Files',
      subtitle: 'Manuals and documents for your team',
      empty: 'No files yet',
      emptyHint: 'Ask your office to upload manuals and documents.',
      newCategory: 'New category',
      newSection: 'New section',
      addEntry: 'Add file',
      categoryNameLabel: 'Category name',
      categoryNamePlaceholder: 'e.g. Manuals, Safety, Contracts',
      sectionNameLabel: 'Section name',
      sectionNamePlaceholder: 'e.g. Tractors, Pumps',
      entryTitleLabel: 'Title',
      entryTitlePlaceholder: 'e.g. Operator manual',
      crewVisibleLabel: 'Visible to the team',
      crewVisibleHint: 'When off, only the office sees this category.',
      officeOnlyBadge: 'Office only',
      crewBadge: 'Team',
      kindFile: 'Upload file',
      kindLink: 'Paste link',
      uploadBtn: 'Upload',
      uploading: 'Uploading…',
      chooseFile: 'Choose file',
      linkUrlLabel: 'Link',
      linkUrlPlaceholder: 'https://… (Drive, Dropbox, YouTube)',
      linkBadge: 'Link',
      openBtn: 'Open',
      noSections: 'No sections yet',
      noEntries: 'No files yet',
      deleteCategoryConfirm: 'Delete this category and everything in it?',
      deleteSectionConfirm: 'Delete this section and its files?',
      deleteEntryConfirm: 'Delete this file?',
      tooBig: 'File exceeds the 50 MB limit. Use a link instead.',
      sectionsCount: '{{count}} sections',
      filesCount: '{{count}} files',
      selectedCount: '{{count}} selected',
      moveBtn: 'Move',
      moveTitle: 'Move to…',
      moveHere: 'Move here',
      moveFolderTitle: 'Move folder to…',
      moveHint: 'Tap a folder to move there · ›  to open it',
      itemsOne: '1 item',
      itemsMany: '{{count}} items',
      itemsEmpty: 'Empty',
      selectPrompt: 'Select files or folders to move',
      newFolder: 'New folder',
      folderNameLabel: 'Folder name',
      folderNamePlaceholder: 'e.g. Tractors, Corner, Manuals',
      deleteFolderConfirm: 'Delete this folder and everything in it?',
      emptyFolder: 'This folder is empty',
      visibilityLabel: 'Visibility',
      visInherit: 'Inherit',
    },
    dateLocale: 'en-US',
  },
};
