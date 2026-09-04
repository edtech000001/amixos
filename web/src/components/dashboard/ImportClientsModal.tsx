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
import { parseClientContactsCell } from '@amixos/shared/lib/clientShare';
import { RecentImports } from './RecentImports';
import { logImportRun } from '@amixos/shared/lib/importRunners';
import { useElapsedTimer } from '@amixos/shared/lib/useElapsedTimer';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { isGoogleSyncConnected } from '@amixos/shared/lib/googleSync';
import { parseTimestamp } from '@amixos/shared/lib/dataImport';
import { US_STATE_NAME_TO_ABBR } from '@amixos/shared/lib/usStates';
import {
  buildClientIndex, matchExistingClient, clientFieldPatch, mergeContacts,
  type DuplicateStrategy, type ExistingClientLite, type ContactLite,
} from '@amixos/shared/lib/clientImportMerge';

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
  /** Business branches — adds a Branch column for multi-location businesses. */
  locations?: { id: string; name: string }[];
  onClose: () => void;
  /** Reload the caller's list after a successful import. */
  onDone?: () => void;
  /** Final-button label override (the hub shows a plain "close"). */
  doneLabel?: string;
}

export default function ImportClientsModal({ open, businessId, templates, locations, onClose, onDone, doneLabel }: Props) {
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
  const { label: elapsedLabel } = useElapsedTimer(importing);
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{
    updated?: number;
    skippedExisting?: number;
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

  // Branch column only for multi-location businesses. Not a `clients` column —
  // a matched name links the client to that one branch; blank/unknown leaves it
  // shared across every branch (the client list's default for unlinked rows).
  const multiLocation = (locations?.length ?? 0) > 1;
  const branchByName = new Map<string, string>();
  for (const l of locations ?? []) branchByName.set(l.name.trim().toLowerCase(), l.id);
  const BRANCH_FIELD = {
    key: 'branch',
    label: locale === 'en' ? 'Branch' : 'Sucursal',
    hint: locale === 'en' ? 'Blank = visible in all branches.' : 'Vacío = visible en todas las sucursales.',
  };

  // Serialized contact-people column written by "Share CSV" on a client —
  // makes moving a client between Amixos businesses a clean round trip.
  const CONTACT_PEOPLE_FIELD = {
    key: 'contact_people',
    label: t.detail.contactPeople,
    hint: locale === 'en'
      ? 'From another Amixos export — recreated as contact people.'
      : 'De otra exportación de Amixos — se recrean como personas de contacto.',
  };

  const allImportFields: { key: string; label: string; required?: boolean; isCustom?: boolean; hint?: string }[] = [
    ...CLIENT_FIELDS,
    ...(multiLocation ? [BRANCH_FIELD] : []),
    CONTACT_PEOPLE_FIELD,
    ...templates.map(tpl => ({ key: `custom:${tpl.field_key}`, label: tpl.field_label, isCustom: true })),
  ];

  const [fileName, setFileName] = useState('');
  // Import progress (per 50-row batch).
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Rows whose client already exists. The importer used to insert
  // unconditionally, so re-importing a file silently created a second copy of
  // every client and contact. Now it asks once, before writing anything.
  const [dupPrompt, setDupPrompt] = useState<{ count: number; total: number } | null>(null);
  const dupChoice = useRef<((s: DuplicateStrategy | null) => void) | null>(null);
  const askDuplicateStrategy = (count: number, total: number) =>
    new Promise<DuplicateStrategy | null>(resolve => {
      dupChoice.current = resolve;
      setDupPrompt({ count, total });
    });
  const answerDuplicates = (choice: DuplicateStrategy | null) => {
    setDupPrompt(null);
    dupChoice.current?.(choice);
    dupChoice.current = null;
  };
  const handleFileSelect = (file: File) => {
    setFileName(file.name);
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
    const batch: { entry: any; csvLine: number; originalRow: Record<string, string>; branchId: string | null; branchRaw: string; contacts?: ReturnType<typeof parseClientContactsCell>; existingId?: string | null }[] = [];
    const failedRows: { label: string; reason: string }[] = [];
    const unknownBranches = new Set<string>();
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
      // Resolve the branch cell (multi-location only). Matched → that branch;
      // blank stays shared; a non-empty unmatched name is reported but the
      // client still imports (shared).
      let branchId: string | null = null;
      let branchRaw = '';
      if (multiLocation) {
        const bCol = colMap['branch'];
        branchRaw = bCol && row[bCol] ? row[bCol].trim() : '';
        if (branchRaw) {
          branchId = branchByName.get(branchRaw.toLowerCase()) ?? null;
          if (!branchId) unknownBranches.add(branchRaw);
        }
      }
      const cpCol = colMap['contact_people'];
      const cpRaw = cpCol && row[cpCol] ? row[cpCol].trim() : '';
      batch.push({ entry, csvLine, originalRow: row, branchId, branchRaw, contacts: cpRaw ? parseClientContactsCell(cpRaw) : undefined });
    });
    // Which rows already exist? Same matching rule as the jobs importer's
    // client resolver, so the two agree on what "already exists" means.
    const { data: existingRows } = await supabase
      .from('clients')
      .select('id, first_name, last_name, company')
      .eq('business_id', businessId);
    const clientIndex = buildClientIndex((existingRows ?? []) as ExistingClientLite[]);
    for (const b of batch) {
      const full = [b.entry.first_name, b.entry.last_name].filter(Boolean).join(' ');
      b.existingId = matchExistingClient(clientIndex, full, b.entry.company);
    }
    const dupes = batch.filter(b => b.existingId);
    let strategy: DuplicateStrategy = 'skip';
    if (dupes.length) {
      const answer = await askDuplicateStrategy(dupes.length, batch.length);
      if (answer === null) { setImporting(false); setProgress(null); return; } // cancelled
      strategy = answer;
    }
    const toInsert = batch.filter(b => !b.existingId);

    let success = 0;
    let mergedCount = 0;
    const insertedIds: string[] = [];
    // Branch links to write once all clients exist (matched branches only).
    const branchLinks: { business_id: string; client_id: string; location_id: string; is_primary: boolean }[] = [];
    // Contact-people rows (from the serialized export column).
    const contactRows: { business_id: string; client_id: string; name: string; role: string | null; phone: string | null; email: string | null }[] = [];
    const queueContacts = (clientId: string, list?: ReturnType<typeof parseClientContactsCell>) => {
      (list ?? []).forEach(ct => contactRows.push({ business_id: businessId, client_id: clientId, ...ct }));
    };
    // New clients only — existing ones are handled by the strategy below.
    for (let i = 0; i < toInsert.length; i += 50) {
      setProgress({ done: i, total: batch.length });
      const slice = toInsert.slice(i, i + 50);
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
            if (d2?.id) {
              insertedIds.push(d2.id);
              if (b.branchId) branchLinks.push({ business_id: businessId, client_id: d2.id, location_id: b.branchId, is_primary: true });
              queueContacts(d2.id, b.contacts);
            }
          }
        }
      } else {
        success += slice.length;
        // A single multi-row insert returns rows in insertion order, so zip
        // the returned ids back to the slice to attach each branch link.
        if (Array.isArray(data)) {
          data.forEach((r: { id: string }, j: number) => {
            insertedIds.push(r.id);
            const b = slice[j];
            if (b?.branchId) branchLinks.push({ business_id: businessId, client_id: r.id, location_id: b.branchId, is_primary: true });
            queueContacts(r.id, b?.contacts);
          });
        }
      }
    }
    // Existing clients: apply the chosen strategy. 'skip' does nothing at all,
    // which is why it is the safe default.
    if (strategy !== 'skip') {
      for (const b of dupes) {
        const id = b.existingId!;
        const existing = (existingRows ?? []).find((r: any) => r.id === id) ?? {};
        const patch = clientFieldPatch(existing as Record<string, unknown>, b.entry, strategy);
        if (Object.keys(patch).length) {
          await supabase.from('clients').update(patch).eq('id', id);
        }
        if (b.contacts?.length) {
          const { data: have } = await supabase
            .from('client_contacts').select('id, name, email').eq('client_id', id);
          const plan = mergeContacts((have ?? []) as ContactLite[], b.contacts, strategy);
          if (strategy === 'replace' && (have ?? []).length) {
            await supabase.from('client_contacts').delete().eq('client_id', id);
          }
          if (plan.toInsert.length) {
            await supabase.from('client_contacts')
              .insert(plan.toInsert.map(ct => ({ business_id: businessId, client_id: id, ...ct })));
          }
        }
        mergedCount++;
      }
    }

    // Write branch links in chunks. Best-effort — a failure here doesn't undo
    // the imported clients (they just stay shared across branches).
    for (let i = 0; i < branchLinks.length; i += 200) {
      await supabase.from('client_locations').insert(branchLinks.slice(i, i + 200));
    }
    // Best-effort contact recreation from the export column.
    for (let i = 0; i < contactRows.length; i += 200) {
      await supabase.from('client_contacts').insert(contactRows.slice(i, i + 200));
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
    // Surface unmatched branch names as a warning row (clients still imported,
    // just left shared across all branches).
    if (unknownBranches.size) {
      const shown = Array.from(unknownBranches).slice(0, 10).join(', ');
      failedRows.push({
        label: locale === 'en' ? 'Unrecognized branches' : 'Sucursales no reconocidas',
        reason: locale === 'en'
          ? `${shown} — clients imported as shared (all branches).`
          : `${shown} — clientes importados como compartidos (todas las sucursales).`,
      });
    }
    setImportResult({ success, failedRows, updated: mergedCount, skippedExisting: strategy === 'skip' ? dupes.length : 0 });
    // Audit trail (migration 137). skipped = existing clients left untouched.
    void logImportRun(supabase, businessId, 'clients', fileName || null, {
      success, skipped: strategy === 'skip' ? dupes.length : 0, failedRows,
    });
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
      ...(multiLocation ? [BRANCH_FIELD.label] : []),
      ...templates.map(tpl => tpl.field_label),
    ];
    const example = ['Juan', 'Pérez', 'Construcciones JP', '555-1234', '555-5678', 'jp@empresa.com', 'juan@personal.com', '123 Main St', 'Omaha', 'NE', '68102', '', '6/9/2026 8:00', '6/12/2026 4:45 PM',
      ...(multiLocation ? [locations?.[0]?.name ?? ''] : []),
      ...templates.map(() => '')];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = t.importModal.templateFilename; a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportStep('upload'); setCsvHeaders([]); setCsvRows([]); setColMap({});
    setImportResult({ success: 0, failedRows: [], updated: 0, skippedExisting: 0 }); setShowImportErrorDetails(false);
    onClose();
  };


  // Duplicate prompt. Rendered above everything else and blocks the run —
  // runImport awaits the answer, so nothing is written until a choice is made.
  const duplicateDialog = dupPrompt ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md bg-card rounded-2xl shadow-xl p-5">
        <h3 className="text-base font-bold text-ink">{t.dupTitle}</h3>
        <p className="text-sm text-muted mt-1">
          {t.dupBody.replace('{{count}}', String(dupPrompt.count)).replace('{{total}}', String(dupPrompt.total))}
        </p>
        <div className="flex flex-col gap-2 mt-4">
          <button type="button" onClick={() => answerDuplicates('merge')}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-surface">
            <span className="block text-sm font-semibold text-ink">{t.dupMerge}</span>
            <span className="block text-xs text-faint mt-0.5">{t.dupMergeHint}</span>
          </button>
          <button type="button" onClick={() => answerDuplicates('replace')}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-surface">
            <span className="block text-sm font-semibold text-ink">{t.dupReplace}</span>
            <span className="block text-xs text-faint mt-0.5">{t.dupReplaceHint}</span>
          </button>
          <button type="button" onClick={() => answerDuplicates('skip')}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-surface">
            <span className="block text-sm font-semibold text-ink">{t.dupSkip}</span>
            <span className="block text-xs text-faint mt-0.5">{t.dupSkipHint}</span>
          </button>
        </div>
        <button type="button" onClick={() => answerDuplicates(null)}
          className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:bg-surface">
          {tc.buttons.cancel}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {duplicateDialog}
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
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary hover:bg-primary/5'
                }`}>
                <Upload size={32} className={`mx-auto mb-3 transition-colors ${dragOver ? 'text-primary' : 'text-faint'}`}/>
                <p className="text-sm font-semibold text-ink">{t.importModal.uploadPrimary}</p>
                <p className="text-xs text-faint mt-1">{t.importModal.uploadSecondary}</p>
              </div>
              <div className="flex items-center justify-between bg-surface rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-ink">{t.importModal.templatePromptTitle}</p>
                  <p className="text-xs text-faint">{t.importModal.templatePromptSub}</p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                  <Download size={14}/> {t.importModal.templateBtn}
                </button>
              </div>
              <RecentImports businessId={businessId} locale={locale} />
            </>
          )}

          {importStep === 'map' && (
            <>
              <p className="text-xs text-muted">
                <span className="font-medium text-ink">{t.importModal.mapDetected.replace('{{count}}', String(csvRows.length))}</span>. {t.importModal.mapInstruction}
              </p>
              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {allImportFields.map(field => {
                  const unmapped = !colMap[field.key];
                  return (
                    <div key={field.key} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted flex items-center gap-1">
                        {field.label}
                        {field.required && <span className="text-red-400">*</span>}
                        {field.isCustom && <span className="text-blue-400 text-[10px]">{t.importModal.customLabel}</span>}
                      </label>
                      {field.hint ? <p className="text-[10px] leading-snug text-faint -mt-0.5">{field.hint}</p> : null}
                      <select
                        value={colMap[field.key] ?? ''}
                        onChange={e => setColMap(m => ({ ...m, [field.key]: e.target.value }))}
                        className={`w-full rounded-xl border px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none ${
                          unmapped ? 'border-amber-400 bg-amber-500/10' : 'border-border bg-card'
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
              <p className="text-xs text-muted">
                {t.importModal.previewSummary
                  .replace('{{shown}}', String(Math.min(5, csvRows.length)))
                  .replace('{{total}}', String(csvRows.length))}
              </p>
              <div className="overflow-x-auto rounded-xl border border-border-soft">
                <table className="w-full text-xs">
                  <thead className="bg-surface">
                    <tr>
                      {allImportFields.filter(f => colMap[f.key]).map(f => (
                        <th key={f.key} className="text-left px-3 py-2 font-semibold text-muted whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-surface">
                        {allImportFields.filter(f => colMap[f.key]).map(f => (
                          <td key={f.key} className="px-3 py-2 text-ink whitespace-nowrap max-w-[120px] truncate">
                            {row[colMap[f.key]] || <span className="text-faint">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setImportStep('map')} fullWidth>{tc.buttons.back}</Button>
                {importing && progress ? (
                  <div className="mb-2">
                    <div className="h-2 bg-border-soft rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                    </div>
                    <p className="text-[11px] text-faint mt-1 text-center">{progress.done} / {progress.total} · {elapsedLabel}</p>
                  </div>
                ) : null}
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
                <p className="text-lg font-bold text-ink">{t.importModal.importDone}</p>
                <p className="text-sm text-muted mt-1">
                  <span className="text-emerald-600 font-semibold">{t.importModal.importedCount.replace('{{count}}', String(importResult.success))}</span>
                  {importResult.failedRows.length > 0 && <span className="text-red-500 font-semibold ml-2">· {t.importModal.errorsCount.replace('{{count}}', String(importResult.failedRows.length))}</span>}
                </p>
                <p className="text-xs text-faint mt-1">{locale === 'es' ? 'Tiempo' : 'Time'}: {elapsedLabel}</p>
                {importResult.failedRows.length > 0 && (
                  <p className="text-xs text-faint mt-1">{t.importModal.errorsExplanation}</p>
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
                    <div className="mt-2 max-h-64 overflow-y-auto bg-red-500/10 border border-red-100 rounded-xl text-left">
                      {importResult.failedRows.slice(0, 50).map((f, i) => (
                        <div key={i} className="px-4 py-2 border-b border-red-100/60 last:border-b-0">
                          <p className="text-sm font-medium text-ink truncate">{f.label}</p>
                          <p className="text-xs text-red-700 truncate">{f.reason}</p>
                        </div>
                      ))}
                      {importResult.failedRows.length > 50 && (
                        <div className="px-4 py-2 text-xs text-muted text-center bg-red-100/40">
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
