import { Locale } from '../locales';

export type ProposalDict = {
  notFound: string;
  notFoundSub: string;
  loadingLabel: string;
  defaultBizName: string;
  proposalLabel: string;
  client: string;
  noClient: string;
  preparedBy: string;
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
  // Client accept & sign / decline
  approveTitle: string;
  approveHint: string;
  nameLabel: string;
  namePlaceholder: string;
  signLabel: string;
  signHint: string;
  signDisclaimer: string;
  clearSignature: string;
  acceptButton: string;
  declineButton: string;
  declineConfirm: string;
  acceptedBanner: string;
  signatureTitle: string;
  signedByLine: string;
  declinedNotice: string;
  expiredNotice: string;
  missingFields: string;
  respondError: string;
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
    preparedBy: 'Preparado por',
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
    approveTitle: '¿Aprobar esta cotización?',
    approveHint: 'Escribe tu nombre y firma abajo para aceptarla. Tu firma quedará registrada como comprobante.',
    nameLabel: 'Nombre completo',
    namePlaceholder: 'Tu nombre',
    signLabel: 'Firma',
    signHint: 'Dibuja tu firma aquí',
    signDisclaimer: 'Al firmar, aceptas que esta firma electrónica tiene la misma validez legal y efecto vinculante que una firma manuscrita en papel.',
    clearSignature: 'Borrar',
    acceptButton: 'Aceptar y firmar',
    declineButton: 'Rechazar cotización',
    declineConfirm: '¿Seguro que deseas rechazar esta cotización?',
    acceptedBanner: 'Cotización aprobada',
    signatureTitle: 'Aprobación del cliente',
    signedByLine: 'Firmado por {{name}} el {{date}}',
    declinedNotice: 'Esta cotización fue rechazada.',
    expiredNotice: 'Esta cotización ha expirado. Contacta al negocio para solicitar una nueva.',
    missingFields: 'Escribe tu nombre y dibuja tu firma para aceptar.',
    respondError: 'No se pudo enviar tu respuesta. Intenta de nuevo.',
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
    preparedBy: 'Prepared by',
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
    approveTitle: 'Approve this estimate?',
    approveHint: 'Enter your name and sign below to accept it. Your signature is kept on record as proof.',
    nameLabel: 'Full name',
    namePlaceholder: 'Your name',
    signLabel: 'Signature',
    signHint: 'Draw your signature here',
    signDisclaimer: 'By signing, you agree that this electronic signature has the same legal validity and binding effect as a handwritten signature on paper.',
    clearSignature: 'Clear',
    acceptButton: 'Accept & sign',
    declineButton: 'Decline estimate',
    declineConfirm: 'Are you sure you want to decline this estimate?',
    acceptedBanner: 'Estimate approved',
    signatureTitle: 'Client approval',
    signedByLine: 'Signed by {{name}} on {{date}}',
    declinedNotice: 'This estimate was declined.',
    expiredNotice: 'This estimate has expired. Contact the business to request a new one.',
    missingFields: 'Enter your name and draw your signature to accept.',
    respondError: 'Your response could not be sent. Please try again.',
    dateLocale: 'en-US',
  },
};
