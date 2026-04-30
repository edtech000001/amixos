'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import {
  ClientsListScreen,
  type ClientListItem,
} from '@amixos/shared/screens/dashboard/ClientsListScreen';
import {
  ClientFormModal,
  type ClientFormValues,
  type ClientFieldTemplate,
} from '@amixos/shared/screens/dashboard/ClientFormModal';

interface FieldTemplate extends ClientFieldTemplate {
  id: string;
  sort_order: number;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone: string | null;
  phone_cell: string | null;
  phone_office: string | null;
  email: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

const STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
};
const normalizeState = (val: string) => {
  const t = val.trim();
  if (t.length === 2) return t.toUpperCase();
  return STATE_NAME_TO_ABBR[t.toLowerCase()] ?? t;
};

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

const FIELD_LABEL_KEYS: (keyof ClientFormValues)[] = [
  'first_name', 'last_name', 'company', 'phone_cell', 'phone_office',
  'email_office', 'email_home', 'address', 'city', 'state', 'zip_code',
];

export default function ClientesPage() {
  const { t: full } = useLang();
  const t = full.dashboard.clients;
  const tc = full.common;
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!business) return;
    const [{ data: cl }, { data: tpl }] = await Promise.all([
      supabase.from('clients').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('client_field_templates').select('*').eq('business_id', business.id).order('sort_order'),
    ]);
    setClients(cl ?? []);
    setTemplates(tpl ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const openAdd = () => { setSelected(null); setError(''); setFormMode('add'); };
  const openEdit = (c: Client) => { setSelected(c); setError(''); setFormMode('edit'); };

  const FIELD_LABELS: Record<string, string> = {
    first_name: t.fields.firstName,
    last_name: t.fields.lastName,
    company: t.fields.company,
    phone_cell: t.fields.phoneCell,
    phone_office: t.fields.phoneOffice,
    email_office: t.fields.emailOffice,
    email_home: t.fields.emailHome,
    address: t.fields.addressLine1,
    city: t.fields.city,
    state: t.fields.state,
    zip_code: t.fields.zipCode,
  };

  const save = async (form: ClientFormValues) => {
    setSaving(true); setError('');

    const req = business?.client_field_required ?? {};
    const missing: string[] = [];
    for (const key of FIELD_LABEL_KEYS) {
      if (!req[key]) continue;
      const val = form[key] as string;
      if (!val || !val.trim()) missing.push(FIELD_LABELS[key] ?? key);
    }
    for (const tpl of templates) {
      if (tpl.required && !form.custom_fields[tpl.field_key]?.trim()) {
        missing.push(tpl.field_label);
      }
    }
    if (missing.length > 0) {
      setError(t.modal.requiredError.replace('{{fields}}', missing.join(', ')));
      setSaving(false);
      return;
    }

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      company: form.company.trim() || null,
      phone_cell: form.phone_cell.trim() || null,
      phone_office: form.phone_office.trim() || null,
      email_office: form.email_office.trim() || null,
      email_home: form.email_home.trim() || null,
      address: form.address.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip_code: form.zip_code.trim() || null,
      notes: form.notes.trim() || null,
      custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : null,
    };

    if (formMode === 'add') {
      const { error: e } = await supabase.from('clients').insert({ ...payload, business_id: business!.id });
      if (e) { setError(t.modal.saveError); setSaving(false); return; }
    } else if (formMode === 'edit' && selected) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', selected.id);
      if (e) { setError(t.modal.saveError); setSaving(false); return; }
    }
    await load(); setSaving(false); setFormMode(null);
  };

  const remove = async (id: string) => {
    if (!confirm(t.confirmDeleteSingle)) return;
    await supabase.from('clients').delete().eq('id', id);
    setClients(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const listItems: ClientListItem[] = useMemo(() => clients.map(c => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    company: c.company,
    phoneDisplay: (c.phone_cell ?? c.phone) ? fmtPhone(c.phone_cell ?? c.phone ?? '') : null,
    emailDisplay: c.email_office ?? c.email,
    city: c.city,
    state: c.state,
  })), [clients]);

  const filteredIds = useMemo(() => {
    const q = search.toLowerCase();
    return new Set(
      listItems
        .filter(c => [c.firstName, c.lastName, c.company, c.phoneDisplay, c.emailDisplay, c.city]
          .filter(Boolean).join(' ').toLowerCase().includes(q))
        .map(c => c.id),
    );
  }, [listItems, search]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIds.size) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredIds));
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t.confirmDeleteBulk.replace('{{count}}', String(selectedIds.size)))) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    let hasError = false;
    for (let i = 0; i < ids.length; i += 50) {
      const { error: e } = await supabase.from('clients').delete().in('id', ids.slice(i, i + 50));
      if (e) hasError = true;
    }
    if (!hasError) {
      setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    }
    setDeleting(false);
  };

  // ── Import state ──────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importModal, setImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, errors: 0 });

  const CLIENT_FIELDS: { key: string; label: string; required?: boolean }[] = [
    { key: 'first_name',   label: t.fields.firstName },
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
  ];

  const allImportFields: { key: string; label: string; required?: boolean; isCustom?: boolean }[] = [
    ...CLIENT_FIELDS,
    ...templates.map(tpl => ({ key: `custom:${tpl.field_key}`, label: tpl.field_label, isCustom: true })),
  ];

  const sanitize = (s: string) =>
    s.replace(/[�﻿]/g, '').replace(/[^\x20-\x7E\xA0-\xFFĀ-￿]/g, '').trim();

  const handleFileSelect = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      transform: (value: string) => sanitize(value),
      transformHeader: (header: string) => sanitize(header),
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        setCsvHeaders(headers);
        setCsvRows(result.data);
        const auto: Record<string, string> = {};
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
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

  const runImport = async () => {
    setImporting(true);
    let success = 0; let errors = 0;
    const batch: any[] = [];
    for (const row of csvRows) {
      const entry: any = { business_id: business!.id };
      const customFields: Record<string, string> = {};

      CLIENT_FIELDS.forEach(field => {
        const col = colMap[field.key];
        if (col && row[col] !== undefined) {
          let val: string | null = row[col].trim() || null;
          if (field.key === 'state' && val) val = normalizeState(val);
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
      if (!entry.first_name && !entry.last_name && !entry.company) { errors++; continue; }
      if (!entry.first_name) entry.first_name = entry.last_name || entry.company || '';
      if (!entry.last_name) entry.last_name = '';
      batch.push(entry);
    }
    for (let i = 0; i < batch.length; i += 50) {
      const { error } = await supabase.from('clients').insert(batch.slice(i, i + 50));
      if (error) errors += Math.min(50, batch.length - i);
      else success += Math.min(50, batch.length - i);
    }
    setImportResult({ success, errors });
    await load();
    setImporting(false);
    setImportStep('done');
  };

  const downloadTemplate = () => {
    const headers = [
      t.fields.firstName, t.fields.lastName, t.fields.company,
      t.fields.phoneCell, t.fields.phoneOffice,
      t.fields.emailOffice, t.fields.emailHome,
      t.fields.addressLine1, t.fields.city, t.fields.state, t.fields.zipCode, t.fields.notes,
      ...templates.map(tpl => tpl.field_label),
    ];
    const example = ['Juan', 'Pérez', 'Construcciones JP', '555-1234', '555-5678', 'jp@empresa.com', 'juan@personal.com', '123 Main St', 'Omaha', 'NE', '68102', '',
      ...templates.map(() => '')];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = t.importModal.templateFilename; a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportStep('upload'); setCsvHeaders([]); setCsvRows([]); setColMap({});
    setImportResult({ success: 0, errors: 0 }); setImportModal(false);
  };

  const editById = (id: string) => {
    const c = clients.find(cl => cl.id === id);
    if (c) openEdit(c);
  };

  const initialForEdit: Partial<ClientFormValues> | undefined =
    formMode === 'edit' && selected
      ? {
          first_name: selected.first_name,
          last_name: selected.last_name,
          company: selected.company ?? '',
          phone_cell: selected.phone_cell ?? selected.phone ?? '',
          phone_office: selected.phone_office ?? '',
          email_office: selected.email_office ?? selected.email ?? '',
          email_home: selected.email_home ?? '',
          address: selected.address ?? '',
          address_line2: selected.address_line2 ?? '',
          city: selected.city ?? '',
          state: selected.state ?? '',
          zip_code: selected.zip_code ?? '',
          notes: selected.notes ?? '',
          custom_fields: selected.custom_fields ?? {},
        }
      : undefined;

  const modals = (
    <>
      <ClientFormModal
        open={formMode !== null}
        mode={formMode ?? 'add'}
        initial={initialForEdit}
        templates={templates}
        requiredFlags={business?.client_field_required ?? {}}
        saving={saving}
        error={error}
        onClose={() => setFormMode(null)}
        onSubmit={save}
      />

      {/* Hidden file input + CSV import wizard (web-only) */}
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}/>

      <Modal open={importModal} onClose={resetImport}
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
                {allImportFields.map(field => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-red-400">*</span>}
                      {field.isCustom && <span className="text-blue-400 text-[10px]">{t.importModal.customLabel}</span>}
                    </label>
                    <select
                      value={colMap[field.key] ?? ''}
                      onChange={e => setColMap(m => ({ ...m, [field.key]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                      <option value="">{t.importModal.noImport}</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
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
                  {importResult.errors > 0 && <span className="text-red-500 font-semibold ml-2">· {t.importModal.errorsCount.replace('{{count}}', String(importResult.errors))}</span>}
                </p>
                {importResult.errors > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t.importModal.errorsExplanation}</p>
                )}
              </div>
              <Button onClick={resetImport} fullWidth>{t.importModal.goToList}</Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );

  return (
    <ClientsListScreen
      loading={loading}
      clients={listItems}
      search={search}
      onSearchChange={(text) => { setSearch(text); setSelectedIds(new Set()); }}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
      onToggleSelectAll={toggleSelectAll}
      onClientPress={(id) => router.push(`/dashboard/clientes/${id}`)}
      onEditPress={editById}
      onDeletePress={remove}
      onNewClientPress={openAdd}
      onImportPress={() => { setImportStep('upload'); setImportModal(true); }}
      onBulkDeletePress={bulkDelete}
      onClearSelection={() => setSelectedIds(new Set())}
      bulkDeleting={deleting}
      bottomSlot={modals}
    />
  );
}
