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

import { resolveFieldLabel } from './fieldTemplates';

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
  field_label_es?: string | null;
  field_label_en?: string | null;
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

/** One CSV cell holding every contact person: `name|role|phone|email` rows
 *  joined by `;;`. parseClientContactsCell reverses it on import, so a client
 *  exported from one Amixos business drops cleanly into another. */
export function serializeClientContacts(contacts: ClientShareContact[]): string {
  return contacts
    .map(c => [c.name, c.role ?? '', c.phone ?? '', c.email ?? '']
      .map(x => x.replace(/\|/g, '/').replace(/;;/g, ';')).join('|'))
    .join(';;');
}

export function parseClientContactsCell(raw: string | null | undefined): ClientShareContact[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(';;')
    .map(part => {
      const [name = '', role = '', phone = '', email = ''] = part.split('|').map(x => x.trim());
      return { name, role: role || null, phone: phone || null, email: email || null };
    })
    .filter(c => c.name);
}

export function buildClientCsv(
  client: ClientShareData,
  labels: ClientFieldLabels,
  customTemplates: ClientFieldTemplateLite[],
  locale?: string,
  /** When provided, appends a "contact people" column (serialized) so the
   *  receiving business's import can recreate client_contacts rows. */
  contacts?: { list: ClientShareContact[]; label: string },
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
    add(locale ? resolveFieldLabel(tpl, locale) : tpl.field_label, custom[tpl.field_key]);
  }
  if (contacts && contacts.list.length > 0) {
    add(contacts.label, serializeClientContacts(contacts.list));
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
  /** Invoice history — only rendered when includeAll. Caller pre-formats
   *  every cell (dates, money, localized status) so this stays dumb. */
  invoices?: Array<{ number: string; date: string; status: string; total: string }>;
  invoicesHeading?: string;
  invoicesTotalLabel?: string;
  invoicesTotalValue?: string;
  /** Footer stamp, e.g. "Generado el 16 de agosto de 2026". */
  generatedLine?: string;
}

export function buildClientHtml(
  client: ClientShareData,
  labels: ClientFieldLabels,
  customTemplates: ClientFieldTemplateLite[],
  options: BuildClientHtmlOptions,
  locale?: string,
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

  const cell = (label: string, value: string | null | undefined, wide = false): string => {
    if (!value || !String(value).trim()) return '';
    return `<div class="field${wide ? ' wide' : ''}">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(String(value))}</div>
    </div>`;
  };

  const fieldCells = [
    cell(labels.phone_cell, client.phone_cell),
    cell(labels.phone_office, client.phone_office),
    cell(labels.email_office, client.email_office),
    cell(labels.email_home, client.email_home),
    cell(labels.address, fullAddress || null, true),
    ...(options.includeAll
      ? [
          cell(labels.notes, client.notes, true),
          ...customTemplates.map(tpl =>
            cell(locale ? resolveFieldLabel(tpl, locale) : tpl.field_label, client.custom_fields?.[tpl.field_key])),
        ]
      : []),
  ].join('');

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
      <div class="contact-grid">${items}</div>
    `;
  }

  let invoicesBlock = '';
  if (options.includeAll && options.invoices && options.invoices.length > 0) {
    const rows = options.invoices
      .map(
        inv => `
        <tr>
          <td>${escapeHtml(inv.number)}</td>
          <td>${escapeHtml(inv.date)}</td>
          <td><span class="status-pill">${escapeHtml(inv.status)}</span></td>
          <td class="num">${escapeHtml(inv.total)}</td>
        </tr>`,
      )
      .join('');
    const totalRow = options.invoicesTotalLabel && options.invoicesTotalValue
      ? `<tr class="total-row"><td colspan="3">${escapeHtml(options.invoicesTotalLabel)}</td><td class="num">${escapeHtml(options.invoicesTotalValue)}</td></tr>`
      : '';
    invoicesBlock = `
      <h2 class="section-heading">${escapeHtml(options.invoicesHeading ?? 'Facturas')}</h2>
      <table class="invoices">
        <tbody>${rows}${totalRow}</tbody>
      </table>
    `;
  }

  const initials = (fullName || client.company || '?')
    .split(/\s+/).map(w => w.charAt(0)).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      font-size: 13px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 14px;
      padding: 16px 18px;
      margin-bottom: 20px;
    }
    .avatar {
      width: 52px; height: 52px; border-radius: 50%;
      background: #2563eb; color: #ffffff;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 700; flex: 0 0 auto;
    }
    .header h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .header .subtitle { margin: 2px 0 0; color: #4b5563; font-size: 13px; }
    .section-heading {
      margin: 22px 0 8px; font-size: 11px; font-weight: 700; color: #2563eb;
      text-transform: uppercase; letter-spacing: 0.08em;
      border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;
    }
    .field-grid { display: flex; flex-wrap: wrap; gap: 0; }
    .field {
      width: 50%; padding: 7px 12px 7px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .field.wide { width: 100%; }
    .field .label { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    .field .value { font-size: 13px; margin-top: 2px; white-space: pre-line; }
    .contact-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .contact-card {
      flex: 1 1 45%;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px 12px;
      background: #fafafa;
    }
    .contact-name { font-weight: 600; font-size: 13px; }
    .contact-role { color: #2563eb; font-size: 11px; margin-top: 1px; }
    .contact-line { font-size: 12px; margin-top: 2px; color: #374151; }
    table.invoices { width: 100%; border-collapse: collapse; }
    table.invoices td {
      padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #f3f4f6;
    }
    table.invoices td.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.invoices tr.total-row td { font-weight: 700; border-top: 2px solid #e5e7eb; border-bottom: none; }
    .status-pill {
      display: inline-block; background: #f3f4f6; border-radius: 999px;
      padding: 1px 8px; font-size: 10px; font-weight: 600; color: #374151;
    }
    .footer {
      margin-top: 30px; padding-top: 8px; border-top: 1px solid #e5e7eb;
      color: #9ca3af; font-size: 10px;
      display: flex; justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="avatar">${escapeHtml(initials)}</div>
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${client.company && fullName ? `<p class="subtitle">${escapeHtml(client.company)}</p>` : ''}
    </div>
  </div>
  <div class="field-grid">
    ${fieldCells}
  </div>
  ${contactsBlock}
  ${invoicesBlock}
  <div class="footer">
    <span>${options.generatedLine ? escapeHtml(options.generatedLine) : ''}</span>
    <span>Amixos</span>
  </div>
</body>
</html>`;
}
