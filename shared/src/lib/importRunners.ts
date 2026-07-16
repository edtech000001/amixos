// Shared CSV import engine for jobs / invoices / employees. The wizard UI is
// per-platform (web components/dashboard/ImportModal.tsx, mobile
// components/ImportDataModal.tsx); the field catalog, template generation,
// row-mapping and insert logic live HERE so both platforms import
// identically. (The clients importer predates this and has its own pair of
// implementations.)

import { fetchAll } from './supabaseFetch';
import { employeeBreakdownInRange, getPayrollPeriod, normalizeFrequency, parsePayrollAnchor, type PayrollJob, type PayrollTimesheet } from './payroll';
import { fieldRefId, normalizeFormula } from './payrollFormula';
import { logAudit } from './audit';
import { invoiceDefaultLanguage } from './invoiceTemplate';
import { INVITABLE_ROLES, ROLE_LABELS } from './permissions';
import { computeTotals, type InvoiceLineItem } from './invoicing';
import {
  normalizeName,
  splitNames,
  matchEmployeeId,
  parseNum,
  parseDate,
  parseTime,
  parseTimestamp,
  parseJobStatus,
  parseLatLng,
  coordsFromMapLink,
  groupBy,
  type EmployeeLite,
} from './dataImport';

export type ImportMode = 'jobs' | 'invoices' | 'employees' | 'payroll' | 'equipment' | 'inventory';

export interface ImportFieldDef {
  key: string;
  es: string;
  en: string;
  required?: boolean;
  isCustom?: boolean;
  /** Accepted-values / behavior note shown under the field in the mapping UI. */
  hintEs?: string;
  hintEn?: string;
}

export interface ImportTemplateField {
  field_key: string;
  field_label: string;
  field_label_es?: string | null;
  field_label_en?: string | null;
  field_type?: string;
  field_options?: string[] | null;
}

export interface ImportFailedRow {
  label: string;
  reason: string;
  /** Index into ctx.rows of the row that failed — lets the wizard offer an
   *  edit-and-retry flow for that specific row. */
  rowIndex?: number;
}

export interface ImportResult {
  success: number;
  skipped: number;
  /** Existing rows whose custom fields were backfilled by a re-import. */
  updated?: number;
  failedRows: ImportFailedRow[];
  notes: string[];
}

export const JOB_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'external_ref',  es: 'Project ID', en: 'Project ID' },
  { key: 'title',         es: 'Nombre del proyecto', en: 'Project name', required: true },
  { key: 'client',        es: 'Cliente (nombre o empresa)', en: 'Client (name or company)',
    hintEs: 'Se busca entre tus clientes por nombre o empresa; si no existe, se crea automáticamente.',
    hintEn: 'Matched to your clients by name or company; auto-created if no match.' },
  { key: 'status',        es: 'Estado del trabajo', en: 'Job status',
    hintEs: 'Valores: propuesta, enviada, aceptada, agendado, en progreso, completado, facturado. Vacío = completado.',
    hintEn: 'Values: proposal, sent, accepted, scheduled, in progress, completed, invoiced. Blank = completed.' },
  { key: 'description',   es: 'Descripción', en: 'Description' },
  { key: 'lead_name',     es: 'Líder', en: 'Lead' },
  { key: 'scheduled_date',es: 'Fecha', en: 'Date' },
  { key: 'end_date',      es: 'Fecha de fin', en: 'End date' },
  { key: 'time_start',    es: 'Hora de inicio', en: 'Start time' },
  { key: 'time_end',      es: 'Hora de fin', en: 'End time' },
  { key: 'job_address',   es: 'Dirección', en: 'Address' },
  { key: 'job_city',      es: 'Ciudad', en: 'City' },
  { key: 'job_state',     es: 'Estado (dirección)', en: 'State' },
  { key: 'job_map_link',  es: 'Link de mapa', en: 'Map link' },
  { key: 'coordinates',   es: 'Coordenadas (lat, lng)', en: 'Coordinates (lat, lng)',
    hintEs: 'Formato: 41.2565, -95.9345. Vacío = se intenta extraer del link de mapa.',
    hintEn: 'Format: 41.2565, -95.9345. Blank = extracted from the map link if possible.' },
  { key: 'total_hours',   es: 'Total horas', en: 'Total hours' },
  { key: 'crew',          es: 'Trabajadores', en: 'Workers',
    hintEs: 'Nombres separados por comas — se vinculan al equipo por nombre.',
    hintEn: 'Comma-separated names — matched to your team by name.' },
  { key: 'driver',        es: 'Manejador(es)', en: 'Driver(s)' },
  { key: 'driver_hours',  es: 'Horas manejadas', en: 'Driver hours' },
  { key: 'worker_notes',  es: 'Notas de cuadrilla (visibles a trabajadores)', en: 'Crew notes (visible to workers)' },
  { key: 'internal_notes',es: 'Notas internas (solo oficina)', en: 'Internal notes (office only)' },
  // Photo file names (separated by ; or ,) — NOT uploaded here. They're
  // stored on the job as pending names; the "Subir fotos" import step then
  // bulk-matches dropped files against them (any naming scheme works since
  // the mapping lives in this column, not the file name).
  { key: 'photos',        es: 'Fotos (nombres de archivo)', en: 'Photos (file names)',
    hintEs: 'Nombres separados por ; — las fotos se suben después en el paso "Subir fotos".',
    hintEn: 'Names separated by ; — the photos upload later in the "Upload photos" step.' },
  // Pricing block — hidden when the business has the Materiales/Precios
  // section off (business.job_item_types_enabled === false), mirroring the
  // job form's showMaterials gate. Line items: repeat the same Project ID on
  // several rows and each row adds one line item to that job (same contract
  // as the invoices importer).
  { key: 'total_amount',  es: 'Total (monto $)', en: 'Total (amount $)' },
  { key: 'item_description', es: 'Línea (descripción)', en: 'Line item (description)' },
  { key: 'item_qty',      es: 'Línea (cantidad)', en: 'Line item (qty)' },
  { key: 'item_rate',     es: 'Línea (precio unitario)', en: 'Line item (unit price)' },
  { key: 'item_type',     es: 'Línea (tipo: labor/material/equipo/otro)', en: 'Line item (type: labor/material/equipment/other)',
    hintEs: 'Valores: mano de obra, material, equipo, otro. Vacío = otro.',
    hintEn: 'Values: labor, material, equipment, other. Blank = other.' },
  // Record-keeping columns from the source system — optional. created_by_email
  // matches a team member by email (their linked account becomes the job's
  // creator); blank/unmatched → the importing user. Timestamps: blank keeps
  // the DB defaults (now()); future in-app edits overwrite updated_at.
  { key: 'created_by_email', es: 'Agregado por (email)', en: 'Added by (email)',
    hintEs: 'Email de un miembro con cuenta vinculada; vacío o sin coincidencia = quien importa.',
    hintEn: 'Email of a member with a linked account; blank or no match = the importer.' },
  { key: 'created_at',    es: 'Agregado (fecha/hora)', en: 'Added (date/time)', hintEs: 'Vacío = fecha/hora actual.', hintEn: 'Blank = current date/time.' },
  { key: 'updated_at',    es: 'Última edición (fecha/hora)', en: 'Last edited (date/time)', hintEs: 'Vacío = fecha/hora actual.', hintEn: 'Blank = current date/time.' },
];

/** Keys hidden when the business has the pricing/items section disabled. */
const JOB_PRICING_KEYS = new Set(['total_amount', 'item_description', 'item_qty', 'item_rate', 'item_type']);

export const INVOICE_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'invoice_number',   es: 'Número de factura', en: 'Invoice number', required: true },
  { key: 'project_id',       es: 'Project ID (enlace al trabajo)', en: 'Project ID (links to job)',
    hintEs: 'Debe coincidir con el Project ID del CSV de trabajos para enlazar la línea a su trabajo.',
    hintEn: 'Must match the jobs CSV Project ID to link the line to its job.' },
  { key: 'line_description', es: 'Nombre del trabajo', en: 'Job name',
    hintEs: 'El nombre que muestra la línea. Vacío = se usa el nombre del trabajo enlazado por Project ID.',
    hintEn: 'The name shown on the line. Blank = the linked job\'s name (via Project ID) is used.' },
  { key: 'line_qty',         es: 'Cantidad', en: 'Quantity' },
  { key: 'line_rate',        es: 'Precio unitario', en: 'Unit price' },
  { key: 'customer_name',    es: 'Cliente (nombre)', en: 'Customer (name)' },
  { key: 'customer_company', es: 'Cliente (empresa)', en: 'Customer (company)' },
  // Only used when NO existing client matches the name/company — they fill
  // in the auto-created client record. Matching itself is by name/company.
  { key: 'customer_address', es: 'Dirección (solo clientes nuevos)', en: 'Address (new clients only)' },
  { key: 'customer_city',    es: 'Ciudad (solo clientes nuevos)', en: 'City (new clients only)' },
  { key: 'customer_state',   es: 'Estado (solo clientes nuevos)', en: 'State (new clients only)' },
  { key: 'customer_zip',     es: 'Código postal (solo clientes nuevos)', en: 'ZIP code (new clients only)' },
  { key: 'customer_phone',   es: 'Teléfono (solo clientes nuevos)', en: 'Phone (new clients only)' },
  { key: 'customer_email',   es: 'Email (solo clientes nuevos)', en: 'Email (new clients only)' },
  { key: 'issue_date',       es: 'Fecha de creación', en: 'Date created' },
  { key: 'due_date',         es: 'Fecha de vencimiento', en: 'Due date' },
  { key: 'status',           es: 'Estado (borrador/enviada/pagada)', en: 'Status (draft/sent/paid)',
    hintEs: 'Valores: borrador, enviada, pagada. Vacío u otro valor = enviada (no pagada).',
    hintEn: 'Values: draft, sent, paid. Blank or anything else = sent (unpaid).' },
  { key: 'tax_rate',         es: 'Impuesto (%)', en: 'Tax rate (%)' },
  { key: 'notes',            es: 'Notas de la factura', en: 'Invoice notes',
    hintEs: 'Texto libre que aparece en la factura. Tomado de la primera fila de la factura.',
    hintEn: 'Free text shown on the invoice. Taken from the invoice\'s first row.' },
  // Payment record — a payment date implies the invoice is paid even when the
  // status cell is blank. Method is free text (cash, check #, transfer…).
  { key: 'payment_method',   es: 'Método de pago', en: 'Payment method',
    hintEs: 'Texto libre: efectivo, cheque #1024, Zelle… No marca la factura como pagada por sí solo.',
    hintEn: 'Free text: cash, check #1024, Zelle… Does not mark the invoice paid by itself.' },
  { key: 'paid_date',        es: 'Fecha de pago (recibido)', en: 'Payment date (received)',
    hintEs: 'Con fecha aquí la factura se marca pagada aunque Estado esté vacío.',
    hintEn: 'A date here marks the invoice paid even if Status is blank.' },
  { key: 'created_at',       es: 'Agregado (fecha/hora)', en: 'Added (date/time)', hintEs: 'Vacío = fecha/hora actual.', hintEn: 'Blank = current date/time.' },
  { key: 'updated_at',       es: 'Última edición (fecha/hora)', en: 'Last edited (date/time)', hintEs: 'Vacío = fecha/hora actual.', hintEn: 'Blank = current date/time.' },
];

export const EMPLOYEE_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'first_name',  es: 'Nombre', en: 'First name', required: true },
  { key: 'last_name',   es: 'Apellido', en: 'Last name' },
  { key: 'check_name',  es: 'Nombre para el cheque', en: 'Check name' },
  { key: 'phone',       es: 'Teléfono', en: 'Phone' },
  { key: 'email',       es: 'Email', en: 'Email' },
  { key: 'access_role', es: 'Rol de acceso a la app (admin/manager/oficina/campo)', en: 'App access role (admin/manager/office/field)',
    hintEs: 'Valores: admin, manager, oficina, campo. Vacío = sin acceso a la app.',
    hintEn: 'Values: admin, manager, office, field. Blank = no app access.' },
  { key: 'pay_type',    es: 'Tipo de pago (por hora/salario/diario)', en: 'Pay type (hourly/salary/daily)',
    hintEs: 'Valores: por hora, salario, diario. Vacío = por hora.',
    hintEn: 'Values: hourly, salary, daily. Blank = hourly.' },
  { key: 'pay_rate',    es: 'Tarifa de pago', en: 'Pay rate' },
  { key: 'hire_date',   es: 'Fecha de contratación', en: 'Hire date' },
  { key: 'birthday',    es: 'Cumpleaños', en: 'Birthday' },
  { key: 'address',     es: 'Dirección', en: 'Address' },
  { key: 'city',        es: 'Ciudad', en: 'City' },
  { key: 'state',       es: 'Estado', en: 'State' },
  { key: 'zip_code',    es: 'Código postal', en: 'ZIP code' },
  { key: 'emergency_contact_name',  es: 'Contacto de emergencia (nombre)', en: 'Emergency contact (name)' },
  { key: 'emergency_contact_phone', es: 'Contacto de emergencia (teléfono)', en: 'Emergency contact (phone)' },
  // Optional source-system timestamps (employees updated_at needs migration 110).
  { key: 'created_at',              es: 'Agregado (fecha/hora)', en: 'Added (date/time)', hintEs: 'Vacío = fecha/hora actual.', hintEn: 'Blank = current date/time.' },
  { key: 'updated_at',              es: 'Última edición (fecha/hora)', en: 'Last edited (date/time)', hintEs: 'Vacío = fecha/hora actual.', hintEn: 'Blank = current date/time.' },
];

export interface ImportFieldOptions {
  /** jobs mode: business.job_item_types_enabled !== false — when false, the
   *  Materiales/Precios columns (total + line items) are omitted, mirroring
   *  the job form. */
  jobPricing?: boolean;
}

export const PAYROLL_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'worker',       es: 'Trabajador (nombre)', en: 'Worker (name)', required: true,
    hintEs: 'Se vincula a tu equipo por nombre — debe existir el empleado.',
    hintEn: 'Matched to your team by name — the employee must already exist.' },
  { key: 'paid_date',    es: 'Fecha de pago', en: 'Paid date', required: true,
    hintEs: 'El período de nómina se calcula con esta fecha y tu frecuencia de pago. Un renglón por trabajador por período.',
    hintEn: 'The pay period is derived from this date and your pay frequency. One row per worker per period.' },
  { key: 'period_start', es: 'Inicio del período', en: 'Period start',
    hintEs: 'Opcional — si lo incluyes, define el período en lugar de calcularlo con la fecha de pago.',
    hintEn: 'Optional — when included it defines the period instead of deriving it from the paid date.' },
  { key: 'hours',        es: 'Horas trabajadas', en: 'Worked hours' },
  { key: 'driver_hours', es: 'Horas manejadas', en: 'Driver hours' },
  { key: 'bonus',        es: 'Bono', en: 'Bonus' },
  { key: 'gross_pay',    es: 'Total pagado', en: 'Total paid', required: true },
  { key: 'method',       es: 'Método de pago', en: 'Payment method',
    hintEs: 'Valores: efectivo, cheque, transferencia. Vacío = efectivo.',
    hintEn: 'Values: cash, check, wire. Blank = cash.' },
  { key: 'check_number', es: 'Número de cheque', en: 'Check number' },
];

export const EQUIPMENT_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name',                    es: 'Nombre', en: 'Name', required: true },
  { key: 'equipment_type',          es: 'Tipo', en: 'Type' },
  { key: 'make',                    es: 'Marca', en: 'Make' },
  { key: 'model',                   es: 'Modelo', en: 'Model' },
  { key: 'year',                    es: 'Año', en: 'Year' },
  { key: 'color',                   es: 'Color', en: 'Color' },
  { key: 'vin',                     es: 'VIN', en: 'VIN' },
  { key: 'serial_number',           es: 'Número de serie', en: 'Serial number' },
  { key: 'mileage',                 es: 'Millas', en: 'Mileage' },
  { key: 'plate_number',            es: 'Placa', en: 'Plate number' },
  { key: 'plate_expiration',        es: 'Vencimiento de placa', en: 'Plate expiration' },
  { key: 'value',                   es: 'Valor ($)', en: 'Value ($)' },
  { key: 'paid_off',                es: 'Pagado (sí/no)', en: 'Paid off (yes/no)',
    hintEs: 'Valores: sí / no. Vacío = no.',
    hintEn: 'Values: yes / no. Blank = no.' },
  { key: 'loan_lender',             es: 'Prestamista', en: 'Lender' },
  { key: 'loan_amount',             es: 'Monto del préstamo ($)', en: 'Loan amount ($)' },
  { key: 'assigned_to',             es: 'Asignado a (nombre)', en: 'Assigned to (name)',
    hintEs: 'Se vincula a tu equipo por nombre.',
    hintEn: 'Matched to your team by name.' },
  { key: 'location',                es: 'Ubicación', en: 'Location' },
  { key: 'purchase_date',           es: 'Fecha de compra', en: 'Purchase date' },
  { key: 'insurance_carrier',       es: 'Aseguradora', en: 'Insurance carrier' },
  { key: 'insurance_policy_number', es: 'Número de póliza', en: 'Policy number' },
  { key: 'insurance_expiration',    es: 'Vencimiento del seguro', en: 'Insurance expiration' },
  { key: 'notes',                   es: 'Notas', en: 'Notes' },
];

export const INVENTORY_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'name',      es: 'Nombre', en: 'Name', required: true },
  { key: 'sku',       es: 'SKU / Código', en: 'SKU / Code' },
  { key: 'quantity',  es: 'Cantidad', en: 'Quantity' },
  { key: 'unit',      es: 'Unidad', en: 'Unit',
    hintEs: 'Ej.: unidad, caja, pies, libras. Vacío = unidad.',
    hintEn: 'E.g.: unit, box, feet, pounds. Blank = unit.' },
  { key: 'unit_cost', es: 'Costo unitario ($)', en: 'Unit cost ($)' },
  { key: 'category',  es: 'Categoría', en: 'Category' },
  { key: 'low_stock', es: 'Alerta de stock bajo', en: 'Low stock alert',
    hintEs: 'Cantidad mínima antes de avisar. Vacío = 0 (sin alerta).',
    hintEn: 'Minimum quantity before warning. Blank = 0 (no alert).' },
];

export function importFieldsFor(mode: ImportMode, opts: ImportFieldOptions = {}): ImportFieldDef[] {
  if (mode === 'employees') return EMPLOYEE_IMPORT_FIELDS;
  if (mode === 'invoices') return INVOICE_IMPORT_FIELDS;
  if (mode === 'payroll') return PAYROLL_IMPORT_FIELDS;
  if (mode === 'equipment') return EQUIPMENT_IMPORT_FIELDS;
  if (mode === 'inventory') return INVENTORY_IMPORT_FIELDS;
  return opts.jobPricing === false
    ? JOB_IMPORT_FIELDS.filter(f => !JOB_PRICING_KEYS.has(f.key))
    : JOB_IMPORT_FIELDS;
}

/**
 * Audit-trail row for one import run (migration 137) — the hub's "recent
 * imports" list. Best-effort: a logging failure never breaks the import.
 */
export async function logImportRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  businessId: string,
  mode: string,
  fileName: string | null,
  res: { success: number; skipped: number; updated?: number; failedRows?: unknown[] },
  userId?: string | null,
): Promise<void> {
  try {
    await supabase.from('import_logs').insert({
      business_id: businessId,
      mode,
      file_name: fileName,
      success: res.success,
      updated: res.updated ?? 0,
      skipped: res.skipped,
      failed: res.failedRows?.length ?? 0,
      created_by: userId ?? null,
    });
  } catch {
    /* best-effort */
  }
  // Mirror into the business activity log.
  void logAudit(supabase, businessId, 'import.completed', 'import', null, {
    mode,
    file: fileName,
    success: res.success,
    updated: res.updated ?? 0,
    skipped: res.skipped,
    failed: res.failedRows?.length ?? 0,
  });
}

/**
 * Payroll's extra import columns: one per job custom field the business's
 * PAY FORMULA reads (e.g. "Regresaron el mismo día?: No" — an overnight
 * count). Imported values land in payroll_payments.components so history
 * shows what each check paid for. No formula → no extra columns.
 */
export function formulaComponentTemplates(payrollConfig: unknown): ImportTemplateField[] {
  const formula = normalizeFormula((payrollConfig as { formula?: unknown } | null)?.formula);
  if (!formula) return [];
  const out: ImportTemplateField[] = [];
  const seen = new Set<string>();
  formula.forEach(tok => {
    if (tok.t !== 'jcf') return;
    const id = fieldRefId(tok);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ field_key: id, field_label: tok.label, field_type: 'number' });
  });
  return out;
}

/** Custom-field columns apply to jobs + employees (invoices have none).
 *  Payroll uses them too — one column per job field the PAY FORMULA reads
 *  (callers build those from payroll_config, not a template table). */
export function importModeUsesTemplates(mode: ImportMode): boolean {
  return mode === 'jobs' || mode === 'employees' || mode === 'payroll';
}

// Pipeline order — a status implies every earlier stage's timestamp, mirroring
// api/src/lib/assistant/draft.ts createStamps.
const JOB_STATUS_ORDER = ['proposal', 'sent', 'accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'];

/** Everything a runner needs; the wizard UI builds this after the map step. */
export interface ImportRunCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  businessId: string;
  userId: string | null;
  /** The importing user's login email — lets "Agregado por" match the owner
   *  even when they have no employee row. */
  userEmail?: string | null;
  locale: 'es' | 'en';
  rows: Record<string, string>[];
  /** field key → CSV header (from the mapping step). */
  colMap: Record<string, string>;
  templates: ImportTemplateField[];
  /** employees mode: per-business role renames. */
  accessRoles?: { key: string; name: string | null }[];
  /** Progress ticks for the wizard's bar: (done, total) row/group units. */
  onProgress?: (done: number, total: number) => void;
  /** Polled each row/group — return true to stop (partial results stand;
   *  dedupe makes a re-run resume where it left off). */
  shouldAbort?: () => boolean;
  /** invoices mode: businesses.invoice_template (picks es/en for new invoices). */
  invoiceTemplate?: unknown;
}

const trOf = (ctx: ImportRunCtx) => (es: string, en: string) => (ctx.locale === 'en' ? en : es);
const getOf = (ctx: ImportRunCtx) => (row: Record<string, string>, key: string) => {
  const col = ctx.colMap[key];
  return col && row[col] != null ? row[col].trim() : '';
};

// ── Client resolution (shared by jobs + invoices) ───────────────────────────
// Match by normalized "first last" or company against existing clients;
// auto-create on miss and remember it so repeated rows reuse the new client.
export async function createClientResolver(ctx: ImportRunCtx) {
  const clients = await fetchAll<{ id: string; first_name: string; last_name: string | null; company: string | null }>((from, to) =>
    ctx.supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', ctx.businessId).range(from, to));
  const index = new Map<string, string>();
  clients.forEach(c => {
    index.set(normalizeName(`${c.first_name} ${c.last_name ?? ''}`), c.id);
    if (c.company) index.set(normalizeName(c.company), c.id);
  });
  const autoCreated: string[] = [];

  const resolve = async (
    name: string,
    company: string,
    extras: Record<string, string | null> = {},
  ): Promise<string | null> => {
    const byName = name && index.get(normalizeName(name));
    if (byName) return byName;
    const byCompany = company && index.get(normalizeName(company));
    if (byCompany) return byCompany;
    if (!name && !company) return null;
    const parts = name.split(/\s+/);
    const first = parts[0] || company || '';
    const last = parts.slice(1).join(' ');
    const { data: created, error } = await ctx.supabase.from('clients').insert({
      business_id: ctx.businessId,
      first_name: first || (company || name),
      last_name: last,
      company: company || null,
      ...extras,
    }).select('id').single();
    if (error || !created) return null;
    if (name) index.set(normalizeName(name), created.id);
    if (company) index.set(normalizeName(company), created.id);
    autoCreated.push((name || company).trim());
    return created.id;
  };

  return { resolve, autoCreated };
}

function autoCreatedNote(ctx: ImportRunCtx, autoCreated: string[]): string {
  const tr = trOf(ctx);
  const shown = autoCreated.slice(0, 15).join(', ');
  return tr(
    `${autoCreated.length} cliente(s) creado(s) automáticamente: ${shown}${autoCreated.length > 15 ? '…' : ''}`,
    `${autoCreated.length} client(s) auto-created: ${shown}${autoCreated.length > 15 ? '…' : ''}`,
  );
}

// ── JOBS ────────────────────────────────────────────────────────────────────

/** Map a free-text line-item type to the form's categories; default 'other'. */
function parseItemType(raw: string): 'labor' | 'material' | 'equipment' | 'other' {
  const s = normalizeName(raw);
  if (s.includes('labor') || s.includes('mano')) return 'labor';
  if (s.includes('material')) return 'material';
  if (s.includes('equip')) return 'equipment';
  return 'other';
}

export async function runJobsImport(ctx: ImportRunCtx): Promise<ImportResult> {
  const tr = trOf(ctx);
  const get = getOf(ctx);
  const failedRows: ImportFailedRow[] = [];
  let success = 0, skipped = 0, updated = 0;

  const existingJobs = await fetchAll<{
    id: string; external_ref: string | null; custom_fields: Record<string, string> | null;
    scheduled_at: string | null; in_progress_at: string | null; completed_at: string | null; invoiced_at: string | null;
  }>((from, to) =>
    ctx.supabase.from('jobs').select('id, external_ref, custom_fields, scheduled_at, in_progress_at, completed_at, invoiced_at').eq('business_id', ctx.businessId).range(from, to));
  const existingRefs = new Set(existingJobs.map(j => j.external_ref).filter(Boolean) as string[]);
  const existingByRef = new Map(existingJobs.filter(j => j.external_ref).map(j => [j.external_ref as string, j]));
  const employees = await fetchAll<EmployeeLite & { email: string | null; user_id: string | null }>((from, to) =>
    ctx.supabase.from('employees').select('id, first_name, last_name, email, user_id').eq('business_id', ctx.businessId).range(from, to));
  // "Agregado por (email)" → the team member's linked account. Only people
  // with an app login can be a creator (created_by → auth.users): employees
  // with a linked account, plus the importing user's own login email (owners
  // often have no employee row).
  const creatorByEmail = new Map<string, string>();
  const employeeEmails = new Set<string>();
  employees.forEach(e => {
    if (!e.email) return;
    const em = e.email.trim().toLowerCase();
    employeeEmails.add(em);
    if (e.user_id) creatorByEmail.set(em, e.user_id);
  });
  if (ctx.userEmail && ctx.userId) creatorByEmail.set(ctx.userEmail.trim().toLowerCase(), ctx.userId);
  // Split the miss reasons: profile exists but no linked login vs. unknown email.
  const creatorsNoAccount = new Set<string>();
  const creatorsUnknown = new Set<string>();
  // Only pay for the client fetch when a client column is actually mapped.
  const clientResolver = ctx.colMap['client'] ? await createClientResolver(ctx) : null;

  // When line-item columns are mapped, rows sharing a Project ID collapse
  // into ONE job whose rows each contribute a line item (same contract as
  // the invoices importer). Otherwise: strict one-row-per-job, unchanged.
  const itemColsMapped = ['item_description', 'item_qty', 'item_rate', 'item_type'].some(k => ctx.colMap[k]);
  // Continuation rows: a row with NO title and NO Project ID but with line
  // content inherits the ref above it (spreadsheet style — the id is only on
  // each job's first row). Without this these rows fail "missing name".
  const refCol = ctx.colMap['external_ref'];
  let lastRef = '';
  const jobRows = ctx.rows.map(row => {
    const ref = get(row, 'external_ref');
    if (ref) { lastRef = ref; return row; }
    const hasItem = get(row, 'item_description') || get(row, 'item_qty') || get(row, 'item_rate');
    return itemColsMapped && !get(row, 'title') && hasItem && lastRef && refCol
      ? { ...row, [refCol]: lastRef }
      : row;
  });
  const groups = itemColsMapped
    ? groupBy(jobRows.map((row, idx) => ({ row, idx })), ({ row, idx }) => get(row, 'external_ref') || `__row_${idx}`)
    : jobRows.map((row, idx) => ({ key: '', rows: [{ row, idx }] }));

  let progressDone = 0;
  for (const grp of groups) {
    ctx.onProgress?.(progressDone++, groups.length);
    if (ctx.shouldAbort?.()) break;
    // Job-level fields come from the group's FIRST row.
    const { row, idx } = grp.rows[0];
    const csvLine = idx + 2;
    const title = get(row, 'title');
    const ref = get(row, 'external_ref');
    // Identify the row as richly as possible so a failure is findable in the
    // file: title/ref, else client + date, else the first non-empty cells.
    const ident =
      title || ref ||
      [get(row, 'client'), get(row, 'scheduled_date')].filter(Boolean).join(' · ') ||
      Object.entries(row)
        .filter(([, v]) => v && String(v).trim())
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v).trim()}`)
        .join(', ') ||
      tr('(fila vacía)', '(empty row)');
    const label = `${tr('Fila', 'Row')} ${csvLine} · ${ident}`;

    // Existing Project ID → UPDATE. Exactly the columns included in the file
    // (non-empty cells) overwrite the job; everything else — including photos
    // and invoice links — stays. A file with just Project ID + one column
    // touches only that column. Line items are never updated (invoices may
    // reference the amounts); the Total column can still overwrite the total.
    if (ref && existingRefs.has(ref)) {
      const existing = existingByRef.get(ref);
      if (!existing) { skipped++; continue; } // duplicate ref within this same file
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const up: any = {};
      if (title) up.title = title;
      const rawStatusUp = get(row, 'status');
      if (rawStatusUp) {
        const ps = parseJobStatus(rawStatusUp);
        if (ps === undefined || ps === null) {
          failedRows.push({
            label,
            reason: tr(
              `Estado no reconocido: "${rawStatusUp}". Válidos: propuesta, enviada, aceptada, agendado, en progreso, completado, facturado.`,
              `Unrecognized status: "${rawStatusUp}". Valid: proposal, sent, accepted, scheduled, in progress, completed, invoiced.`,
            ),
            rowIndex: idx,
          });
          continue;
        }
        up.status = ps;
        // Pipeline stamps: NEVER overwrite an existing stamp — a re-import
        // must not rewrite history. Only stages newly reached get stamped.
        const rankUp = JOB_STATUS_ORDER.indexOf(ps);
        const nowIsoUp = new Date().toISOString();
        if (rankUp >= JOB_STATUS_ORDER.indexOf('scheduled') && !existing.scheduled_at) up.scheduled_at = nowIsoUp;
        if (rankUp >= JOB_STATUS_ORDER.indexOf('in_progress') && !existing.in_progress_at) up.in_progress_at = nowIsoUp;
        if (rankUp >= JOB_STATUS_ORDER.indexOf('completed') && !existing.completed_at) up.completed_at = nowIsoUp;
        if (ps === 'invoiced' && !existing.invoiced_at) up.invoiced_at = nowIsoUp;
      }
      const clientCellUp = get(row, 'client');
      if (clientCellUp && clientResolver) {
        const cid = await clientResolver.resolve(clientCellUp, '');
        if (cid) up.client_id = cid;
      }
      if (get(row, 'description')) up.description = get(row, 'description');
      if (get(row, 'job_address')) up.job_address = get(row, 'job_address');
      if (get(row, 'job_city')) up.job_city = get(row, 'job_city');
      if (get(row, 'job_state')) up.job_state = get(row, 'job_state');
      const mapLinkUp = get(row, 'job_map_link');
      if (mapLinkUp) up.job_map_link = mapLinkUp;
      const coordsUp = parseLatLng(get(row, 'coordinates')) ?? (mapLinkUp ? coordsFromMapLink(mapLinkUp) : null);
      if (coordsUp) { up.job_lat = coordsUp.lat; up.job_lng = coordsUp.lng; }
      const schedUp = parseDate(get(row, 'scheduled_date'));
      if (schedUp) up.scheduled_date = schedUp;
      const endUp = parseDate(get(row, 'end_date'));
      if (endUp) up.end_date = endUp;
      const timeStartUp = parseTime(get(row, 'time_start'));
      if (timeStartUp) {
        up.time_start = timeStartUp;
        up.all_day = false;
        const timeEndUp = parseTime(get(row, 'time_end'));
        if (timeEndUp) up.time_end = timeEndUp;
      }
      if (get(row, 'total_hours')) { const n = parseNum(get(row, 'total_hours')); if (n !== null) up.total_hours = n; }
      if (get(row, 'driver_hours')) { const n = parseNum(get(row, 'driver_hours')); if (n !== null) up.driver_hours = n; }
      if (get(row, 'worker_notes')) up.worker_notes = get(row, 'worker_notes');
      if (get(row, 'internal_notes')) up.internal_notes = get(row, 'internal_notes');
      if (get(row, 'total_amount')) { const n = parseNum(get(row, 'total_amount')); if (n !== null) up.total_amount = n; }
      // People columns REPLACE the job's crew/drivers when included.
      const leadUp = get(row, 'lead_name');
      const crewUp = splitNames(get(row, 'crew'));
      if (leadUp || crewUp.length) up.crew_names = [...(leadUp ? [leadUp] : []), ...crewUp];
      const driversUp = splitNames(get(row, 'driver'));
      if (driversUp.length) {
        up.driver_names = driversUp;
        up.driver_employee_ids = driversUp.map(n => matchEmployeeId(n, employees)).filter(Boolean) as string[];
      }
      // Pending photo names re-seed the photo step; uploads dedupe by name.
      const photoNamesUp = Array.from(new Set(
        grp.rows.flatMap(({ row: r }) => get(r, 'photos').split(/[;,]/)).map(n => n.trim()).filter(Boolean),
      ));
      if (photoNamesUp.length) up.import_photo_names = photoNamesUp;
      // Custom fields merge — CSV wins per field, unmentioned fields survive.
      const cfUp: Record<string, string> = {};
      ctx.templates.forEach(t => { const v = get(row, `custom:${t.field_key}`); if (v) cfUp[t.field_key] = v; });
      if (Object.keys(cfUp).length) {
        const merged = { ...(existing.custom_fields ?? {}), ...cfUp };
        if (JSON.stringify(merged) !== JSON.stringify(existing.custom_fields ?? {})) up.custom_fields = merged;
        existing.custom_fields = merged;
      }

      if (!Object.keys(up).length) { skipped++; continue; }
      const { error: upErr } = await ctx.supabase.from('jobs').update(up).eq('id', existing.id);
      if (upErr) { failedRows.push({ label, reason: upErr.message, rowIndex: idx }); continue; }
      if (up.crew_names) {
        await ctx.supabase.from('job_assignments').delete().eq('job_id', existing.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignsUp: any[] = [];
        const seenUp = new Set<string>();
        (up.crew_names as string[]).forEach((name, i) => {
          const n2 = normalizeName(name);
          if (seenUp.has(n2)) return;
          seenUp.add(n2);
          assignsUp.push({ job_id: existing.id, employee_id: matchEmployeeId(name, employees), worker_name: name, is_lead: i === 0 && !!leadUp });
        });
        if (assignsUp.length) await ctx.supabase.from('job_assignments').insert(assignsUp);
      }
      updated++;
      continue;
    }
    if (!title) {
      failedRows.push({
        label,
        reason: ref
          ? tr('Falta el nombre del proyecto', 'Missing project name')
          : tr(
              'Sin Project ID la fila se trata como trabajo NUEVO y requiere al menos el nombre del proyecto',
              'Without a Project ID the row is treated as a NEW job and needs at least the project name',
            ),
        rowIndex: idx,
      });
      continue;
    }

    // Status: blank keeps the historical default (completed); an unrecognized
    // value fails the row rather than silently misclassifying it.
    const rawStatus = get(row, 'status');
    const parsedStatus = parseJobStatus(rawStatus);
    if (parsedStatus === undefined) {
      failedRows.push({
        label,
        reason: tr(
          `Estado no reconocido: "${rawStatus}". Válidos: propuesta, enviada, aceptada, agendado, en progreso, completado, facturado.`,
          `Unrecognized status: "${rawStatus}". Valid: proposal, sent, accepted, scheduled, in progress, completed, invoiced.`,
        ),
        rowIndex: idx,
      });
      continue;
    }
    const status = parsedStatus ?? 'completed';
    const rank = JOB_STATUS_ORDER.indexOf(status);

    const clientCell = get(row, 'client');
    const clientId = clientCell && clientResolver ? await clientResolver.resolve(clientCell, '') : null;

    const leadName = get(row, 'lead_name');
    const crewNames = splitNames(get(row, 'crew'));
    const driverNames = splitNames(get(row, 'driver'));
    const allCrew = [...(leadName ? [leadName] : []), ...crewNames];

    const customFields: Record<string, string> = {};
    ctx.templates.forEach(t => { const v = get(row, `custom:${t.field_key}`); if (v) customFields[t.field_key] = v; });

    const scheduledDate = parseDate(get(row, 'scheduled_date'));
    const endDate = parseDate(get(row, 'end_date'));
    const timeStart = parseTime(get(row, 'time_start'));
    const timeEnd = parseTime(get(row, 'time_end'));
    const mapLink = get(row, 'job_map_link');
    // Coordinates drive the Map module pin. An explicit "lat, lng" column
    // wins; otherwise extract from the map link (same as the job form).
    const coords = parseLatLng(get(row, 'coordinates')) ?? coordsFromMapLink(mapLink);
    const nowIso = new Date().toISOString();
    const isCompleted = rank >= JOB_STATUS_ORDER.indexOf('completed');
    const createdTs = parseTimestamp(get(row, 'created_at'));
    const updatedTs = parseTimestamp(get(row, 'updated_at'));

    // Line items — one per row that has a description (form contract: a line
    // needs a description). Explicit total wins; else sum the items.
    const items = itemColsMapped
      ? grp.rows
          .map(({ row: r }) => {
            const desc = get(r, 'item_description');
            if (!desc) return null;
            return {
              item_type: parseItemType(get(r, 'item_type')),
              description: desc,
              quantity: parseNum(get(r, 'item_qty')) ?? 1,
              unit_price: parseNum(get(r, 'item_rate')) ?? 0,
            };
          })
          .filter((i): i is NonNullable<typeof i> => i !== null)
      : [];
    const itemsSubtotal = +items.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2);

    // Pending photo names — union across the group's rows, deduped. The
    // bulk photo step matches uploaded files against these and clears them.
    const photoNames = Array.from(new Set(
      grp.rows
        .flatMap(({ row: r }) => get(r, 'photos').split(/[;,]/))
        .map(n => n.trim())
        .filter(Boolean),
    ));

    // Creator: the "Agregado por (email)" match wins; otherwise the importer.
    const creatorEmail = get(row, 'created_by_email').toLowerCase();
    const createdBy = (creatorEmail && creatorByEmail.get(creatorEmail)) || ctx.userId;
    if (creatorEmail && !creatorByEmail.has(creatorEmail)) {
      (employeeEmails.has(creatorEmail) ? creatorsNoAccount : creatorsUnknown).add(creatorEmail);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry: any = {
      business_id: ctx.businessId,
      title,
      status,
      created_by: createdBy,
      external_ref: ref || null,
      client_id: clientId,
      description: get(row, 'description') || null,
      job_address: get(row, 'job_address') || null,
      job_city: get(row, 'job_city') || null,
      job_state: get(row, 'job_state') || null,
      job_map_link: mapLink || null,
      job_lat: coords?.lat ?? null,
      job_lng: coords?.lng ?? null,
      scheduled_date: scheduledDate,
      end_date: endDate,
      // A start time makes it a timed job; otherwise all-day (form behavior).
      all_day: !timeStart,
      time_start: timeStart,
      time_end: timeStart ? timeEnd : null,
      completed_date: isCompleted ? (endDate ?? scheduledDate) : null,
      total_hours: parseNum(get(row, 'total_hours')),
      driver_hours: parseNum(get(row, 'driver_hours')),
      worker_notes: get(row, 'worker_notes') || null,
      internal_notes: get(row, 'internal_notes') || null,
      total_amount: parseNum(get(row, 'total_amount')) ?? (items.length ? itemsSubtotal : 0),
      crew_names: allCrew,
      driver_names: driverNames,
      driver_employee_ids: driverNames.map(n => matchEmployeeId(n, employees)).filter(Boolean) as string[],
      // Only ACTIVE imported work goes to crews — historical completed/
      // invoiced imports (the bulk of a migration) would flood every field
      // worker's list. Proposals aren't crew-facing either.
      published_to_crew: status === 'scheduled' || status === 'in_progress',
      custom_fields: customFields,
      import_photo_names: photoNames.length ? photoNames : null,
      // Source-system record timestamps — only set when the CSV provides them
      // (blank keeps the now() defaults; updated_at trigger only fires on UPDATE).
      ...(createdTs ? { created_at: createdTs } : {}),
      ...(updatedTs ? { updated_at: updatedTs } : {}),
      // Pipeline stamps — mirror api/src/lib/assistant/draft.ts createStamps.
      ...(rank >= JOB_STATUS_ORDER.indexOf('scheduled') ? { scheduled_at: nowIso } : {}),
      ...(rank >= JOB_STATUS_ORDER.indexOf('in_progress') ? { in_progress_at: nowIso } : {}),
      ...(isCompleted ? { completed_at: nowIso } : {}),
      ...(status === 'invoiced' ? { invoiced_at: nowIso } : {}),
    };

    const { data: job, error } = await ctx.supabase.from('jobs').insert(entry).select('id').single();
    if (error || !job) { failedRows.push({ label, reason: error?.message ?? tr('No se pudo crear', 'Could not create'), rowIndex: idx }); continue; }
    if (ref) existingRefs.add(ref);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assigns: any[] = [];
    const seen = new Set<string>();
    allCrew.forEach((name, i) => {
      const n = normalizeName(name);
      if (seen.has(n)) return;
      seen.add(n);
      assigns.push({ job_id: job.id, employee_id: matchEmployeeId(name, employees), worker_name: name, is_lead: i === 0 && !!leadName });
    });
    if (assigns.length) await ctx.supabase.from('job_assignments').insert(assigns);
    if (items.length) {
      await ctx.supabase.from('job_items').insert(items.map(i => ({ job_id: job.id, ...i })));
    }
    success++;
  }
  const notes: string[] = [];
  if (clientResolver?.autoCreated.length) notes.push(autoCreatedNote(ctx, clientResolver.autoCreated));
  if (creatorsNoAccount.size) {
    const shown = Array.from(creatorsNoAccount).slice(0, 10).join(', ');
    notes.push(tr(
      `"Agregado por": estos emails son de miembros SIN cuenta de la app todavía, y el creador debe ser una cuenta real — se usó tu usuario: ${shown}. Cuando acepten su invitación, los próximos imports sí los usarán.`,
      `"Added by": these emails belong to team members WITHOUT an app account yet, and the creator must be a real account — your user was used: ${shown}. Once they accept their invite, future imports will match them.`,
    ));
  }
  if (creatorsUnknown.size) {
    const shown = Array.from(creatorsUnknown).slice(0, 10).join(', ');
    notes.push(tr(
      `"Agregado por": estos emails no coinciden con ningún miembro del equipo (se usó tu usuario): ${shown}.`,
      `"Added by": these emails don't match any team member (your user was used): ${shown}.`,
    ));
  }
  ctx.onProgress?.(groups.length, groups.length);
  return { success, skipped, updated, failedRows, notes };
}

// ── EMPLOYEES ───────────────────────────────────────────────────────────────
export async function runEmployeesImport(ctx: ImportRunCtx): Promise<ImportResult> {
  const tr = trOf(ctx);
  const get = getOf(ctx);
  const failedRows: ImportFailedRow[] = [];
  let success = 0, skipped = 0;

  const existing = await fetchAll<EmployeeLite>((from, to) =>
    ctx.supabase.from('employees').select('id, first_name, last_name').eq('business_id', ctx.businessId).range(from, to));
  const existingNames = new Set(existing.map(e => normalizeName(`${e.first_name} ${e.last_name ?? ''}`)));

  const payType = (raw: string): string => {
    const s = normalizeName(raw);
    if (s.includes('salar')) return 'salary';
    if (s.includes('diar') || s.includes('dai') || s.includes('day')) return 'daily';
    return 'hourly';
  };

  // Planned app-access role (pre-selects the Invite dialog) — NOT access
  // itself (that needs an accepted invite). Accepts the role key, its built-in
  // label (es/en), OR a per-business rename. Unknown non-blank values are left
  // unstaged and reported. Only the 6 built-in roles exist today; fully custom
  // role names aren't a feature yet.
  const roleByLabel = new Map<string, string>();
  INVITABLE_ROLES.forEach(r => {
    roleByLabel.set(normalizeName(r), r);
    roleByLabel.set(normalizeName(ROLE_LABELS[r].es), r);
    roleByLabel.set(normalizeName(ROLE_LABELS[r].en), r);
  });
  (ctx.accessRoles ?? []).forEach(br => {
    if (br.name && (INVITABLE_ROLES as readonly string[]).includes(br.key)) roleByLabel.set(normalizeName(br.name), br.key);
  });
  const unknownRoles = new Set<string>();
  const accessRole = (raw: string): string | null => {
    const s = normalizeName(raw);
    if (!s) return null;
    if (roleByLabel.has(s)) return roleByLabel.get(s)!;
    // Loose fallbacks for common phrasings.
    if (s.includes('admin')) return 'admin';
    if (s.includes('manager') || s.includes('gerente') || s.includes('encargad')) return 'manager';
    if (s.includes('office') || s.includes('oficina')) return 'office';
    if (s.includes('field') || s.includes('campo')) return 'field';
    if (s.includes('viewer') || s.includes('lector')) return 'viewer';
    unknownRoles.add(raw.trim());
    return null;
  };

  for (let idx = 0; idx < ctx.rows.length; idx++) {
    ctx.onProgress?.(idx, ctx.rows.length);
    if (ctx.shouldAbort?.()) break;
    const row = ctx.rows[idx];
    const csvLine = idx + 2;
    const first = get(row, 'first_name');
    const last = get(row, 'last_name');
    const label = `${tr('Fila', 'Row')} ${csvLine} · ${[first, last].filter(Boolean).join(' ') || tr('(sin nombre)', '(no name)')}`;

    if (!first) { failedRows.push({ label, reason: tr('Falta el nombre', 'Missing first name'), rowIndex: idx }); continue; }
    const fullKey = normalizeName(`${first} ${last}`);
    if (existingNames.has(fullKey)) { skipped++; continue; }

    const customFields: Record<string, string> = {};
    ctx.templates.forEach(t => { const v = get(row, `custom:${t.field_key}`); if (v) customFields[t.field_key] = v; });

    const rawPayType = get(row, 'pay_type');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry: any = {
      business_id: ctx.businessId,
      first_name: first,
      last_name: last,
      check_name: get(row, 'check_name') || null,
      phone: get(row, 'phone') || null,
      email: get(row, 'email') || null,
      // employees.role stays the DB default ('worker') — cosmetic, not access.
      intended_access_role: accessRole(get(row, 'access_role')),
      pay_type: rawPayType ? payType(rawPayType) : 'hourly',
      pay_rate: parseNum(get(row, 'pay_rate')) ?? 0,
      hire_date: parseDate(get(row, 'hire_date')),
      birthday: parseDate(get(row, 'birthday')),
      address: get(row, 'address') || null,
      city: get(row, 'city') || null,
      state: get(row, 'state') || null,
      zip_code: get(row, 'zip_code') || null,
      emergency_contact_name: get(row, 'emergency_contact_name') || null,
      emergency_contact_phone: get(row, 'emergency_contact_phone') || null,
      custom_fields: customFields,
    };
    const empCreatedTs = parseTimestamp(get(row, 'created_at'));
    if (empCreatedTs) entry.created_at = empCreatedTs;
    const empUpdatedTs = parseTimestamp(get(row, 'updated_at'));
    if (empUpdatedTs) entry.updated_at = empUpdatedTs;

    const { error } = await ctx.supabase.from('employees').insert(entry);
    if (error) { failedRows.push({ label, reason: error.message, rowIndex: idx }); continue; }
    existingNames.add(fullKey);
    success++;
  }
  const notes: string[] = [];
  if (unknownRoles.size) {
    const shown = Array.from(unknownRoles).slice(0, 10).join(', ');
    notes.push(tr(
      `Rol de acceso no reconocido (se importó la persona, pero sin rol): ${shown}. Válidos: admin, manager, oficina, campo, lector.`,
      `Unrecognized access role (the person was imported, just without a role): ${shown}. Valid: admin, manager, office, field, viewer.`,
    ));
  }
  ctx.onProgress?.(ctx.rows.length, ctx.rows.length);
  return { success, skipped, failedRows, notes };
}

// ── INVOICES ────────────────────────────────────────────────────────────────
export async function runInvoicesImport(ctx: ImportRunCtx): Promise<ImportResult> {
  const tr = trOf(ctx);
  const get = getOf(ctx);
  const failedRows: ImportFailedRow[] = [];
  const notes: string[] = [];
  let success = 0, skipped = 0;

  const lang = invoiceDefaultLanguage(ctx.invoiceTemplate);

  const existingInv = await fetchAll<{ external_ref: string | null }>((from, to) =>
    ctx.supabase.from('invoices').select('external_ref').eq('business_id', ctx.businessId).range(from, to));
  const existingRefs = new Set(existingInv.map(i => i.external_ref).filter(Boolean) as string[]);

  const jobs = await fetchAll<{ id: string; external_ref: string | null; client_id: string | null; title: string | null }>((from, to) =>
    ctx.supabase.from('jobs').select('id, external_ref, client_id, title').eq('business_id', ctx.businessId).range(from, to));
  const jobByRef = new Map<string, { id: string; client_id: string | null; title: string | null }>();
  jobs.forEach(j => { if (j.external_ref) jobByRef.set(j.external_ref, { id: j.id, client_id: j.client_id, title: j.title }); });

  const { resolve, autoCreated } = await createClientResolver(ctx);
  const resolveClient = (row: Record<string, string>): Promise<string | null> =>
    resolve(get(row, 'customer_name'), get(row, 'customer_company'), {
      address: get(row, 'customer_address') || null,
      city: get(row, 'customer_city') || null,
      state: get(row, 'customer_state') || null,
      zip_code: get(row, 'customer_zip') || null,
      phone_cell: get(row, 'customer_phone') || null,
      email_office: get(row, 'customer_email') || null,
    });

  const statusOf = (raw: string): { status: string; sent_at: string | null; paid_at: string | null } => {
    const s = normalizeName(raw);
    const now = new Date().toISOString();
    if (s.includes('pag') || s.includes('paid')) return { status: 'paid', sent_at: now, paid_at: now };
    // Explicit draft is the only path to draft; everything else (incl. blank)
    // becomes 'sent' — these were issued invoices, and it keeps them
    // rebuild-safe (rebuild only touches drafts, whose jobs have no items).
    if (s === 'draft' || s.includes('borrador')) return { status: 'draft', sent_at: null, paid_at: null };
    return { status: 'sent', sent_at: now, paid_at: null };
  };

  // Spreadsheet exports usually carry the invoice number only on the FIRST
  // row of each invoice, leaving continuation rows blank. Forward-fill so
  // those rows join the invoice above — but only when the row actually has
  // line content, so stray empty rows don't inherit a number.
  const numCol = ctx.colMap['invoice_number'];
  let lastNum = '';
  const filledRows = ctx.rows.map(row => {
    const num = get(row, 'invoice_number');
    if (num) { lastNum = num; return row; }
    const hasLine = get(row, 'project_id') || get(row, 'line_description') || get(row, 'line_qty') || get(row, 'line_rate');
    return hasLine && lastNum && numCol ? { ...row, [numCol]: lastNum } : row;
  });

  const groups = groupBy(filledRows.map((row, idx) => ({ row, idx })), ({ row }) => get(row, 'invoice_number'));
  let unlinkedLines = 0;

  let progressDone = 0;
  for (const grp of groups) {
    ctx.onProgress?.(progressDone++, groups.length);
    if (ctx.shouldAbort?.()) break;
    const first = grp.rows[0];
    const csvLine = first.idx + 2;
    const num = grp.key;
    const label = `${tr('Factura', 'Invoice')} ${num || tr('(sin número)', '(no number)')} · ${tr('fila', 'row')} ${csvLine}`;

    if (!num) { failedRows.push({ label, reason: tr('Falta el número de factura', 'Missing invoice number'), rowIndex: first.idx }); continue; }
    if (existingRefs.has(num)) { skipped++; continue; }

    const clientId = await resolveClient(first.row);

    const lineItems: InvoiceLineItem[] = [];
    const linkedJobIds = new Set<string>();
    for (const { row } of grp.rows) {
      const projId = get(row, 'project_id');
      const job = projId ? jobByRef.get(projId) : undefined;
      if (projId && !job) unlinkedLines++;
      if (job) linkedJobIds.add(job.id);
      lineItems.push({
        description: get(row, 'line_description') || job?.title || `${tr('Factura', 'Invoice')} ${num}`,
        qty: parseNum(get(row, 'line_qty')) ?? 1,
        rate: parseNum(get(row, 'line_rate')) ?? 0,
        job_id: job?.id ?? null,
      });
    }

    // Tax: percentage from the CSV ("7.5" or "7.5%"); blank → 0.
    const taxRate = parseNum(get(first.row, 'tax_rate').replace('%', '')) ?? 0;
    const { subtotal, tax, total } = computeTotals(lineItems, taxRate, 0);
    const st = statusOf(get(first.row, 'status'));
    // Payment record: a real payment date beats the "now" stamp statusOf
    // fabricates, and its presence implies the invoice was paid even when
    // the status cell is blank.
    const paidTs = parseTimestamp(get(first.row, 'paid_date'));
    if (paidTs) {
      st.status = 'paid';
      st.paid_at = paidTs;
      st.sent_at = st.sent_at ?? paidTs;
    }
    const paymentMethod = get(first.row, 'payment_method');
    // Source-system record timestamps — only set when provided (blank keeps
    // the now() defaults; the updated_at trigger only fires on UPDATE).
    const invCreatedTs = parseTimestamp(get(first.row, 'created_at'));
    const invUpdatedTs = parseTimestamp(get(first.row, 'updated_at'));

    const { data: invoice, error } = await ctx.supabase.from('invoices').insert({
      business_id: ctx.businessId,
      client_id: clientId,
      invoice_number: num,
      external_ref: num,
      type: 'invoice',
      status: st.status,
      language: lang,
      issue_date: parseDate(get(first.row, 'issue_date')),
      due_date: parseDate(get(first.row, 'due_date')),
      sent_at: st.sent_at,
      paid_at: st.paid_at,
      payment_method: paymentMethod || null,
      line_items: lineItems,
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      discount: 0,
      total_amount: total,
      notes: get(first.row, 'notes') || null,
      ...(invCreatedTs ? { created_at: invCreatedTs } : {}),
      ...(invUpdatedTs ? { updated_at: invUpdatedTs } : {}),
    }).select('id').single();

    if (error || !invoice) { failedRows.push({ label, reason: error?.message ?? tr('No se pudo crear la factura', 'Could not create invoice'), rowIndex: first.idx }); continue; }
    existingRefs.add(num);
    success++;

    if (clientId) await ctx.supabase.from('invoice_clients').insert({ invoice_id: invoice.id, client_id: clientId });
    const jobIds = Array.from(linkedJobIds);
    if (jobIds.length) {
      await ctx.supabase.from('jobs').update({
        status: 'invoiced', invoice_id: invoice.id, invoiced_at: new Date().toISOString(),
        ...(clientId ? { client_id: clientId } : {}),
      }).in('id', jobIds);
    }
  }

  if (autoCreated.length) notes.push(autoCreatedNote(ctx, autoCreated));
  if (unlinkedLines) notes.push(tr(
    `${unlinkedLines} línea(s) sin Project ID coincidente — se guardaron en la factura pero sin trabajo vinculado.`,
    `${unlinkedLines} line(s) with no matching Project ID — kept on the invoice but not linked to a job.`,
  ));

  ctx.onProgress?.(groups.length, groups.length);
  return { success, skipped, failedRows, notes };
}

// ── Payroll history import ──────────────────────────────────────────────────

/** efectivo/cheque/transferencia (+ EN synonyms) → PayMethod. Blank → null
 *  (caller defaults to cash); unrecognized → undefined (row fails). */
function parsePayMethod(raw: string): 'cash' | 'check' | 'wire' | null | undefined {
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s) return null;
  if (['efectivo', 'cash'].includes(s)) return 'cash';
  if (['cheque', 'check'].includes(s)) return 'check';
  if (['transferencia', 'transfer', 'wire', 'deposito', 'deposit', 'ach', 'zelle'].includes(s)) return 'wire';
  return undefined;
}

/**
 * Historical pay records → payroll_payments (the permanent snapshots behind
 * the Payment history view). One row per worker per pay period. The period
 * comes from the "Period start" column when present, else it's derived from
 * the paid date + the business's pay frequency/anchor. Existing
 * (worker, period) records are never overwritten.
 */
export async function runPayrollImport(ctx: ImportRunCtx): Promise<ImportResult> {
  const tr = trOf(ctx);
  const get = getOf(ctx);
  const failedRows: ImportFailedRow[] = [];
  let success = 0, skipped = 0;

  const employees = await fetchAll<EmployeeLite>((from, to) =>
    ctx.supabase.from('employees').select('id, first_name, last_name, check_name').eq('business_id', ctx.businessId).range(from, to));
  const { data: biz } = await ctx.supabase
    .from('businesses').select('payroll_frequency, payroll_anchor_date, payroll_custom_days').eq('id', ctx.businessId).single();
  const freq = normalizeFrequency(biz?.payroll_frequency);
  const anchor = parsePayrollAnchor(biz?.payroll_anchor_date);
  // Dedupe key = one CHECK, not one period: (worker, period, check #, amount).
  // The ledger (126) allows several checks per worker per period — two rows
  // that are legitimately different checks must both import, while re-running
  // the same file stays idempotent.
  const checkKey = (emp: string | null, period: string | null, check: string | null, gross: unknown) =>
    `${emp}|${(period ?? '').slice(0, 10)}|${(check ?? '').trim()}|${Number(gross ?? 0).toFixed(2)}`;
  const existing = await fetchAll<{ employee_id: string | null; period_start: string | null; check_number: string | null; gross_pay: number | null }>((from, to) =>
    ctx.supabase.from('payroll_payments').select('employee_id, period_start, check_number, gross_pay').eq('business_id', ctx.businessId).range(from, to));
  const existingKeys = new Set(existing.map(e => checkKey(e.employee_id, e.period_start, e.check_number, e.gross_pay)));
  const autoCreatedWorkers: string[] = [];

  // Jobs + timesheets fetched ONCE — each imported payment gets a frozen
  // hours-breakdown snapshot for its period (mirrors live mark-paid, 136).
  const allJobs: PayrollJob[] = (await fetchAll<{
    id: string; title: string | null; scheduled_date: string | null; total_hours: number | null;
    driver_employee_ids: string[] | null; driver_hours: number | null;
    job_assignments: { employee_id: string | null }[];
  }>((from, to) =>
    ctx.supabase.from('jobs')
      .select('id, title, scheduled_date, total_hours, driver_employee_ids, driver_hours, job_assignments(employee_id)')
      .eq('business_id', ctx.businessId).not('scheduled_date', 'is', null).range(from, to)))
    .map(j => ({
      id: j.id,
      title: j.title,
      scheduled_date: j.scheduled_date,
      total_hours: j.total_hours,
      driver_employee_ids: j.driver_employee_ids,
      driver_hours: j.driver_hours,
      assignmentEmployeeIds: (j.job_assignments ?? []).map(a => a.employee_id).filter((x): x is string => !!x),
    }));
  const allTimesheets: PayrollTimesheet[] = await fetchAll<{ employee_id: string | null; hours_worked: number | null; work_date: string | null }>((from, to) =>
    ctx.supabase.from('timesheets').select('employee_id, hours_worked, work_date').eq('business_id', ctx.businessId).range(from, to));

  for (let idx = 0; idx < ctx.rows.length; idx++) {
    ctx.onProgress?.(idx, ctx.rows.length);
    if (ctx.shouldAbort?.()) break;
    const row = ctx.rows[idx];
    const workerName = get(row, 'worker');
    const label = `${tr('Fila', 'Row')} ${idx + 2} · ${workerName || get(row, 'paid_date') || tr('(fila vacía)', '(empty row)')}`;

    if (!workerName) { failedRows.push({ label, reason: tr('Falta el trabajador', 'Missing worker'), rowIndex: idx }); continue; }
    let empId = matchEmployeeId(workerName, employees);
    if (!empId) {
      // Ex-workers: auto-create as an INACTIVE team member so historical
      // payments keep a real record without cluttering the active roster.
      const parts = workerName.trim().split(/\s+/);
      const { data: created, error: createErr } = await ctx.supabase.from('employees').insert({
        business_id: ctx.businessId,
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || '',
        pay_type: 'hourly',
        pay_rate: 0,
        active: false,
      }).select('id, first_name, last_name').single();
      if (createErr || !created) {
        failedRows.push({ label, reason: createErr?.message ?? tr(`No se pudo crear a "${workerName}"`, `Could not create "${workerName}"`), rowIndex: idx });
        continue;
      }
      employees.push(created as EmployeeLite);
      autoCreatedWorkers.push(workerName);
      empId = created.id;
    }

    const paidDate = parseDate(get(row, 'paid_date'));
    const periodStartRaw = parseDate(get(row, 'period_start'));
    const refDate = periodStartRaw ?? paidDate;
    if (!refDate) { failedRows.push({ label, reason: tr('Falta la fecha de pago', 'Missing paid date'), rowIndex: idx }); continue; }
    const period = getPayrollPeriod(freq, new Date(`${refDate}T00:00:00`), 0, anchor, biz?.payroll_custom_days ?? null);

    const gross = parseNum(get(row, 'gross_pay'));
    if (gross === null) { failedRows.push({ label, reason: tr('Falta el total pagado', 'Missing total paid'), rowIndex: idx }); continue; }
    const key = checkKey(empId, period.startStr, get(row, 'check_number') || null, gross);
    if (existingKeys.has(key)) { skipped++; continue; }
    const method = parsePayMethod(get(row, 'method'));
    if (method === undefined) {
      failedRows.push({ label, reason: tr(`Método no reconocido: "${get(row, 'method')}". Válidos: efectivo, cheque, transferencia.`, `Unrecognized method: "${get(row, 'method')}". Valid: cash, check, wire.`), rowIndex: idx });
      continue;
    }

    // Formula-component columns (one per job field the pay formula reads,
    // e.g. an overnight-stay count) → the per-payment components snapshot.
    const components: Record<string, number> = {};
    ctx.templates.forEach(tpl => {
      const v = parseNum(get(row, `custom:${tpl.field_key}`));
      if (v !== null) components[tpl.field_label] = v;
    });

    const { error } = await ctx.supabase.from('payroll_payments').insert({
      business_id: ctx.businessId,
      employee_id: empId,
      period_start: period.startStr,
      period_end: period.endStr,
      hours: parseNum(get(row, 'hours')) ?? 0,
      driver_hours: parseNum(get(row, 'driver_hours')),
      bonus: parseNum(get(row, 'bonus')),
      gross_pay: gross,
      method: method ?? 'cash',
      check_number: get(row, 'check_number') || null,
      components: Object.keys(components).length ? components : null,
      // Frozen breakdown snapshot (same as live mark-paid).
      breakdown: employeeBreakdownInRange({
        employeeId: empId,
        timesheets: allTimesheets,
        jobs: allJobs,
        startStr: period.startStr,
        endStr: period.endStr,
      }),
      created_by: ctx.userId,
      // The paid date becomes the record's timestamp so history shows it.
      ...(paidDate ? { created_at: `${paidDate}T12:00:00` } : {}),
    });
    if (error) { failedRows.push({ label, reason: error.message, rowIndex: idx }); continue; }
    existingKeys.add(key);
    success++;
  }

  const notes: string[] = [];
  if (autoCreatedWorkers.length) {
    const shown = autoCreatedWorkers.slice(0, 15).join(', ');
    notes.push(tr(
      `${autoCreatedWorkers.length} trabajador(es) creado(s) como INACTIVOS: ${shown}${autoCreatedWorkers.length > 15 ? '…' : ''}. Actívalos en Equipo si vuelven.`,
      `${autoCreatedWorkers.length} worker(s) created as INACTIVE: ${shown}${autoCreatedWorkers.length > 15 ? '…' : ''}. Reactivate them in Team if they return.`,
    ));
  }
  ctx.onProgress?.(ctx.rows.length, ctx.rows.length);
  return { success, skipped, failedRows, notes };
}

// ── Equipment import ─────────────────────────────────────────────────────────

/** sí/yes/true → true; anything else (incl. blank) → false. */
function parseYesNo(raw: string): boolean {
  const s = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ['si', 'yes', 'true', '1', 'x'].includes(s);
}

const parseInt10 = (raw: string): number | null => {
  const n = parseNum(raw);
  return n === null ? null : Math.round(n);
};

/** Vehicles/machines → equipment. Deduped by name (case/accent-insensitive). */
export async function runEquipmentImport(ctx: ImportRunCtx): Promise<ImportResult> {
  const tr = trOf(ctx);
  const get = getOf(ctx);
  const failedRows: ImportFailedRow[] = [];
  let success = 0, skipped = 0;

  const existing = await fetchAll<{ name: string }>((from, to) =>
    ctx.supabase.from('equipment').select('name').eq('business_id', ctx.businessId).range(from, to));
  const existingNames = new Set(existing.map(e => normalizeName(e.name)));
  const employees = await fetchAll<EmployeeLite>((from, to) =>
    ctx.supabase.from('employees').select('id, first_name, last_name').eq('business_id', ctx.businessId).range(from, to));

  for (let idx = 0; idx < ctx.rows.length; idx++) {
    ctx.onProgress?.(idx, ctx.rows.length);
    if (ctx.shouldAbort?.()) break;
    const row = ctx.rows[idx];
    const name = get(row, 'name');
    const label = `${tr('Fila', 'Row')} ${idx + 2} · ${name || tr('(fila vacía)', '(empty row)')}`;
    if (!name) { failedRows.push({ label, reason: tr('Falta el nombre', 'Missing name'), rowIndex: idx }); continue; }
    if (existingNames.has(normalizeName(name))) { skipped++; continue; }

    const paidOff = parseYesNo(get(row, 'paid_off'));
    const assignedName = get(row, 'assigned_to');
    const { error } = await ctx.supabase.from('equipment').insert({
      business_id: ctx.businessId,
      name,
      equipment_type: get(row, 'equipment_type') || null,
      make: get(row, 'make') || null,
      model: get(row, 'model') || null,
      year: parseInt10(get(row, 'year')),
      color: get(row, 'color') || null,
      vin: get(row, 'vin') || null,
      serial_number: get(row, 'serial_number') || null,
      mileage: parseInt10(get(row, 'mileage')),
      plate_number: get(row, 'plate_number') || null,
      plate_expiration: parseDate(get(row, 'plate_expiration')),
      value: parseNum(get(row, 'value')),
      paid_off: paidOff,
      loan_lender: paidOff ? null : (get(row, 'loan_lender') || null),
      loan_amount: paidOff ? null : parseNum(get(row, 'loan_amount')),
      assigned_employee_id: assignedName ? matchEmployeeId(assignedName, employees) : null,
      location: get(row, 'location') || null,
      purchase_date: parseDate(get(row, 'purchase_date')),
      insurance_carrier: get(row, 'insurance_carrier') || null,
      insurance_policy_number: get(row, 'insurance_policy_number') || null,
      insurance_expiration: parseDate(get(row, 'insurance_expiration')),
      notes: get(row, 'notes') || null,
      created_by: ctx.userId,
    });
    if (error) { failedRows.push({ label, reason: error.message, rowIndex: idx }); continue; }
    existingNames.add(normalizeName(name));
    success++;
  }

  ctx.onProgress?.(ctx.rows.length, ctx.rows.length);
  return { success, skipped, failedRows, notes: [] };
}

// ── Inventory import ─────────────────────────────────────────────────────────

/** Materials/stock → inventory_items. Deduped by SKU when present, else name. */
export async function runInventoryImport(ctx: ImportRunCtx): Promise<ImportResult> {
  const tr = trOf(ctx);
  const get = getOf(ctx);
  const failedRows: ImportFailedRow[] = [];
  let success = 0, skipped = 0;

  const existing = await fetchAll<{ name: string; sku: string | null }>((from, to) =>
    ctx.supabase.from('inventory_items').select('name, sku').eq('business_id', ctx.businessId).range(from, to));
  const existingNames = new Set(existing.map(e => normalizeName(e.name)));
  const existingSkus = new Set(existing.map(e => (e.sku ?? '').trim().toLowerCase()).filter(Boolean));

  for (let idx = 0; idx < ctx.rows.length; idx++) {
    ctx.onProgress?.(idx, ctx.rows.length);
    if (ctx.shouldAbort?.()) break;
    const row = ctx.rows[idx];
    const name = get(row, 'name');
    const sku = get(row, 'sku');
    const label = `${tr('Fila', 'Row')} ${idx + 2} · ${name || sku || tr('(fila vacía)', '(empty row)')}`;
    if (!name) { failedRows.push({ label, reason: tr('Falta el nombre', 'Missing name'), rowIndex: idx }); continue; }
    if ((sku && existingSkus.has(sku.toLowerCase())) || existingNames.has(normalizeName(name))) { skipped++; continue; }

    const { error } = await ctx.supabase.from('inventory_items').insert({
      business_id: ctx.businessId,
      name,
      sku: sku || null,
      quantity: parseInt10(get(row, 'quantity')) ?? 0,
      unit: get(row, 'unit') || 'unidad',
      unit_cost: parseNum(get(row, 'unit_cost')) ?? 0,
      category: get(row, 'category') || null,
      low_stock_threshold: parseInt10(get(row, 'low_stock')) ?? 0,
    });
    if (error) { failedRows.push({ label, reason: error.message, rowIndex: idx }); continue; }
    existingNames.add(normalizeName(name));
    if (sku) existingSkus.add(sku.toLowerCase());
    success++;
  }

  ctx.onProgress?.(ctx.rows.length, ctx.rows.length);
  return { success, skipped, failedRows, notes: [] };
}

export function runImportFor(mode: ImportMode, ctx: ImportRunCtx): Promise<ImportResult> {
  switch (mode) {
    case 'jobs': return runJobsImport(ctx);
    case 'employees': return runEmployeesImport(ctx);
    case 'payroll': return runPayrollImport(ctx);
    case 'equipment': return runEquipmentImport(ctx);
    case 'inventory': return runInventoryImport(ctx);
    default: return runInvoicesImport(ctx);
  }
}

// ── Template CSV ────────────────────────────────────────────────────────────

function exampleRowFor(mode: ImportMode, en: boolean, templates: ImportTemplateField[], opts: ImportFieldOptions): string[] {
  const tplCells = templates.map(t => (t.field_type === 'select' && t.field_options?.length ? t.field_options[0] : ''));
  if (mode === 'jobs') {
    // Keyed so the row adapts when pricing columns are filtered out.
    const cell: Record<string, string> = {
      external_ref: 'Proyecto-001',
      title: en ? 'Job name' : 'Nombre del trabajo',
      client: en ? 'John Smith' : 'Juan Pérez',
      status: en ? 'completed' : 'completado',
      description: en ? 'Job description' : 'Descripción del trabajo',
      lead_name: en ? 'Lead name' : 'Nombre del líder',
      scheduled_date: '6/10/2026',
      end_date: '6/12/2026',
      time_start: '07:30',
      time_end: '15:00',
      job_address: '123 Main St',
      job_city: 'Omaha',
      job_state: 'NE',
      job_map_link: '',
      coordinates: '41.2565, -95.9345',
      total_hours: '10',
      crew: en ? 'Worker One,Worker Two' : 'Trabajador Uno,Trabajador Dos',
      driver: en ? 'Driver name' : 'Nombre del manejador',
      driver_hours: '5',
      worker_notes: en ? 'Notes' : 'Notas',
      internal_notes: '',
      photos: 'Proyecto-001.Foto 1.jpg; Proyecto-001.Foto 2.jpg',
      total_amount: '1297',
      item_description: en ? 'Tower work' : 'Trabajo de torre',
      item_qty: '1',
      item_rate: '1297',
      item_type: 'labor',
      created_by_email: 'oficina@empresa.com',
      created_at: '6/9/2026 8:00',
      updated_at: '6/12/2026 4:45 PM',
    };
    return [...importFieldsFor('jobs', opts).map(f => cell[f.key] ?? ''), ...tplCells];
  }
  if (mode === 'employees') {
    return [en ? 'First' : 'Nombre', en ? 'Last' : 'Apellido', en ? 'Full legal name' : 'Nombre legal completo', '555-1234', 'persona@email.com', 'office', en ? 'hourly' : 'por hora', '25', '6/1/2024', '1/15/1990', '123 Main St', 'Omaha', 'NE', '68102', en ? 'Contact name' : 'Nombre contacto', '555-5678', '6/1/2024 9:00', '6/12/2026 4:45 PM', ...tplCells];
  }
  if (mode === 'payroll') {
    return [en ? 'Worker One' : 'Trabajador Uno', '6/26/2026', '', '80', '5', '100', '1460', en ? 'check' : 'cheque', '1024', ...templates.map(() => '2')];
  }
  if (mode === 'equipment') {
    return ['Truck #1', en ? 'Truck' : 'Camioneta', 'Ford', 'F-350', '2019', en ? 'White' : 'Blanco', '1FT8W3BT5KED12345', '', '98500', 'ABC-1234', '3/1/2027', '42000', en ? 'no' : 'no', 'Wells Fargo', '18500', en ? 'Worker One' : 'Trabajador Uno', en ? 'Main yard' : 'Yarda principal', '5/15/2019', 'Progressive', 'POL-993312', '11/30/2026', ''];
  }
  if (mode === 'inventory') {
    return [en ? 'Galvanized wire' : 'Alambre galvanizado', 'ALM-12', '250', en ? 'feet' : 'pies', '0.85', en ? 'Materials' : 'Materiales', '50'];
  }
  return ['257556', 'Proyecto-001', en ? 'Tower work' : 'Trabajo de torre', '1', '2159.50', en ? 'Customer Name' : 'Nombre del cliente', '', 'Portis', 'Kansas', 'KS', '67474', '785-346-4400', 'cliente@email.com', '6/8/2026', '6/22/2026', en ? 'paid' : 'pagada', '7.5', en ? 'Thanks for your business' : 'Gracias por su preferencia', en ? 'Check #1024' : 'Cheque #1024', '6/25/2026', '6/8/2026 10:15', '6/25/2026 3:30 PM'];
}

/** Extra example rows (beyond exampleRowFor's first). Invoices show TWO
 *  invoices with TWO project lines each: the invoice number goes on the
 *  first row and continuation rows leave it blank (the importer forward-
 *  fills), so the multi-line structure is obvious in the template. */
function extraExampleRowsFor(mode: ImportMode, en: boolean): string[][] {
  if (mode !== 'invoices') return [];
  const blank = Array(17).fill('') as string[];
  return [
    ['', 'Proyecto-002', en ? 'Pivot teardown' : 'Desarmar pivote', '1', '850', ...blank],
    ['257557', 'Proyecto-003', en ? 'Tower repair' : 'Reparar torre', '2', '400', en ? 'Mary Jones' : 'María García', en ? 'ABC Irrigation' : 'Riegos ABC', '', '', '', '', '', '', '6/15/2026', '6/29/2026', en ? 'sent' : 'enviada', '0', '', '', '', '', ''],
    ['', 'Proyecto-004', en ? 'Hang tower' : 'Colgar torre', '1', '300', ...blank],
  ];
}

/** Build the downloadable template (header + one example row). Quotes cells
 *  with commas/quotes/newlines; leads with a BOM so Excel reads UTF-8. */
export function buildImportTemplateCsv(
  mode: ImportMode,
  locale: 'es' | 'en',
  templates: ImportTemplateField[],
  opts: ImportFieldOptions = {},
): { filename: string; csv: string } {
  const en = locale === 'en';
  const tpls = importModeUsesTemplates(mode) ? templates : [];
  const cols = [
    ...importFieldsFor(mode, opts).map(f => (en ? f.en : f.es)),
    ...tpls.map(t => t.field_label),
  ];
  const exampleRows = [exampleRowFor(mode, en, tpls, opts), ...extraExampleRowsFor(mode, en)];
  const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = '﻿' + [cols, ...exampleRows].map(r => r.map(csvCell).join(',')).join('\n');
  const names: Record<ImportMode, [string, string]> = {
    jobs: ['jobs-template.csv', 'plantilla-trabajos.csv'],
    employees: ['team-template.csv', 'plantilla-equipo.csv'],
    invoices: ['invoices-template.csv', 'plantilla-facturas.csv'],
    payroll: ['payroll-template.csv', 'plantilla-nomina.csv'],
    equipment: ['equipment-template.csv', 'plantilla-equipos.csv'],
    inventory: ['inventory-template.csv', 'plantilla-inventario.csv'],
  };
  const filename = names[mode][en ? 0 : 1];
  return { filename, csv };
}

/** Auto-map CSV headers → field keys by normalized name (matches the key and
 *  BOTH language labels, so an English CSV maps even in a Spanish app). */
export function autoMapHeaders(
  fields: { key: string; es: string; en: string }[],
  headers: string[],
): Record<string, string> {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const auto: Record<string, string> = {};
  fields.forEach(f => {
    const candidates = [norm(f.es), norm(f.en), norm(f.key.replace('custom:', ''))];
    const match = headers.find(h => {
      const hN = norm(h);
      return candidates.some(c => hN === c || hN.includes(c) || c.includes(hN));
    });
    if (match) auto[f.key] = match;
  });
  return auto;
}
