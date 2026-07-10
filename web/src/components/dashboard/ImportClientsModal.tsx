'use client';

// Web clients CSV import wizard — extracted from clientes/page.tsx so it can
// mount both on the clients page (?import=1) AND directly inside the Ajustes
// "Importar datos" hub without navigating anywhere. Mobile counterpart:
// mobile/components/ImportClientsModal.tsx (KEEP the column set in sync).

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { isGoogleSyncConnected } from '@amixos/shared/lib/googleSync';
import { parseTimestamp } from '@amixos/shared/lib/dataImport';
import { US_STATE_NAME_TO_ABBR } from '@amixos/shared/lib/usStates';

const normalizeState = (val: string) => {
  const t = val.trim();
  if (t.length === 2) return t.toUpperCase();
  return US_STATE_NAME_TO_ABBR[t.toLowerCase()] ?? t;
};

const sanitize = (s: string) =>
  s.replace(/[�﻿]/g, '').replace(/[^\x20-\x7E\xA0-\xFFĀ-￿]/g, '').trim();

interface Props {
  open: boolean;
  businessId: string;
  /** Client custom-field templates so extra columns map into custom_fields. */
  templates: { field_key: string; field_label: string }[];
  onClose: () => void;
  /** Reload the caller's list after a successful import. */
  onDone?: () => void;
  /** Final-button label override (the hub shows a plain "close"). */
  doneLabel?: string;
}

export default function ImportClientsModal({ open, businessId, templates, onClose, onDone, doneLabel }: Props) {
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;
  const tc = full.common;
  const syncBanner = useGoogleSyncBanner();

  const fileRef = useRef<HTMLInputElement>(null);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failedRows: { label: string; reason: string }[];
  }>({ success: 0, failedRows: [] });
  const [showImportErrorDetails, setShowImportErrorDetails] = useState(false);

  const CLIENT_FIELDS: { key: string; label: string; required?: boolean; hint?: string }[] = [
    { key: 'first_name',   label: t.fields.firstName, hint: locale === 'en' ? 'Each row needs a first name, last name or company.' : 'Cada fila necesita nombre, apellido o empresa.' },
    { key: 'last_name',    label: t.fields.lastName },
    { key: 'company',      label: t.fields.company },
    { key: 'phone_cell',   label: t.fields.phoneCell },
    { key: 'phone_office', label: t.fields.phoneOffice },
    { key: 'email_office', label: t.fields.emailOffice },
    { key: 'email_home',   label: t.fields.emailHome },
    { key: 'address',      label: t.fields.addressLine1 },
    { key: 'city',         label: t.fields.city },
    { key: 'state',        label: t.fields.state },
    { key: 'zip_code',     label: t.fields.zipCode },
    { key: 'notes',        label: t.fields.notes },
    // Optional source-system timestamps — blank keeps the now() defaults.
    { key: 'created_at',   label: t.importModal.colAdded, hint: locale === 'en' ? 'Blank = current date/time.' : 'Vacío = fecha/hora actual.' },
    { key: 'updated_at',   label: t.importModal.colEdited, hint: locale === 'en' ? 'Blank = current date/time.' : 'Vacío = fecha/hora actual.' },
  ];

  const allImportFields: { key: string; label: string; required?: boolean; isCustom?: boolean; hint?: string }[] = [
    ...CLIENT_FIELDS,
    ...templates.map(tpl => ({ key: `custom:${tpl.field_key}`, label: tpl.field_label, isCustom: true })),
  ];

  const handleFileSelect = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      encoding: 'UTF-8',
      transform: (value: string) => sanitize(value),
      transformHeader: (header: string) => sanitize(header),
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        setCsvHeaders(headers);
        // Drop all-blank rows — Excel exports carry ",,,,," to the sheet end.
        setCsvRows(result.data.filter((r: Record<string, string>) => Object.values(r).some(v => v && String(v).trim() !== '')));
        const auto: Record<string, string> = {};
        // Lowercase, strip diacritics, keep letters/digits — "Código postal"
        // matches "Codigo postal", "phone-1" matches "phone1", etc.
        const normalize = (s: string) =>
          s.toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]/g, '');
        allImportFields.forEach(field => {
          const fNorm = normalize(field.label);
          const fKey = normalize(field.key.replace('custom:', ''));
          const match = headers.find(h => {
            const hNorm = normalize(h);
            return hNorm === fKey || hNorm === fNorm ||
              hNorm.includes(fKey) || fKey.includes(hNorm);
          });
          if (match) auto[field.key] = match;
        });
        setColMap(auto);
        setImportStep('map');
      },
    });
  };

  // Failure label: leads with the CSV line number (Excel shows the header as
  // row 1, data starts at row 2) then any identifying value.
  const rowLabel = (
    entry: any,
    originalRow: Record<string, string> | null,
    csvLine: number,
  ): string => {
    const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim();
    const candidate = name || entry.company || entry.phone_cell || entry.email_office;
    if (candidate) return `Fila ${csvLine} · ${candidate}`;
    if (originalRow) {
      const nonEmpty = Object.entries(originalRow)
        .filter(([, v]) => v && String(v).trim())
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v).trim()}`);
      if (nonEmpty.length > 0) return `Fila ${csvLine} · ${nonEmpty.join(', ')}`;
    }
    return `Fila ${csvLine} (vacía)`;
  };

  const runImport = async () => {
    setImporting(true);
    const batch: { entry: any; csvLine: number; originalRow: Record<string, string> }[] = [];
    const failedRows: { label: string; reason: string }[] = [];
    csvRows.forEach((row, idx) => {
      const csvLine = idx + 2;
      const entry: any = { business_id: businessId };
      const customFields: Record<string, string> = {};

      CLIENT_FIELDS.forEach(field => {
        const col = colMap[field.key];
        if (col && row[col] !== undefined) {
          let val: string | null = row[col].trim() || null;
          if (field.key === 'state' && val) val = normalizeState(val);
          // Timestamps must land as valid ISO or not at all — a raw cell that
          // Postgres can't parse would fail the whole row.
          if (field.key === 'created_at' || field.key === 'updated_at') {
            const ts = parseTimestamp(val);
            if (ts) entry[field.key] = ts;
            return;
          }
          entry[field.key] = val;
        }
      });

      templates.forEach(tpl => {
        const col = colMap[`custom:${tpl.field_key}`];
        if (col && row[col] !== undefined) {
          const val = row[col].trim();
          if (val) customFields[tpl.field_key] = val;
        }
      });

      if (Object.keys(customFields).length > 0) entry.custom_fields = customFields;
      if (!entry.first_name && !entry.last_name && !entry.company) {
        failedRows.push({ label: rowLabel(entry, row, csvLine), reason: 'Sin nombre, apellido o empresa' });
        return;
      }
      if (!entry.first_name) entry.first_name = entry.last_name || entry.company || '';
      if (!entry.last_name) entry.last_name = '';
      batch.push({ entry, csvLine, originalRow: row });
    });
    let success = 0;
    const insertedIds: string[] = [];
    for (let i = 0; i < batch.length; i += 50) {
      const slice = batch.slice(i, i + 50);
      const { data, error } = await supabase.from('clients').insert(slice.map(b => b.entry)).select('id');
      if (error) {
        // Batch rolled back. Retry one-by-one so we can pinpoint which
        // row(s) actually broke the transaction and capture each error.
        for (const b of slice) {
          const { data: d2, error: e2 } = await supabase
            .from('clients').insert(b.entry).select('id').single();
          if (e2) {
            failedRows.push({ label: rowLabel(b.entry, b.originalRow, b.csvLine), reason: e2.message });
          } else {
            success++;
            if (d2?.id) insertedIds.push(d2.id);
          }
        }
      } else {
        success += slice.length;
        if (Array.isArray(data)) insertedIds.push(...data.map((r: { id: string }) => r.id));
      }
    }
    // Hand off to the banner provider — it owns throttling, persistence,
    // and auto-resume if the browser is closed mid-batch. Skip when Google
    // sync isn't connected for this business.
    if (insertedIds.length > 0) {
      const apiBaseUrl = getApiBaseUrl() || null;
      const jwt = (await getJwt().catch(() => null)) || null;
      const connected = await isGoogleSyncConnected(businessId, { apiBaseUrl, jwt });
      if (connected) syncBanner.runCreateBatch(insertedIds);
    }
    setImportResult({ success, failedRows });
    onDone?.();
    setImporting(false);
    setImportStep('done');
  };

  const downloadTemplate = () => {
    const headers = [
      t.fields.firstName, t.fields.lastName, t.fields.company,
      t.fields.phoneCell, t.fields.phoneOffice,
      t.fields.emailOffice, t.fields.emailHome,
      t.fields.addressLine1, t.fields.city, t.fields.state, t.fields.zipCode, t.fields.notes,
      t.importModal.colAdded, t.importModal.colEdited,
      ...templates.map(tpl => tpl.field_label),
    ];
    const example = ['Juan', 'Pérez', 'Construcciones JP', '555-1234', '555-5678', 'jp@empresa.com', 'juan@personal.com', '123 Main St', 'Omaha', 'NE', '68102', '', '6/9/2026 8:00', '6/12/2026 4:45 PM',
      ...templates.map(() => '')];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = t.importModal.templateFilename; a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportStep('upload'); setCsvHeaders([]); setCsvRows([]); setColMap({});
    setImportResult({ success: 0, failedRows: [] }); setShowImportErrorDetails(false);
    onClose();
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}/>

      <Modal open={open} onClose={resetImport}
        title={importStep === 'done' ? t.importModal.doneTitle : importStep === 'preview' ? t.importModal.previewTitle : importStep === 'map' ? t.importModal.mapTitle : t.importModal.title}
        size="lg">
        <div className="flex flex-col gap-4">

          {importStep === 'upload' && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileSelect(file);
                }}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary hover:bg-primary/5'
                }`}>
                <Upload size={32} className={`mx-auto mb-3 transition-colors ${dragOver ? 'text-primary' : 'text-gray-300'}`}/>
                <p className="text-sm font-semibold text-gray-700">{t.importModal.uploadPrimary}</p>
                <p className="text-xs text-gray-400 mt-1">{t.importModal.uploadSecondary}</p>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">{t.importModal.templatePromptTitle}</p>
                  <p className="text-xs text-gray-400">{t.importModal.templatePromptSub}</p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                  <Download size={14}/> {t.importModal.templateBtn}
                </button>
              </div>
            </>
          )}

          {importStep === 'map' && (
            <>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-900">{t.importModal.mapDetected.replace('{{count}}', String(csvRows.length))}</span>. {t.importModal.mapInstruction}
              </p>
              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {allImportFields.map(field => {
                  const unmapped = !colMap[field.key];
                  return (
                    <div key={field.key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-red-400">*</span>}
                        {field.isCustom && <span className="text-blue-400 text-[10px]">{t.importModal.customLabel}</span>}
                      </label>
                      {field.hint ? <p className="text-[10px] leading-snug text-gray-400 -mt-0.5">{field.hint}</p> : null}
                      <select
                        value={colMap[field.key] ?? ''}
                        onChange={e => setColMap(m => ({ ...m, [field.key]: e.target.value }))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none ${
                          unmapped ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'
                        }`}>
                        <option value="">{t.importModal.noImport}</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setImportStep('upload')} fullWidth>{tc.buttons.cancel}</Button>
                <Button onClick={() => setImportStep('preview')} fullWidth>
                  {t.importModal.viewData}
                </Button>
              </div>
            </>
          )}

          {importStep === 'preview' && (
            <>
              <p className="text-xs text-gray-500">
                {t.importModal.previewSummary
                  .replace('{{shown}}', String(Math.min(5, csvRows.length)))
                  .replace('{{total}}', String(csvRows.length))}
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {allImportFields.filter(f => colMap[f.key]).map(f => (
                        <th key={f.key} className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {allImportFields.filter(f => colMap[f.key]).map(f => (
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
                <Button variant="secondary" onClick={() => setImportStep('map')} fullWidth>{tc.buttons.back}</Button>
                <Button onClick={runImport} loading={importing} fullWidth>
                  {t.importModal.importNRows.replace('{{count}}', String(csvRows.length))}
                </Button>
              </div>
            </>
          )}

          {importStep === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500"/>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{t.importModal.importDone}</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="text-emerald-600 font-semibold">{t.importModal.importedCount.replace('{{count}}', String(importResult.success))}</span>
                  {importResult.failedRows.length > 0 && <span className="text-red-500 font-semibold ml-2">· {t.importModal.errorsCount.replace('{{count}}', String(importResult.failedRows.length))}</span>}
                </p>
                {importResult.failedRows.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t.importModal.errorsExplanation}</p>
                )}
              </div>
              {importResult.failedRows.length > 0 && (
                <div className="w-full">
                  <button
                    type="button"
                    onClick={() => setShowImportErrorDetails(v => !v)}
                    className="w-full text-sm font-medium text-primary py-1 hover:underline"
                  >
                    {showImportErrorDetails ? 'Ocultar detalles ▴' : 'Ver detalles ▾'}
                  </button>
                  {showImportErrorDetails && (
                    <div className="mt-2 max-h-64 overflow-y-auto bg-red-50 border border-red-100 rounded-xl text-left">
                      {importResult.failedRows.slice(0, 50).map((f, i) => (
                        <div key={i} className="px-4 py-2 border-b border-red-100/60 last:border-b-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{f.label}</p>
                          <p className="text-xs text-red-700 truncate">{f.reason}</p>
                        </div>
                      ))}
                      {importResult.failedRows.length > 50 && (
                        <div className="px-4 py-2 text-xs text-gray-600 text-center bg-red-100/40">
                          + {importResult.failedRows.length - 50} más
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={resetImport} fullWidth>
                {doneLabel ?? t.importModal.goToList}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
