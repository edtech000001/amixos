/**
 * Helpers for exporting a single client to share/print artifacts:
 *   - CSV: matches the import template's column layout exactly, so the
 *     recipient can drop it straight into Ajustes → Clientes → Importar
 *     without manual column mapping.
 *   - HTML: renders to PDF on mobile (via expo-print) and the browser
 *     print dialog on web (Save as PDF). Two density modes — basic
 *     contact info only, or everything including custom fields and the
 *     client's people.
 */

export interface ClientShareData {
  first_name: string;
  last_name: string;
  company: string | null;
  phone_cell: string | null;
  phone_office: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
}

export interface ClientShareContact {
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export interface ClientFieldTemplateLite {
  field_key: string;
  field_label: string;
}

// Field labels used in CSV headers and PDF table rows. Keys match the
// `ClientShareData` columns so the caller can build the map straight from
// their existing i18n field-label record.
export interface ClientFieldLabels {
  first_name: string;
  last_name: string;
  company: string;
  phone_cell: string;
  phone_office: string;
  email_office: string;
  email_home: string;
  address: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  notes: string;
}

// Wrap a CSV cell only when it contains a delimiter / quote / newline.
// Double internal quotes per RFC 4180.
function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildClientCsv(
  client: ClientShareData,
  labels: ClientFieldLabels,
  customTemplates: ClientFieldTemplateLite[],
): string {
  const headers: string[] = [];
  const values: string[] = [];

  const add = (label: string, value: string | null | undefined) => {
    headers.push(csvCell(label));
    values.push(csvCell((value ?? '').toString()));
  };

  add(labels.first_name, client.first_name);
  add(labels.last_name, client.last_name);
  add(labels.company, client.company);
  add(labels.phone_cell, client.phone_cell);
  add(labels.phone_office, client.phone_office);
  add(labels.email_office, client.email_office);
  add(labels.email_home, client.email_home);
  add(labels.address, client.address);
  add(labels.city, client.city);
  add(labels.state, client.state);
  add(labels.zip_code, client.zip_code);
  add(labels.notes, client.notes);

  const custom = client.custom_fields ?? {};
  for (const tpl of customTemplates) {
    add(tpl.field_label, custom[tpl.field_key]);
  }

  // Trailing newline keeps Excel happy.
  return `${headers.join(',')}\n${values.join(',')}\n`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface BuildClientHtmlOptions {
  /** If false, only name + company + phones + emails + address are
   *  included. If true, also notes, custom fields, and people. */
  includeAll: boolean;
  /** Optional people list — only rendered when includeAll. */
  contacts?: ClientShareContact[];
  /** Section heading for the contacts block (i18n). */
  contactsHeading?: string;
}

export function buildClientHtml(
  client: ClientShareData,
  labels: ClientFieldLabels,
  customTemplates: ClientFieldTemplateLite[],
  options: BuildClientHtmlOptions,
): string {
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim();
  const fullAddress = [
    client.address,
    client.address_line2,
    [client.city, client.state].filter(Boolean).join(', '),
    client.zip_code,
  ]
    .filter(Boolean)
    .join('\n');
  const title = fullName || client.company || 'Cliente';

  const row = (label: string, value: string | null | undefined): string => {
    if (!value || !String(value).trim()) return '';
    return `<tr>
      <td class="label">${escapeHtml(label)}</td>
      <td class="value">${escapeHtml(String(value)).replace(/\n/g, '<br>')}</td>
    </tr>`;
  };

  const basicRows = [
    row(labels.phone_cell, client.phone_cell),
    row(labels.phone_office, client.phone_office),
    row(labels.email_office, client.email_office),
    row(labels.email_home, client.email_home),
    row(labels.address, fullAddress || null),
  ].join('');

  let extraRows = '';
  if (options.includeAll) {
    extraRows = [
      row(labels.notes, client.notes),
      ...customTemplates.map(tpl => row(tpl.field_label, client.custom_fields?.[tpl.field_key])),
    ].join('');
  }

  let contactsBlock = '';
  if (options.includeAll && options.contacts && options.contacts.length > 0) {
    const items = options.contacts
      .map(
        c => `
        <div class="contact-card">
          <div class="contact-name">${escapeHtml(c.name)}</div>
          ${c.role ? `<div class="contact-role">${escapeHtml(c.role)}</div>` : ''}
          ${c.phone ? `<div class="contact-line">${escapeHtml(c.phone)}</div>` : ''}
          ${c.email ? `<div class="contact-line">${escapeHtml(c.email)}</div>` : ''}
        </div>`,
      )
      .join('');
    contactsBlock = `
      <h2 class="section-heading">${escapeHtml(options.contactsHeading ?? 'Personas de contacto')}</h2>
      ${items}
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 18mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1f2937;
      margin: 0;
      padding: 0;
    }
    .header {
      border-bottom: 2px solid #1f2937;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .header h1 { margin: 0; font-size: 26px; }
    .header .subtitle { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
    table.fields { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    table.fields td { padding: 7px 4px; vertical-align: top; border-bottom: 1px solid #e5e7eb; }
    table.fields td.label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; width: 30%; }
    table.fields td.value { font-size: 14px; }
    .section-heading { margin-top: 22px; font-size: 15px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; }
    .contact-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px 12px;
      margin-top: 8px;
    }
    .contact-name { font-weight: 600; font-size: 14px; }
    .contact-role { color: #6b7280; font-size: 12px; margin-top: 2px; }
    .contact-line { font-size: 13px; margin-top: 2px; }
    .footer {
      margin-top: 32px;
      color: #9ca3af;
      font-size: 11px;
      text-align: right;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    ${client.company && fullName ? `<p class="subtitle">${escapeHtml(client.company)}</p>` : ''}
  </div>
  <table class="fields">
    ${basicRows}
    ${extraRows}
  </table>
  ${contactsBlock}
  <div class="footer">Amixos</div>
</body>
</html>`;
}
