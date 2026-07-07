'use client';

// Legacy data import wizard (web) — bulk-load from CSV. Three modes:
//   - 'jobs'      → one row per project. Creates jobs (external_ref = old
//                   Project ID), crew assignments, and driver links.
//   - 'invoices'  → one row per LINE ITEM. Groups rows by invoice number,
//                   matches / auto-creates the client, and links each line to
//                   the job it came from via Project ID (jobs.external_ref).
//   - 'employees' → one row per person. Creates employees (deduped by name).
//
// The field catalog + import logic live in shared/src/lib/importRunners.ts
// (KEEP the two wizards in sync — mobile/components/ImportDataModal.tsx is
// the phone equivalent). Labels + UI text follow the app language (es/en)
// via useLang(). The exact header names in the user's file don't matter —
// the column-mapping step lets them map any header to a field.

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import {
  importFieldsFor,
  importModeUsesTemplates,
  autoMapHeaders,
  buildImportTemplateCsv,
  runImportFor,
  type ImportMode,
  type ImportResult,
  type ImportTemplateField,
} from '@amixos/shared/lib/importRunners';
import { useApp } from '@/lib/AppContext';

interface Props {
  open: boolean;
  mode: ImportMode;
  businessId: string;
  supabase: any;
  /** Custom-field templates (jobs/employees mode) so extra columns map into custom_fields. */
  templates?: ImportTemplateField[];
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
  const { user, business } = useApp();
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
  // Fix-and-retry for a failed row: index into result.failedRows being edited,
  // its field values (keyed by field key), and the in-flight flag.
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [fixValues, setFixValues] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState(false);

  const useTemplates = importModeUsesTemplates(mode);
  // Materiales/Precios columns follow the form's visibility (Ajustes → Trabajos).
  const fieldOpts = { jobPricing: business?.job_item_types_enabled !== false };
  const fields: { key: string; es: string; en: string; label: string; required?: boolean; isCustom?: boolean }[] = [
    ...importFieldsFor(mode, fieldOpts).map(f => ({ ...f, label: en ? f.en : f.es })),
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
        setColMap(autoMapHeaders(fields, hdrs));
        setStep('map');
      },
    });
  };

  const buildCtx = (importRows: Record<string, string>[]) => ({
    supabase,
    businessId,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    locale: (en ? 'en' : 'es') as 'en' | 'es',
    rows: importRows,
    colMap,
    templates: useTemplates ? templates : [],
    accessRoles,
    invoiceTemplate,
  });

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await runImportFor(mode, buildCtx(rows));
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

  const mappedFields = fields.filter(f => colMap[f.key]);

  const openFix = (i: number) => {
    const fr = result.failedRows[i];
    if (fr.rowIndex == null) return;
    const row = rows[fr.rowIndex] ?? {};
    const values: Record<string, string> = {};
    mappedFields.forEach(f => { values[f.key] = row[colMap[f.key]] ?? ''; });
    setFixValues(values);
    setFixingIndex(i);
  };

  // Re-run the import for JUST the edited row. Success (or "already exists")
  // removes it from the failure list; a new failure updates the reason in place.
  const retryFix = async () => {
    if (fixingIndex === null) return;
    const editedRow: Record<string, string> = {};
    mappedFields.forEach(f => { editedRow[colMap[f.key]] = fixValues[f.key] ?? ''; });
    setRetrying(true);
    try {
      const res = await runImportFor(mode, buildCtx([editedRow]));
      if (res.success > 0 || res.skipped > 0) {
        setResult(prev => ({
          ...prev,
          success: prev.success + res.success,
          skipped: prev.skipped + res.skipped,
          failedRows: prev.failedRows.filter((_, i) => i !== fixingIndex),
          notes: [...prev.notes, ...res.notes.filter(n => !prev.notes.includes(n))],
        }));
        setFixingIndex(null);
        onDone?.();
      } else {
        const reason = res.failedRows[0]?.reason;
        if (reason) {
          setResult(prev => ({
            ...prev,
            failedRows: prev.failedRows.map((f, i) => (i === fixingIndex ? { ...f, reason } : f)),
          }));
        }
      }
    } finally {
      setRetrying(false);
    }
  };

  const downloadTemplate = () => {
    const { filename, csv } = buildImportTemplateCsv(mode, en ? 'en' : 'es', templates, fieldOpts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
      + (fieldOpts.jobPricing ? tr(' Repite el mismo Project ID en varias filas para agregar líneas de materiales/precios al mismo trabajo.', ' Repeat the same Project ID on several rows to add line items to one job.') : '')
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
                    <div className="mt-2 max-h-80 overflow-y-auto bg-red-50 border border-red-100 rounded-xl text-left">
                      {result.failedRows.slice(0, 50).map((f, i) => (
                        <div key={i} className="px-4 py-2 border-b border-red-100/60 last:border-b-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{f.label}</p>
                              <p className="text-xs text-red-700">{f.reason}</p>
                            </div>
                            {f.rowIndex != null && (
                              <button
                                type="button"
                                onClick={() => (fixingIndex === i ? setFixingIndex(null) : openFix(i))}
                                className="shrink-0 text-xs font-semibold text-primary hover:underline"
                              >
                                {fixingIndex === i ? tr('Cancelar', 'Cancel') : tr('Corregir', 'Fix')}
                              </button>
                            )}
                          </div>
                          {/* Inline editor — fix the row's values and retry just this row. */}
                          {fixingIndex === i && (
                            <div className="mt-2 rounded-xl bg-white border border-gray-100 p-3">
                              <div className="grid grid-cols-2 gap-2">
                                {mappedFields.map(mf => (
                                  <div key={mf.key} className="flex flex-col gap-0.5">
                                    <label className="text-[11px] font-medium text-gray-500">{mf.label}{mf.required ? ' *' : ''}</label>
                                    <input
                                      value={fixValues[mf.key] ?? ''}
                                      onChange={e => setFixValues(v => ({ ...v, [mf.key]: e.target.value }))}
                                      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 flex justify-end">
                                <Button size="sm" onClick={() => void retryFix()} loading={retrying}>
                                  {tr('Reintentar fila', 'Retry row')}
                                </Button>
                              </div>
                            </div>
                          )}
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
