/** Bilingual labels for client-facing invoice documents. */

export type InvoiceLang = 'es' | 'en';

const labels = {
  // Section headers
  from:           { es: 'De',                    en: 'From' },
  billTo:         { es: 'Para',                  en: 'Bill To' },

  // Dates
  issueDate:      { es: 'Fecha de emisión',      en: 'Issue Date' },
  dueDate:        { es: 'Fecha de vencimiento',  en: 'Due Date' },
  expires:        { es: 'Vence',                 en: 'Due' },

  // Line items table
  item:           { es: 'Concepto',              en: 'Item' },
  qty:            { es: 'Cant.',                 en: 'Qty' },
  rate:           { es: 'Precio',                en: 'Rate' },
  total:          { es: 'Total',                 en: 'Total' },

  // Totals
  subtotal:       { es: 'Subtotal',              en: 'Subtotal' },
  tax:            { es: 'Impuesto',              en: 'Tax' },

  // Notes
  notes:          { es: 'Notas',                 en: 'Notes' },

  // Status badges (client-facing)
  draft:          { es: 'Borrador',              en: 'Draft' },
  sent:           { es: 'Enviada',               en: 'Sent' },
  paid:           { es: 'Pagada',                en: 'Paid' },
  overdue:        { es: 'Vencida',               en: 'Overdue' },
  cancelled:      { es: 'Cancelada',             en: 'Cancelled' },

  // Invoice title
  invoice:        { es: 'Factura',               en: 'Invoice' },
} as const;

export type InvoiceLabelKey = keyof typeof labels;

/** Get all labels for a given language. */
export function getInvoiceLabels(lang: InvoiceLang) {
  const result = {} as Record<InvoiceLabelKey, string>;
  for (const key in labels) {
    result[key as InvoiceLabelKey] = labels[key as InvoiceLabelKey][lang];
  }
  return result;
}

/** Get the date locale string for formatting. */
export function getDateLocale(lang: InvoiceLang) {
  return lang === 'es' ? 'es-MX' : 'en-US';
}
