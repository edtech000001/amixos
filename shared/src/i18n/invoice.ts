/** Bilingual labels for client-facing invoice documents.
 *
 * NOTE: each invoice has its own `language` field (es | en) independent of
 * the user's UI locale. A Spanish-speaking user can issue an English-language
 * invoice to an English-speaking client and vice versa.
 */

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

  // Custom fields
  customFields:   { es: 'Detalles adicionales',  en: 'Additional details' },

  // Status badges (client-facing)
  draft:          { es: 'Borrador',              en: 'Draft' },
  sent:           { es: 'Enviada',               en: 'Sent' },
  paid:           { es: 'Pagada',                en: 'Paid' },
  overdue:        { es: 'Vencida',               en: 'Overdue' },
  cancelled:      { es: 'Cancelada',             en: 'Cancelled' },

  // Invoice title
  invoice:        { es: 'Factura',               en: 'Invoice' },

  // Estimate / proposal mode (same theme engine, different labels)
  estimate:       { es: 'Presupuesto',           en: 'Estimate' },
  validUntil:     { es: 'Válido hasta',          en: 'Valid until' },
  description:    { es: 'Descripción',            en: 'Description' },
  terms:          { es: 'Términos y condiciones', en: 'Terms & Conditions' },
  preparedBy:     { es: 'Preparado por',          en: 'Prepared by' },
  approval:       { es: 'Aprobación',             en: 'Approval' },
} as const;

export type InvoiceLabelKey = keyof typeof labels;

export function getInvoiceLabels(lang: InvoiceLang) {
  const result = {} as Record<InvoiceLabelKey, string>;
  for (const key in labels) {
    result[key as InvoiceLabelKey] = labels[key as InvoiceLabelKey][lang];
  }
  return result;
}

export function getInvoiceDateLocale(lang: InvoiceLang) {
  return lang === 'es' ? 'es-MX' : 'en-US';
}
