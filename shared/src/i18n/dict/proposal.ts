import { Locale } from '../locales';

export type ProposalDict = {
  notFound: string;
  notFoundSub: string;
  loadingLabel: string;
  defaultBizName: string;
  proposalLabel: string;
  client: string;
  noClient: string;
  issueDate: string;
  validUntil: string;
  scheduledDate: string;
  description: string;
  services: string;
  noItems: string;
  colDescription: string;
  colQuantity: string;
  colUnitPrice: string;
  colTotal: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  termsTitle: string;
  printButton: string;
  // Locale-tag for date formatting (e.g. 'es-MX', 'en-US')
  dateLocale: string;
};

export const proposal: Record<Locale, ProposalDict> = {
  es: {
    notFound: 'Cotización no encontrada',
    notFoundSub: 'El enlace puede haber expirado o ser incorrecto.',
    loadingLabel: 'Cargando',
    defaultBizName: 'Empresa',
    proposalLabel: 'Cotización',
    client: 'Cliente',
    noClient: 'Sin cliente',
    issueDate: 'Fecha de emisión',
    validUntil: 'Válida hasta',
    scheduledDate: 'Inicio del proyecto',
    description: 'Descripción',
    services: 'Servicios',
    noItems: 'Sin ítems.',
    colDescription: 'Descripción',
    colQuantity: 'Cant.',
    colUnitPrice: 'Precio',
    colTotal: 'Total',
    subtotal: 'Subtotal',
    tax: 'Impuesto',
    discount: 'Descuento',
    total: 'Total',
    termsTitle: 'Términos y condiciones',
    printButton: 'Imprimir / Descargar PDF',
    dateLocale: 'es-MX',
  },
  en: {
    notFound: 'Estimate not found',
    notFoundSub: 'The link may have expired or be incorrect.',
    loadingLabel: 'Loading',
    defaultBizName: 'Business',
    proposalLabel: 'Estimate',
    client: 'Client',
    noClient: 'No client',
    issueDate: 'Issue date',
    validUntil: 'Valid until',
    scheduledDate: 'Project start',
    description: 'Description',
    services: 'Services',
    noItems: 'No items.',
    colDescription: 'Description',
    colQuantity: 'Qty',
    colUnitPrice: 'Price',
    colTotal: 'Total',
    subtotal: 'Subtotal',
    tax: 'Tax',
    discount: 'Discount',
    total: 'Total',
    termsTitle: 'Terms and conditions',
    printButton: 'Print / Download PDF',
    dateLocale: 'en-US',
  },
};
