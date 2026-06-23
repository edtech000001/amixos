'use client';

// Legacy data import wizard (web-only) — bulk-load old AppSheet projects and
// FileMaker invoices from CSV. Two modes:
//   - 'jobs'     → one row per project. Creates jobs (with external_ref =
//                  old Project ID), crew assignments, and driver links.
//   - 'invoices' → one row per LINE ITEM. Groups rows by invoice number, matches
//                  / auto-creates the client, and links each line to the job it
//                  came from via Project ID (jobs.external_ref). Matched jobs are
//                  marked invoiced.
//
// Reuses the Clientes import UX: drag-drop upload → column map (auto-guessed) →
// preview → per-row success/failure report. Strings are inline Spanish (this is
// a Spanish-first admin tool); no i18n dict entries needed.

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { invoiceDefaultLanguage } from '@amixos/shared/lib/invoiceTemplate';
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

type Mode = 'jobs' | 'invoices';

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  isCustom?: boolean;
}

const JOB_FIELDS: FieldDef[] = [
  { key: 'external_ref',  label: 'Project ID (ID de AppSheet)' },
  { key: 'title',         label: 'Nombre del proyecto', required: true },
  { key: 'lead_name',     label: 'Líder' },
  { key: 'scheduled_date',label: 'Fecha' },
  { key: 'total_hours',   label: 'Total horas' },
  { key: 'crew',          label: 'Trabajadores' },
  { key: 'driver',        label: 'Manejador(es)' },
  { key: 'driver_hours',  label: 'Horas manejadas' },
  { key: 'worker_notes',  label: 'Notas' },
  { key: 'internal_notes',label: 'Admin Notes' },
  { key: 'total_amount',  label: 'Total (monto $)' },
];

const INVOICE_FIELDS: FieldDef[] = [
  { key: 'invoice_number',   label: 'Número de factura', required: true },
  { key: 'project_id',       label: 'Project ID (enlace al trabajo)' },
  { key: 'line_description', label: 'Descripción' },
  { key: 'line_qty',         label: 'Total pies o libras (cantidad)' },
  { key: 'line_rate',        label: 'Precio unitario' },
  { key: 'customer_name',    label: 'Cliente (nombre)' },
  { key: 'customer_company', label: 'Cliente (empresa)' },
  { key: 'customer_address', label: 'Dirección' },
  { key: 'customer_city',    label: 'Ciudad' },
  { key: 'customer_state',   label: 'Estado' },
  { key: 'customer_zip',     label: 'Código postal' },
  { key: 'customer_phone',   label: 'Teléfono' },
  { key: 'customer_email',   label: 'Email' },
  { key: 'issue_date',       label: 'Fecha de creación' },
  { key: 'due_date',         label: 'Fecha de vencimiento' },
  { key: 'status',           label: 'Estado (borrador/enviada/pagada)' },
];

interface ImportResult {
  success: number;                                   // jobs or invoices created
  skipped: number;                                   // already imported (external_ref match)
  failedRows: { label: string; reason: string }[];
  notes: string[];                                   // info lines (auto-created clients, unlinked lines)
}

interface Props {
  open: boolean;
  mode: Mode;
  businessId: string;
  supabase: any;
  /** Job custom-field templates (jobs mode) so extra columns map into custom_fields. */
  jobTemplates?: { field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }[];
  /** businesses.invoice_template — picks invoice language (es/en) for new invoices. */
  invoiceTemplate?: unknown;
  onClose: () => void;
  onDone?: () => void;
}

const sanitize = (s: string) =>
  s.replace(/[�﻿]/g, '').replace(/[^\x20-\x7E\xA0-\xFFĀ-￿]/g, '').trim();

export default function ImportModal({
  open, mode, businessId, supabase, jobTemplates = [], invoiceTemplate, onClose, onDone,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult>({ success: 0, skipped: 0, failedRows: [], notes: [] });
  const [showErrors, setShowErrors] = useState(false);

  const fields: FieldDef[] = mode === 'jobs'
    ? [...JOB_FIELDS, ...jobTemplates.map(t => ({ key: `custom:${t.field_key}`, label: t.field_label, isCustom: true }))]
    : INVOICE_FIELDS;

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
        // Auto-map by normalized name (matches "Project ID" → external_ref, etc.).
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
        const auto: Record<string, string> = {};
        fields.forEach(f => {
          const fNorm = norm(f.label);
          const fKey = norm(f.key.replace('custom:', ''));
          const match = hdrs.find(h => {
            const hNorm = norm(h);
            return hNorm === fKey || hNorm === fNorm || hNorm.includes(fKey) || fKey.includes(hNorm);
          });
          if (match) auto[f.key] = match;
        });
        setColMap(auto);
        setStep('map');
      },
    });
  };

  // ── JOBS import ─────────────────────────────────────────────────────────
  const runJobsImport = async (): Promise<ImportResult> => {
    const failedRows: { label: string; reason: string }[] = [];
    let success = 0, skipped = 0;

    const get = (row: Record<string, string>, key: string) => {
      const col = colMap[key];
      return col && row[col] != null ? row[col].trim() : '';
    };

    // Existing external_refs (idempotency) + employees (crew matching).
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
      const label = `Fila ${csvLine} · ${title || ref || '(sin nombre)'}`;

      if (!title) { failedRows.push({ label, reason: 'Falta el nombre del proyecto' }); continue; }
      if (ref && existingRefs.has(ref)) { skipped++; continue; }

      const leadName = get(row, 'lead_name');
      const crewNames = splitNames(get(row, 'crew'));
      const driverNames = splitNames(get(row, 'driver'));
      const allCrew = [...(leadName ? [leadName] : []), ...crewNames];

      const customFields: Record<string, string> = {};
      jobTemplates.forEach(t => {
        const v = get(row, `custom:${t.field_key}`);
        if (v) customFields[t.field_key] = v;
      });

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
      if (error || !job) { failedRows.push({ label, reason: error?.message ?? 'No se pudo crear' }); continue; }
      if (ref) existingRefs.add(ref);

      // Crew assignments: worker_name ALWAYS set so the name survives an
      // employee deletion (employee_id is on-delete-set-null). One lead max.
      const assigns: any[] = [];
      const seen = new Set<string>();
      allCrew.forEach((name, i) => {
        const norm = normalizeName(name);
        if (seen.has(norm)) return;
        seen.add(norm);
        assigns.push({
          job_id: job.id,
          employee_id: matchEmployeeId(name, employees),
          worker_name: name,
          is_lead: i === 0 && !!leadName, // first entry is the lead when a Líder was given
        });
      });
      if (assigns.length) await supabase.from('job_assignments').insert(assigns);
      success++;
    }

    return { success, skipped, failedRows, notes: [] };
  };

  // ── INVOICES import ─────────────────────────────────────────────────────
  const runInvoicesImport = async (): Promise<ImportResult> => {
    const failedRows: { label: string; reason: string }[] = [];
    const notes: string[] = [];
    let success = 0, skipped = 0;

    const get = (row: Record<string, string>, key: string) => {
      const col = colMap[key];
      return col && row[col] != null ? row[col].trim() : '';
    };

    const lang = invoiceDefaultLanguage(invoiceTemplate);

    // Existing invoice refs (idempotency).
    const existingInv = await fetchAll<{ external_ref: string | null }>((from, to) =>
      supabase.from('invoices').select('external_ref').eq('business_id', businessId).range(from, to));
    const existingRefs = new Set(existingInv.map(i => i.external_ref).filter(Boolean) as string[]);

    // Jobs by external_ref → for line linking + client backfill.
    const jobs = await fetchAll<{ id: string; external_ref: string | null; client_id: string | null }>((from, to) =>
      supabase.from('jobs').select('id, external_ref, client_id').eq('business_id', businessId).range(from, to));
    const jobByRef = new Map<string, { id: string; client_id: string | null }>();
    jobs.forEach(j => { if (j.external_ref) jobByRef.set(j.external_ref, { id: j.id, client_id: j.client_id }); });

    // Clients for matching (by normalized name / company).
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

      // Auto-create. Split the name on the first space → first / last.
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
      // Explicit "draft/borrador" is the ONLY way to land in draft. Everything
      // else — including blanks — becomes 'sent': these are real, already-issued
      // FileMaker invoices, AND it keeps them rebuild-safe. rebuildInvoiceLineItems
      // only touches DRAFT invoices; a draft import (whose jobs have no job_items)
      // would get its imported amounts wiped to $0 placeholders on first open.
      if (s === 'draft' || s.includes('borrador')) return { status: 'draft', sent_at: null, paid_at: null };
      return { status: 'sent', sent_at: now, paid_at: null };
    };

    // Group line rows into invoices by invoice number, preserving order.
    const groups = groupBy(rows.map((row, idx) => ({ row, idx })), ({ row }) => get(row, 'invoice_number'));
    let unlinkedLines = 0;

    for (const grp of groups) {
      const first = grp.rows[0];
      const csvLine = first.idx + 2;
      const num = grp.key;
      const label = `Factura ${num || '(sin número)'} · fila ${csvLine}`;

      if (!num) { failedRows.push({ label, reason: 'Falta el número de factura' }); continue; }
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
          description: get(row, 'line_description') || `Factura ${num}`,
          qty: parseNum(get(row, 'line_qty')) ?? 1,
          rate: parseNum(get(row, 'line_rate')) ?? 0,
          job_id: job?.id ?? null,
        });
      }

      const { subtotal, tax, total } = computeTotals(lineItems, 0, 0);
      const st = statusOf(get(first.row, 'status'));
      const issue = parseDate(get(first.row, 'issue_date'));
      const due = parseDate(get(first.row, 'due_date'));

      const { data: invoice, error } = await supabase.from('invoices').insert({
        business_id: businessId,
        client_id: clientId,
        invoice_number: num,
        external_ref: num,
        type: 'invoice',
        status: st.status,
        language: lang,
        issue_date: issue,
        due_date: due,
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

      if (error || !invoice) { failedRows.push({ label, reason: error?.message ?? 'No se pudo crear la factura' }); continue; }
      existingRefs.add(num);
      success++;

      // Link the invoice's client to its jobs + mark them invoiced.
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
      notes.push(`${autoCreated.length} cliente(s) creado(s) automáticamente: ${shown}${autoCreated.length > 15 ? '…' : ''}`);
    }
    if (unlinkedLines) notes.push(`${unlinkedLines} línea(s) sin Project ID coincidente — se guardaron en la factura pero sin trabajo vinculado.`);

    return { success, skipped, failedRows, notes };
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const res = mode === 'jobs' ? await runJobsImport() : await runInvoicesImport();
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
      ? ['Proyecto-8384902e', '5 Tower Moved - Chris Shook', 'Noel', '6/10/2026', '10', 'Alex Cardona,Allan Guerra', 'Noel Ramirez', '5', 'Mover pivot viejo', '', '1297',
         // Custom fields: for a dropdown, show its first option as a sample value.
         ...jobTemplates.map(t => (t.field_type === 'select' && t.field_options?.length ? t.field_options[0] : ''))]
      : ['257556', 'Proyecto-2f72fa1b', '6 Tower Move & 2 Tower Disassembled', '1', '2159.50', 'Russell Hendrich', '', 'Portis', 'Kansas', 'KS', '67474', '785-346-4400', 'pennyhendrich@gmail.com', '6/8/2026', '6/22/2026', 'enviada'];
    // Quote any cell containing a comma/quote/newline so values like
    // "Alex Cardona,Allan Guerra" stay in ONE column instead of splitting and
    // shifting the whole row. Lead ﻿ (BOM) so Excel reads UTF-8 — without
    // it accented headers like "Líder" get mangled.
    const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = '﻿' + [cols.map(csvCell).join(','), example.map(csvCell).join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = mode === 'jobs' ? 'plantilla-trabajos.csv' : 'plantilla-facturas.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const title =
    step === 'done' ? 'Importación completada'
    : mode === 'jobs' ? 'Importar trabajos'
    : 'Importar facturas';

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

      <Modal open={open} onClose={close} title={title} size="lg">
        <div className="flex flex-col gap-4">
          {step === 'upload' && (
            <>
              <p className="text-xs text-gray-500">
                {mode === 'jobs'
                  ? 'Sube un CSV con un renglón por proyecto. Incluye la columna Project ID para poder enlazar las facturas después.'
                  : 'Sube un CSV con un renglón por línea de factura. Importa los trabajos PRIMERO — cada línea se enlaza al trabajo por su Project ID.'}
              </p>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary hover:bg-primary/5'}`}>
                <Upload size={32} className={`mx-auto mb-3 ${dragOver ? 'text-primary' : 'text-gray-300'}`} />
                <p className="text-sm font-semibold text-gray-700">Arrastra tu archivo CSV aquí</p>
                <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionarlo</p>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">¿No sabes qué columnas usar?</p>
                  <p className="text-xs text-gray-400">Descarga la plantilla de ejemplo y llénala.</p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                  <Download size={14} /> Descargar plantilla
                </button>
              </div>
            </>
          )}

          {step === 'map' && (
            <>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-900">{rows.length} renglones detectados</span>. Empareja cada campo con la columna de tu archivo.
              </p>
              <div className="grid grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {fields.map(f => {
                  const unmapped = !colMap[f.key];
                  return (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                        {f.label}
                        {f.required && <span className="text-red-400">*</span>}
                        {f.isCustom && <span className="text-blue-400 text-[10px]">personalizado</span>}
                      </label>
                      <select
                        value={colMap[f.key] ?? ''}
                        onChange={e => setColMap(m => ({ ...m, [f.key]: e.target.value }))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none ${
                          unmapped ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                        <option value="">— No importar —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setStep('upload')} fullWidth>Cancelar</Button>
                <Button onClick={() => setStep('preview')} fullWidth>Ver datos</Button>
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              <p className="text-xs text-gray-500">Mostrando {Math.min(5, rows.length)} de {rows.length} renglones.</p>
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
                <Button variant="secondary" onClick={() => setStep('map')} fullWidth>Atrás</Button>
                <Button onClick={runImport} loading={importing} fullWidth>Importar {rows.length} renglones</Button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">¡Listo!</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="text-emerald-600 font-semibold">{result.success} {mode === 'jobs' ? 'trabajos' : 'facturas'} importadas</span>
                  {result.skipped > 0 && <span className="text-gray-500 font-semibold ml-2">· {result.skipped} ya existían</span>}
                  {result.failedRows.length > 0 && <span className="text-red-500 font-semibold ml-2">· {result.failedRows.length} con error</span>}
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
                    {showErrors ? 'Ocultar detalles ▴' : 'Ver detalles de los errores ▾'}
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
                        <div className="px-4 py-2 text-xs text-gray-600 text-center bg-red-100/40">+ {result.failedRows.length - 50} más</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={close} fullWidth>Cerrar</Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
