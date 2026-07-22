// Renders the "Send invoice" email from the business's custom templates
// (businesses.invoice_email_subject / invoice_email_body — Ajustes →
// Facturas → Email), falling back to the localized defaults when no template
// is saved. {{token}} placeholders accept Spanish AND English aliases so a
// Spanish-first owner can write {{numero}} while the docs/examples stay
// consistent either way.

export interface InvoiceEmailVars {
  number: string;
  link: string;
  /** Client full name. */
  client?: string;
  firstName?: string;
  lastName?: string;
  /** Client's company. */
  company?: string;
  /** The sending business's name. */
  business?: string;
  total?: string;
  dueDate?: string;
}

const ALIASES: Record<keyof InvoiceEmailVars, string[]> = {
  number: ['number', 'numero', 'número'],
  link: ['link', 'enlace'],
  client: ['client', 'cliente'],
  firstName: ['first_name', 'firstname', 'nombre'],
  lastName: ['last_name', 'lastname', 'apellido'],
  company: ['company', 'empresa', 'compania', 'compañía'],
  business: ['business', 'negocio'],
  total: ['total'],
  dueDate: ['due_date', 'duedate', 'vencimiento'],
};

/** Canonical token per variable, for the settings UI's clickable chips.
 *  Spanish/English forms are interchangeable at send time (see ALIASES). */
export const INVOICE_EMAIL_TOKENS: { key: keyof InvoiceEmailVars; es: string; en: string }[] = [
  { key: 'number', es: '{{numero}}', en: '{{number}}' },
  { key: 'link', es: '{{enlace}}', en: '{{link}}' },
  { key: 'client', es: '{{cliente}}', en: '{{client}}' },
  { key: 'firstName', es: '{{nombre}}', en: '{{first_name}}' },
  { key: 'lastName', es: '{{apellido}}', en: '{{last_name}}' },
  { key: 'company', es: '{{empresa}}', en: '{{company}}' },
  { key: 'business', es: '{{negocio}}', en: '{{business}}' },
  { key: 'total', es: '{{total}}', en: '{{total}}' },
  { key: 'dueDate', es: '{{vencimiento}}', en: '{{due_date}}' },
];

export function renderInvoiceEmail(opts: {
  /** businesses.invoice_email_subject — blank/null uses defaultSubject. */
  subjectTemplate?: string | null;
  /** businesses.invoice_email_body — blank/null uses defaultBody. */
  bodyTemplate?: string | null;
  defaultSubject: string;
  defaultBody: string;
  vars: InvoiceEmailVars;
}): { subject: string; body: string } {
  const fill = (tpl: string) => {
    let out = tpl;
    (Object.keys(ALIASES) as (keyof InvoiceEmailVars)[]).forEach(key => {
      const val = opts.vars[key] ?? '';
      ALIASES[key].forEach(alias => {
        out = out.split(`{{${alias}}}`).join(val);
      });
    });
    return out;
  };
  // When the delivery mode omits the link (PDF-only), drop any body line that
  // references the link token so the email doesn't show a dangling "view here:"
  // line with a blank underneath. Then collapse the extra blank line it leaves.
  const bodyTpl = opts.bodyTemplate?.trim() || opts.defaultBody;
  const linkEmpty = !(opts.vars.link ?? '').trim();
  const linkTokens = ALIASES.link.map(a => `{{${a}}}`);
  const bodyPrepared = linkEmpty
    ? bodyTpl
        .split('\n')
        .filter(line => !linkTokens.some(tok => line.includes(tok)))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
    : bodyTpl;
  return {
    subject: fill(opts.subjectTemplate?.trim() || opts.defaultSubject),
    body: fill(bodyPrepared),
  };
}
