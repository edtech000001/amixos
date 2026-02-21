'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { Plus, Search, Phone, Mail, Building2, MapPin, Pencil, Trash2, User, Upload, Download, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
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

const EMPTY_FORM = {
  first_name: '', last_name: '', company: '',
  phone_cell: '', phone_office: '',
  email_office: '', email_home: '',
  address: '', address_line2: '', city: '', state: '', zip_code: '',
  notes: '',
};

// US States
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

function displayPhone(c: Client) {
  return c.phone_cell ?? c.phone ?? null;
}
function displayEmail(c: Client) {
  return c.email_office ?? c.email ?? null;
}

export default function ClientesPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customVals, setCustomVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setCustomVals({});
    setError(''); setModal('add');
  };

  const openEdit = (c: Client) => {
    setSelected(c);
    setForm({
      first_name: c.first_name, last_name: c.last_name, company: c.company ?? '',
      phone_cell: c.phone_cell ?? c.phone ?? '', phone_office: c.phone_office ?? '',
      email_office: c.email_office ?? c.email ?? '', email_home: c.email_home ?? '',
      address: c.address ?? '', address_line2: c.address_line2 ?? '',
      city: c.city ?? '', state: c.state ?? '', zip_code: c.zip_code ?? '',
      notes: c.notes ?? '',
    });
    setCustomVals(c.custom_fields ?? {});
    setError(''); setModal('edit');
  };

  const save = async () => {
    if (!form.first_name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');

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
      custom_fields: Object.keys(customVals).length > 0 ? customVals : null,
    };

    if (modal === 'add') {
      const { error: e } = await supabase.from('clients').insert({ ...payload, business_id: business!.id });
      if (e) { setError('Error al guardar.'); setSaving(false); return; }
    } else if (modal === 'edit' && selected) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', selected.id);
      if (e) { setError('Error al guardar.'); setSaving(false); return; }
    }
    await load(); setSaving(false); setModal(null);
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este cliente permanentemente?')) return;
    await supabase.from('clients').delete().eq('id', id);
    setClients(prev => prev.filter(c => c.id !== id));
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return [
      c.first_name, c.last_name, c.company,
      c.phone_cell, c.phone, c.phone_office,
      c.email_office, c.email, c.city,
    ].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  // ── Import state ──────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importModal, setImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [colMap, setColMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, errors: 0 });

  // Fields available for mapping
  const CLIENT_FIELDS: { key: string; label: string; required?: boolean }[] = [
    { key: 'first_name',   label: 'Nombre',            required: true },
    { key: 'last_name',    label: 'Apellido' },
    { key: 'company',      label: 'Empresa' },
    { key: 'phone_cell',   label: 'Celular' },
    { key: 'phone_office', label: 'Teléfono oficina' },
    { key: 'email_office', label: 'Correo oficina' },
    { key: 'email_home',   label: 'Correo personal' },
    { key: 'address',      label: 'Dirección' },
    { key: 'city',         label: 'Ciudad' },
    { key: 'state',        label: 'Estado' },
    { key: 'zip_code',     label: 'Código postal' },
    { key: 'notes',        label: 'Notas' },
  ];

  const handleFileSelect = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        setCsvHeaders(headers);
        setCsvRows(result.data);
        // Auto-map columns with similar names
        const auto: Record<string, string> = {};
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
        CLIENT_FIELDS.forEach(field => {
          const fNorm = normalize(field.label);
          const fKey = normalize(field.key);
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
      CLIENT_FIELDS.forEach(field => {
        const col = colMap[field.key];
        if (col && row[col] !== undefined) {
          entry[field.key] = row[col].trim() || null;
        }
      });
      if (!entry.first_name) { errors++; continue; }
      batch.push(entry);
    }
    // Insert in batches of 50
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
    const headers = ['Nombre', 'Apellido', 'Empresa', 'Celular', 'Telefono oficina', 'Correo oficina', 'Correo personal', 'Direccion', 'Ciudad', 'Estado', 'Codigo postal', 'Notas'];
    const example = ['Juan', 'Pérez', 'Construcciones JP', '555-1234', '555-5678', 'jp@empresa.com', 'juan@personal.com', '123 Main St', 'Omaha', 'NE', '68102', 'Cliente frecuente'];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_clientes.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setImportStep('upload'); setCsvHeaders([]); setCsvRows([]); setColMap({});
    setImportResult({ success: 0, errors: 0 }); setImportModal(false);
  };


  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} en total</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={() => { setImportStep('upload'); setImportModal(true); }}>
            <Upload size={15} className="mr-1.5"/> Importar
          </Button>
          <Button onClick={openAdd} size="md">
            <Plus size={15} className="mr-1.5"/> Nuevo cliente
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input placeholder="Buscar por nombre, empresa, teléfono, ciudad..." value={search}
          onChange={e => setSearch(e.target.value)} leftIcon={<Search size={16}/>}/>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <User size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">{search ? 'Sin resultados.' : 'Aún no tienes clientes.'}</p>
          {!search && <button onClick={openAdd} className="text-primary text-sm font-medium hover:underline mt-1">Agrega el primero →</button>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map((c, i) => {
            const phone = displayPhone(c);
            const email = displayEmail(c);
            return (
              <div key={c.id} className={`flex items-center justify-between px-5 py-4 ${i < filtered.length-1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                <Link href={`/dashboard/clientes/${c.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-sm font-bold">
                      {c.first_name.charAt(0).toUpperCase()}{c.last_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {c.first_name} {c.last_name}
                      {c.company && <span className="text-gray-400 font-normal ml-1.5">· {c.company}</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      {phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={11}/>{phone}</span>}
                      {email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={11}/>{email}</span>}
                      {c.city && <span className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11}/>{c.city}{c.state ? `, ${c.state}` : ''}</span>}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <Pencil size={14} className="text-gray-400"/>
                  </button>
                  <button onClick={() => remove(c.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={14} className="text-red-400"/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'add' ? 'Nuevo cliente' : 'Editar cliente'} size="lg">
        <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* ── Información básica */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Información básica</p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Nombre *" placeholder="Juan" value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                <Input label="Apellido" placeholder="Pérez" value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
              <Input label="Empresa" placeholder="Construcciones Ramírez" value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                leftIcon={<Building2 size={15}/>}/>
            </div>
          </section>

          {/* ── Teléfonos */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Teléfonos</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Celular" placeholder="+1 (555) 000-0000" value={form.phone_cell}
                onChange={e => setForm(f => ({ ...f, phone_cell: e.target.value }))}
                leftIcon={<Phone size={15}/>}/>
              <Input label="Teléfono oficina" placeholder="+1 (555) 100-0000" value={form.phone_office}
                onChange={e => setForm(f => ({ ...f, phone_office: e.target.value }))}
                leftIcon={<Phone size={15}/>}/>
            </div>
          </section>

          {/* ── Correos */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Correos electrónicos</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Correo oficina" type="email" placeholder="oficina@empresa.com" value={form.email_office}
                onChange={e => setForm(f => ({ ...f, email_office: e.target.value }))}
                leftIcon={<Mail size={15}/>}/>
              <Input label="Correo personal" type="email" placeholder="juan@personal.com" value={form.email_home}
                onChange={e => setForm(f => ({ ...f, email_home: e.target.value }))}
                leftIcon={<Mail size={15}/>}/>
            </div>
          </section>

          {/* ── Dirección */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Dirección</p>
            <div className="flex flex-col gap-3">
              <Input label="Calle y número" placeholder="123 Main St" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                leftIcon={<MapPin size={15}/>}/>
              <Input label="Apartamento / Suite" placeholder="Apt 4B" value={form.address_line2}
                onChange={e => setForm(f => ({ ...f, address_line2: e.target.value }))}/>
              <div className="grid grid-cols-[1fr_120px_90px] gap-3">
                <Input label="Ciudad" placeholder="Omaha" value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Estado</label>
                  <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                    <option value="">—</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Input label="Código postal" placeholder="68102" value={form.zip_code}
                  onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))}/>
              </div>
            </div>
          </section>

          {/* ── Custom fields */}
          {templates.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Campos personalizados</p>
              <div className="grid grid-cols-2 gap-3">
                {templates.map(tpl => (
                  <div key={tpl.field_key} className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      {tpl.field_label}{tpl.required && ' *'}
                    </label>
                    {tpl.field_type === 'select' && tpl.field_options ? (
                      <select value={customVals[tpl.field_key] ?? ''}
                        onChange={e => setCustomVals(v => ({ ...v, [tpl.field_key]: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                        <option value="">—</option>
                        {tpl.field_options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : tpl.field_type === 'boolean' ? (
                      <div className="flex items-center gap-3 h-[42px]">
                        <button type="button" onClick={() => setCustomVals(v => ({ ...v, [tpl.field_key]: v[tpl.field_key] === 'true' ? 'false' : 'true' }))}
                          className={`relative w-11 h-6 rounded-full transition-colors ${customVals[tpl.field_key] === 'true' ? 'bg-primary' : 'bg-gray-200'}`}>
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${customVals[tpl.field_key] === 'true' ? 'translate-x-6' : 'translate-x-1'}`}/>
                        </button>
                        <span className="text-sm text-gray-600">{customVals[tpl.field_key] === 'true' ? 'Sí' : 'No'}</span>
                      </div>
                    ) : (
                      <input type={tpl.field_type === 'number' ? 'number' : tpl.field_type === 'date' ? 'date' : 'text'}
                        value={customVals[tpl.field_key] ?? ''}
                        onChange={e => setCustomVals(v => ({ ...v, [tpl.field_key]: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"/>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Notas */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Notas</p>
            <textarea rows={3} placeholder="Notas internas sobre este cliente..." value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"/>
          </section>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1 pb-2">
            <Button variant="secondary" onClick={() => setModal(null)} fullWidth>Cancelar</Button>
            <Button onClick={save} loading={saving} fullWidth>Guardar cliente</Button>
          </div>
        </div>
      </Modal>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}/>

      {/* ── Import Modal ─────────────────────────────────────────────────── */}
      <Modal open={importModal} onClose={resetImport}
        title={importStep === 'done' ? '¡Importación completa!' : importStep === 'preview' ? 'Vista previa' : importStep === 'map' ? 'Mapear columnas' : 'Importar clientes'}
        size="lg">
        <div className="flex flex-col gap-4">

          {/* Step: upload */}
          {importStep === 'upload' && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                <Upload size={32} className="mx-auto mb-3 text-gray-300"/>
                <p className="text-sm font-semibold text-gray-700">Haz clic para seleccionar un archivo CSV</p>
                <p className="text-xs text-gray-400 mt-1">O arrastra y suelta aquí</p>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">¿Tienes el formato correcto?</p>
                  <p className="text-xs text-gray-400">Descarga la plantilla de ejemplo</p>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
                  <Download size={14}/> Plantilla CSV
                </button>
              </div>
            </>
          )}

          {/* Step: map columns */}
          {importStep === 'map' && (
            <>
              <p className="text-xs text-gray-500">
                Archivo: <span className="font-medium text-gray-900">{csvRows.length} filas detectadas</span>. Asigna cada campo de Amixos a la columna de tu archivo.
              </p>
              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {CLIENT_FIELDS.map(field => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">
                      {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    <select
                      value={colMap[field.key] ?? ''}
                      onChange={e => setColMap(m => ({ ...m, [field.key]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                      <option value="">— No importar —</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!colMap['first_name'] && (
                <p className="text-xs text-orange-500 flex items-center gap-1">
                  <AlertCircle size={13}/> El campo "Nombre" es requerido para importar
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setImportStep('upload')} fullWidth>Atrás</Button>
                <Button onClick={() => setImportStep('preview')} disabled={!colMap['first_name']} fullWidth>
                  Vista previa →
                </Button>
              </div>
            </>
          )}

          {/* Step: preview */}
          {importStep === 'preview' && (
            <>
              <p className="text-xs text-gray-500">
                Mostrando las primeras <span className="font-medium">{Math.min(5, csvRows.length)}</span> de <span className="font-medium">{csvRows.length}</span> filas.
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {CLIENT_FIELDS.filter(f => colMap[f.key]).map(f => (
                        <th key={f.key} className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {CLIENT_FIELDS.filter(f => colMap[f.key]).map(f => (
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
                <Button variant="secondary" onClick={() => setImportStep('map')} fullWidth>Atrás</Button>
                <Button onClick={runImport} loading={importing} fullWidth>
                  Importar {csvRows.length} cliente{csvRows.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}

          {/* Step: done */}
          {importStep === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-500"/>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">Importación terminada</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="text-emerald-600 font-semibold">{importResult.success} importados</span>
                  {importResult.errors > 0 && <span className="text-red-500 font-semibold ml-2">· {importResult.errors} con error</span>}
                </p>
                {importResult.errors > 0 && (
                  <p className="text-xs text-gray-400 mt-1">Las filas con error no tenían "Nombre" o fallaron al guardar.</p>
                )}
              </div>
              <Button onClick={resetImport} fullWidth>Ver clientes</Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
