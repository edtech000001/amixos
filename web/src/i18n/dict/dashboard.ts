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
    dateLocale: 'en-US',
  },
};
