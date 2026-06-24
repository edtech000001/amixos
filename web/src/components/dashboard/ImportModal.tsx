'use client';

// Legacy data import wizard (web-only) — bulk-load from CSV. Three modes:
//   - 'jobs'      → one row per project. Creates jobs (external_ref = old
//                   Project ID), crew assignments, and driver links.
//   - 'invoices'  → one row per LINE ITEM. Groups rows by invoice number,
//                   matches / auto-creates the client, and links each line to
//                   the job it came from via Project ID (jobs.external_ref).
//   - 'employees' → one row per person. Creates employees (deduped by name).
//
// Labels + UI text follow the app language (es/en) via useLang(). The exact
// header names in the user's file don't matter — the column-mapping step lets
// them map any header to a field, so a Spanish app + English CSV works fine.

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { invoiceDefaultLanguage } from '@amixos/shared/lib/invoiceTemplate';
import { INVITABLE_ROLES, ROLE_LABELS } from '@amixos/shared/lib/permissions';
import { computeTotals, type InvoiceLineItem } from '@amixos/shared/lib/invoicing';
import {
  normalizeName,
  splitNames,
  matchEmployeeId,
  parseNum,
  parseDate,
  groupBy,
  type EmployeeLite,
} from '@amixos/shared/lib/dataImport';

type Mode = 'jobs' | 'invoices' | 'employees';

interface FieldDef {
  key: string;
  es: string;
  en: string;
  required?: boolean;
  isCustom?: boolean;
}

const JOB_FIELDS: FieldDef[] = [
  { key: 'external_ref',  es: 'Project ID (ID de AppSheet)', en: 'Project ID (from AppSheet)' },
  { key: 'title',         es: 'Nombre del proyecto', en: 'Project name', required: true },
  { key: 'lead_name',     es: 'Líder', en: 'Lead' },
  { key: 'scheduled_date',es: 'Fecha', en: 'Date' },
  { key: 'total_hours',   es: 'Total horas', en: 'Total hours' },
  { key: 'crew',          es: 'Trabajadores', en: 'Workers' },
  { key: 'driver',        es: 'Manejador(es)', en: 'Driver(s)' },
  { key: 'driver_hours',  es: 'Horas manejadas', en: 'Driver hours' },
  { key: 'worker_notes',  es: 'Notas', en: 'Notes' },
  { key: 'internal_notes',es: 'Notas de admin', en: 'Admin notes' },
  { key: 'total_amount',  es: 'Total (monto $)', en: 'Total (amount $)' },
];

const INVOICE_FIELDS: FieldDef[] = [
  { key: 'invoice_number',   es: 'Número de factura', en: 'Invoice number', required: true },
  { key: 'project_id',       es: 'Project ID (enlace al trabajo)', en: 'Project ID (links to job)' },
  { key: 'line_description', es: 'Descripción', en: 'Description' },
  { key: 'line_qty',         es: 'Total pies o libras (cantidad)', en: 'Total feet or pounds (qty)' },
  { key: 'line_rate',        es: 'Precio unitario', en: 'Unit price' },
  { key: 'customer_name',    es: 'Cliente (nombre)', en: 'Customer (name)' },
  { key: 'customer_company', es: 'Cliente (empresa)', en: 'Customer (company)' },
  { key: 'customer_address', es: 'Dirección', en: 'Address' },
  { key: 'customer_city',    es: 'Ciudad', en: 'City' },
  { key: 'customer_state',   es: 'Estado', en: 'State' },
  { key: 'customer_zip',     es: 'Código postal', en: 'ZIP code' },
  { key: 'customer_phone',   es: 'Teléfono', en: 'Phone' },
  { key: 'customer_email',   es: 'Email', en: 'Email' },
  { key: 'issue_date',       es: 'Fecha de creación', en: 'Date created' },
  { key: 'due_date',         es: 'Fecha de vencimiento', en: 'Due date' },
  { key: 'status',           es: 'Estado (borrador/enviada/pagada)', en: 'Status (draft/sent/paid)' },
];

const EMPLOYEE_FIELDS: FieldDef[] = [
  { key: 'first_name',  es: 'Nombre', en: 'First name', required: true },
  { key: 'last_name',   es: 'Apellido', en: 'Last name' },
  { key: 'check_name',  es: 'Nombre para el cheque', en: 'Check name' },
  { key: 'phone',       es: 'Teléfono', en: 'Phone' },
  { key: 'email',       es: 'Email', en: 'Email' },
  { key: 'access_role', es: 'Rol de acceso a la app (admin/manager/oficina/campo)', en: 'App access role (admin/manager/office/field)' },
  { key: 'pay_type',    es: 'Tipo de pago (por hora/salario/diario)', en: 'Pay type (hourly/salary/daily)' },
  { key: 'pay_rate',    es: 'Tarifa de pago', en: 'Pay rate' },
  { key: 'hire_date',   es: 'Fecha de contratación', en: 'Hire date' },
  { key: 'birthday',    es: 'Cumpleaños', en: 'Birthday' },
  { key: 'address',     es: 'Dirección', en: 'Address' },
  { key: 'city',        es: 'Ciudad', en: 'City' },
  { key: 'state',       es: 'Estado', en: 'State' },
  { key: 'zip_code',    es: 'Código postal', en: 'ZIP code' },
  { key: 'emergency_contact_name',  es: 'Contacto de emergencia (nombre)', en: 'Emergency contact (name)' },
  { key: 'emergency_contact_phone', es: 'Contacto de emergencia (teléfono)', en: 'Emergency contact (phone)' },
];

interface ImportResult {
  success: number;
  skipped: number;
  failedRows: { label: string; reason: string }[];
  notes: string[];
}

interface TemplateField { field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }

interface Props {
  open: boolean;
  mode: Mode;
  businessId: string;
  supabase: any;
  /** Custom-field templates (jobs/employees mode) so extra columns map into custom_fields. */
  templates?: TemplateField[];
  /** Per-business role renames (employees mode) so the CSV can use custom role labels. */
  accessRoles?: { key: string; name: string | null }[];
  /** businesses.invoice_template — picks invoice language (es/en) for new invoices. */
  invoiceTemplate?: unknown;
  onClose: () => void;
  onDone?: () => void;
}

const sanitize = (s: string) =>
  s.replace(/[�﻿]/g, '').replace(/[^\x20-\x7E\xA0-\xFFĀ-￿]/g, '').trim();

export default function ImportModal({
  open, mode, businessId, supabase, templates = [], accessRoles = [], invoiceTemplate, onClose, onDone,
}: Props) {
  const { locale } = useLang();
  const en = locale === 'en';
  const tr = (esText: string, enText: string) => (en ? enText : esText);

  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult>({ success: 0, skipped: 0, failedRows: [], notes: [] });
  const [showErrors, setShowErrors] = useState(false);

  const baseFields = mode === 'jobs' ? JOB_FIELDS : mode === 'employees' ? EMPLOYEE_FIELDS : INVOICE_FIELDS;
  const useTemplates = mode === 'jobs' || mode === 'employees';
  const fields: (FieldDef & { label: string })[] = [
    ...baseFields.map(f => ({ ...f, label: en ? f.en : f.es })),
    ...(useTemplates ? templates.map(t => ({ key: `custom:${t.field_key}`, es: t.field_label, en: t.field_label, label: t.field_label, isCustom: true })) : []),
  ];

  const noun = mode === 'jobs' ? tr('trabajos', 'jobs') : mode === 'employees' ? tr('empleados', 'employees') : tr('facturas', 'invoices');

  const reset = () => {
    setStep('upload'); setHeaders([]); setRows([]); setColMap({});
    setResult({ success: 0, skipped: 0, failedRows: [], notes: [] }); setShowErrors(false);
  };
  const close = () => { reset(); onClose(); };

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true, encoding: 'UTF-8',
      transform: (v: string) => sanitize(v),
      transformHeader: (h: string) => sanitize(h),
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data);
        // Auto-map by normalized name — matches the field KEY (English-ish) and
        // BOTH language labels, so an English CSV maps even in a Spanish app.
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
        const auto: Record<string, string> = {};
        fields.forEach(f => {
          const candidates = [norm(f.es), norm(f.en), norm(f.key.replace('custom:', ''))];
          const match = hdrs.find(h => {
            const hN = norm(h);
            return candidates.some(c => hN === c || hN.includes(c) || c.includes(hN));
          });
          if (match) auto[f.key] = match;
        });
        setColMap(auto);
        setStep('map');
      },
    });
  };

  const get = (row: Record<string, string>, key: string) => {
    const col = colMap[key];
    return col && row[col] != null ? row[col].trim() : '';
  };

  // ── JOBS import ─────────────────────────────────────────────────────────
  const runJobsImport = async (): Promise<ImportResult> => {
    const failedRows: { label: string; reason: string }[] = [];
    let success = 0, skipped = 0;

    const existingJobs = await fetchAll<{ external_ref: string | null }>((from, to) =>
      supabase.from('jobs').select('external_ref').eq('business_id', businessId).range(from, to));
    const existingRefs = new Set(existingJobs.map(j => j.external_ref).filter(Boolean) as string[]);
    const employees = await fetchAll<EmployeeLite>((from, to) =>
      supabase.from('employees').select('id, first_name, last_name').eq('business_id', businessId).range(from, to));

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const csvLine = idx + 2;
      const title = get(row, 'title');
      const ref = get(row, 'external_ref');
      const label = `${tr('Fila', 'Row')} ${csvLine} · ${title || ref || tr('(sin nombre)', '(no name)')}`;

      if (!title) { failedRows.push({ label, reason: tr('Falta el nombre del proyecto', 'Missing project name') }); continue; }
      if (ref && existingRefs.has(ref)) { skipped++; continue; }

      const leadName = get(row, 'lead_name');
      const crewNames = splitNames(get(row, 'crew'));
      const driverNames = splitNames(get(row, 'driver'));
      const allCrew = [...(leadName ? [leadName] : []), ...crewNames];

      const customFields: Record<string, string> = {};
      templates.forEach(t => { const v = get(row, `custom:${t.field_key}`); if (v) customFields[t.field_key] = v; });

      const entry: any = {
        business_id: businessId,
        title,
        status: 'completed',
        external_ref: ref || null,
        scheduled_date: parseDate(get(row, 'scheduled_date')),
        completed_date: parseDate(get(row, 'scheduled_date')),
        total_hours: parseNum(get(row, 'total_hours')),
        driver_hours: parseNum(get(row, 'driver_hours')),
        worker_notes: get(row, 'worker_notes') || null,
        internal_notes: get(row, 'internal_notes') || null,
        total_amount: parseNum(get(row, 'total_amount')) ?? 0,
        crew_names: allCrew,
        driver_names: driverNames,
        driver_employee_ids: driverNames.map(n => matchEmployeeId(n, employees)).filter(Boolean) as string[],
        published_to_crew: true,
        custom_fields: customFields,
      };

      const { data: job, error } = await supabase.from('jobs').insert(entry).select('id').single();
      if (error || !job) { failedRows.push({ label, reason: error?.message ?? tr('No se pudo crear', 'Could not create') }); continue; }
      if (ref) existingRefs.add(ref);

      const assigns: any[] = [];
      const seen = new Set<string>();
      allCrew.forEach((name, i) => {
        const n = normalizeName(name);
        if (seen.has(n)) return;
        seen.add(n);
        assigns.push({ job_id: job.id, employee_id: matchEmployeeId(name, employees), worker_name: name, is_lead: i === 0 && !!leadName });
      });
      if (assigns.length) await supabase.from('job_assignments').insert(assigns);
      success++;
    }
    return { success, skipped, failedRows, notes: [] };
  };

  // ── EMPLOYEES import ────────────────────────────────────────────────────
  const runEmployeesImport = async (): Promise<ImportResult> => {
    const failedRows: { label: string; reason: string }[] = [];
    let success = 0, skipped = 0;

    const existing = await fetchAll<EmployeeLite>((from, to) =>
      supabase.from('employees').select('id, first_name, last_name').eq('business_id', businessId).range(from, to));
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
    accessRoles.forEach(br => {
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

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const csvLine = idx + 2;
      const first = get(row, 'first_name');
      const last = get(row, 'last_name');
      const label = `${tr('Fila', 'Row')} ${csvLine} · ${[first, last].filter(Boolean).join(' ') || tr('(sin nombre)', '(no name)')}`;

      if (!first) { failedRows.push({ label, reason: tr('Falta el nombre', 'Missing first name') }); continue; }
      const fullKey = normalizeName(`${first} ${last}`);
      if (existingNames.has(fullKey)) { skipped++; continue; }

      const customFields: Record<string, string> = {};
      templates.forEach(t => { const v = get(row, `custom:${t.field_key}`); if (v) customFields[t.field_key] = v; });

      const rawPayType = get(row, 'pay_type');
      const entry: any = {
        business_id: businessId,
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

      const { error } = await supabase.from('employees').insert(entry);
      if (error) { failedRows.push({ label, reason: error.message }); continue; }
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
    return { success, skipped, failedRows, notes };
  };

  // ── INVOICES import ─────────────────────────────────────────────────────
  const runInvoicesImport = async (): Promise<ImportResult> => {
    const failedRows: { label: string; reason: string }[] = [];
    const notes: string[] = [];
    let success = 0, skipped = 0;

    const lang = invoiceDefaultLanguage(invoiceTemplate);

    const existingInv = await fetchAll<{ external_ref: string | null }>((from, to) =>
      supabase.from('invoices').select('external_ref').eq('business_id', businessId).range(from, to));
    const existingRefs = new Set(existingInv.map(i => i.external_ref).filter(Boolean) as string[]);

    const jobs = await fetchAll<{ id: string; external_ref: string | null; client_id: string | null }>((from, to) =>
      supabase.from('jobs').select('id, external_ref, client_id').eq('business_id', businessId).range(from, to));
    const jobByRef = new Map<string, { id: string; client_id: string | null }>();
    jobs.forEach(j => { if (j.external_ref) jobByRef.set(j.external_ref, { id: j.id, client_id: j.client_id }); });

    const clients = await fetchAll<{ id: string; first_name: string; last_name: string | null; company: string | null }>((from, to) =>
      supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', businessId).range(from, to));
    const clientIndex = new Map<string, string>();
    clients.forEach(c => {
      clientIndex.set(normalizeName(`${c.first_name} ${c.last_name ?? ''}`), c.id);
      if (c.company) clientIndex.set(normalizeName(c.company), c.id);
    });
    const autoCreated: string[] = [];

    const resolveClient = async (row: Record<string, string>): Promise<string | null> => {
      const name = get(row, 'customer_name');
      const company = get(row, 'customer_company');
      const byName = name && clientIndex.get(normalizeName(name));
      if (byName) return byName;
      const byCompany = company && clientIndex.get(normalizeName(company));
      if (byCompany) return byCompany;
      if (!name && !company) return null;
      const parts = name.split(/\s+/);
      const first = parts[0] || company || '';
      const last = parts.slice(1).join(' ');
      const { data: created, error } = await supabase.from('clients').insert({
        business_id: businessId,
        first_name: first || (company || name),
        last_name: last,
        company: company || null,
        address: get(row, 'customer_address') || null,
        city: get(row, 'customer_city') || null,
        state: get(row, 'customer_state') || null,
        zip_code: get(row, 'customer_zip') || null,
        phone_cell: get(row, 'customer_phone') || null,
        email_office: get(row, 'customer_email') || null,
      }).select('id').single();
      if (error || !created) return null;
      const display = (name || company).trim();
      if (name) clientIndex.set(normalizeName(name), created.id);
      if (company) clientIndex.set(normalizeName(company), created.id);
      autoCreated.push(display);
      return created.id;
    };

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

    const groups = groupBy(rows.map((row, idx) => ({ row, idx })), ({ row }) => get(row, 'invoice_number'));
    let unlinkedLines = 0;

    for (const grp of groups) {
      const first = grp.rows[0];
      const csvLine = first.idx + 2;
      const num = grp.key;
      const label = `${tr('Factura', 'Invoice')} ${num || tr('(sin número)', '(no number)')} · ${tr('fila', 'row')} ${csvLine}`;

      if (!num) { failedRows.push({ label, reason: tr('Falta el número de factura', 'Missing invoice number') }); continue; }
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
          description: get(row, 'line_description') || `${tr('Factura', 'Invoice')} ${num}`,
          qty: parseNum(get(row, 'line_qty')) ?? 1,
          rate: parseNum(get(row, 'line_rate')) ?? 0,
          job_id: job?.id ?? null,
        });
      }

      const { subtotal, tax, total } = computeTotals(lineItems, 0, 0);
      const st = statusOf(get(first.row, 'status'));

      const { data: invoice, error } = await supabase.from('invoices').insert({
        business_id: businessId,
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
        line_items: lineItems,
        subtotal_amount: subtotal,
        tax_rate: 0,
        tax_amount: tax,
        discount: 0,
        total_amount: total,
        notes: null,
      }).select('id').single();

      if (error || !invoice) { failedRows.push({ label, reason: error?.message ?? tr('No se pudo crear la factura', 'Could not create invoice') }); continue; }
      existingRefs.add(num);
      success++;

      if (clientId) await supabase.from('invoice_clients').insert({ invoice_id: invoice.id, client_id: clientId });
      const jobIds = Array.from(linkedJobIds);
      if (jobIds.length) {
        await supabase.from('jobs').update({
          status: 'invoiced', invoice_id: invoice.id, invoiced_at: new Date().toISOString(),
          ...(clientId ? { client_id: clientId } : {}),
        }).in('id', jobIds);
      }
    }

    if (autoCreated.length) {
      const shown = autoCreated.slice(0, 15).join(', ');
      notes.push(tr(
        `${autoCreated.length} cliente(s) creado(s) automáticamente: ${shown}${autoCreated.length > 15 ? '…' : ''}`,
        `${autoCreated.length} client(s) auto-created: ${shown}${autoCreated.length > 15 ? '…' : ''}`,
      ));
    }
    if (unlinkedLines) notes.push(tr(
      `${unlinkedLines} línea(s) sin Project ID coincidente — se guardaron en la factura pero sin trabajo vinculado.`,
      `${unlinkedLines} line(s) with no matching Project ID — kept on the invoice but not linked to a job.`,
    ));

    return { success, skipped, failedRows, notes };
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const res = mode === 'jobs' ? await runJobsImport()
        : mode === 'employees' ? await runEmployeesImport()
        : await runInvoicesImport();
      setResult(res);
      setStep('done');
      onDone?.();
    } catch (e: any) {
      setResult({ success: 0, skipped: 0, failedRows: [{ label: 'Error', reason: e?.message ?? String(e) }], notes: [] });
      setStep('done');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const cols = fields.map(f => f.label);
    const example = mode === 'jobs'
      ? ['Proyecto-001', en ? 'Job name' : 'Nombre del trabajo', en ? 'Lead name' : 'Nombre del líder', '6/10/2026', '10', en ? 'Worker One,Worker Two' : 'Trabajador Uno,Trabajador Dos', en ? 'Driver name' : 'Nombre del manejador', '5', en ? 'Notes' : 'Notas', '', '1297',
         ...templates.map(t => (t.field_type === 'select' && t.field_options?.length ? t.field_options[0] : ''))]
      : mode === 'employees'
      ? [en ? 'First' : 'Nombre', en ? 'Last' : 'Apellido', en ? 'Full legal name' : 'Nombre legal completo', '555-1234', 'persona@email.com', 'office', en ? 'hourly' : 'por hora', '25', '6/1/2024', '1/15/1990', '123 Main St', 'Omaha', 'NE', '68102', en ? 'Contact name' : 'Nombre contacto', '555-5678',
         ...templates.map(t => (t.field_type === 'select' && t.field_options?.length ? t.field_options[0] : ''))]
      : ['257556', 'Proyecto-001', en ? 'Tower work' : 'Trabajo de torre', '1', '2159.50', en ? 'Customer Name' : 'Nombre del cliente', '', 'Portis', 'Kansas', 'KS', '67474', '785-346-4400', 'cliente@email.com', '6/8/2026', '6/22/2026', en ? 'sent' : 'enviada'];
    // Quote any cell with a comma/quote/newline so multi-name values stay in ONE
    // column. Lead BOM (﻿) so Excel reads UTF-8 and accents render correctly.
    const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = '﻿' + [cols.map(csvCell).join(','), example.map(csvCell).join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'jobs' ? 'plantilla-trabajos.csv' : mode === 'employees' ? 'plantilla-equipo.csv' : 'plantilla-facturas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const title =
    step === 'done' ? tr('Importación completada', 'Import complete')
    : mode === 'jobs' ? tr('Importar trabajos', 'Import jobs')
    : mode === 'employees' ? tr('Importar equipo', 'Import team')
    : tr('Importar facturas', 'Import invoices');

  const uploadHint =
    mode === 'jobs' ? tr('Sube un CSV con un renglón por proyecto. Incluye la columna Project ID para poder enlazar las facturas después.', 'Upload a CSV with one row per project. Include the Project ID column so invoices can link to them later.')
    : mode === 'employees' ? tr('Sube un CSV con un renglón por persona. Las personas se vinculan por nombre — usa los mismos nombres en tus trabajos y facturas.', 'Upload a CSV with one row per person. People are matched by name — use the same names across your jobs and invoices.')
    : tr('Sube un CSV con un renglón por línea de factura. Importa los trabajos PRIMERO — cada línea se enlaza al trabajo por su Project ID.', 'Upload a CSV with one row per invoice line. Import jobs FIRST — each line links to its job by Project ID.');

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

      <Modal open={open} onClose={close} title={title} size="lg">
        <div className="flex flex-col gap-4">
          {step === 'upload' && (
            <>
              <p className="text-xs text-gray-500">{uploadHint}</p>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary hover:bg-primary/5'}`}>
                <Upload size={32} className={`mx-auto mb-3 ${dragOver ? 'text-primary' : 'text-gray-300'}`} />
                <p className="text-sm font-semibold text-gray-700">{tr('Arrastra tu archivo CSV aquí', 'Drag your CSV file here')}</p>
                <p className="text-xs text-gray-400 mt-1">{tr('o haz clic para seleccionarlo', 'or click to choose it')}</p>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">{tr('¿No sabes qué columnas usar?', 'Not sure which columns to use?')}</p>
                  <p className="text-xs text-gray-400">{tr('Descarga la plantilla de ejemplo y llénala.', 'Download the example template and fill it in.')}</p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                  <Download size={14} /> {tr('Descargar plantilla', 'Download template')}
                </button>
              </div>
            </>
          )}

          {step === 'map' && (
            <>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-900">{rows.length} {tr('renglones detectados', 'rows detected')}</span>. {tr('Empareja cada campo con la columna de tu archivo.', 'Match each field to a column in your file.')}
              </p>
              <div className="grid grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {fields.map(f => {
                  const unmapped = !colMap[f.key];
                  return (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                        {f.label}
                        {f.required && <span className="text-red-400">*</span>}
                        {f.isCustom && <span className="text-blue-400 text-[10px]">{tr('personalizado', 'custom')}</span>}
                      </label>
                      <select
                        value={colMap[f.key] ?? ''}
                        onChange={e => setColMap(m => ({ ...m, [f.key]: e.target.value }))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none ${
                          unmapped ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                        <option value="">{tr('— No importar —', '— Don\'t import —')}</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setStep('upload')} fullWidth>{tr('Cancelar', 'Cancel')}</Button>
                <Button onClick={() => setStep('preview')} fullWidth>{tr('Ver datos', 'View data')}</Button>
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              <p className="text-xs text-gray-500">{tr('Mostrando', 'Showing')} {Math.min(5, rows.length)} {tr('de', 'of')} {rows.length} {tr('renglones', 'rows')}.</p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {fields.filter(f => colMap[f.key]).map(f => (
                        <th key={f.key} className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {fields.filter(f => colMap[f.key]).map(f => (
                          <td key={f.key} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[120px] truncate">
                            {row[colMap[f.key]] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setStep('map')} fullWidth>{tr('Atrás', 'Back')}</Button>
                <Button onClick={runImport} loading={importing} fullWidth>{tr('Importar', 'Import')} {rows.length} {tr('renglones', 'rows')}</Button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{tr('¡Listo!', 'Done!')}</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="text-emerald-600 font-semibold">{result.success} {noun} {tr('importadas', 'imported')}</span>
                  {result.skipped > 0 && <span className="text-gray-500 font-semibold ml-2">· {result.skipped} {tr('ya existían', 'already existed')}</span>}
                  {result.failedRows.length > 0 && <span className="text-red-500 font-semibold ml-2">· {result.failedRows.length} {tr('con error', 'with errors')}</span>}
                </p>
              </div>

              {result.notes.length > 0 && (
                <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-left space-y-1">
                  {result.notes.map((n, i) => <p key={i} className="text-xs text-blue-800">{n}</p>)}
                </div>
              )}

              {result.failedRows.length > 0 && (
                <div className="w-full">
                  <button type="button" onClick={() => setShowErrors(v => !v)}
                    className="w-full text-sm font-medium text-primary py-1 hover:underline">
                    {showErrors ? tr('Ocultar detalles ▴', 'Hide details ▴') : tr('Ver detalles de los errores ▾', 'See error details ▾')}
                  </button>
                  {showErrors && (
                    <div className="mt-2 max-h-64 overflow-y-auto bg-red-50 border border-red-100 rounded-xl text-left">
                      {result.failedRows.slice(0, 50).map((f, i) => (
                        <div key={i} className="px-4 py-2 border-b border-red-100/60 last:border-b-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{f.label}</p>
                          <p className="text-xs text-red-700">{f.reason}</p>
                        </div>
                      ))}
                      {result.failedRows.length > 50 && (
                        <div className="px-4 py-2 text-xs text-gray-600 text-center bg-red-100/40">+ {result.failedRows.length - 50} {tr('más', 'more')}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={close} fullWidth>{tr('Cerrar', 'Close')}</Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
