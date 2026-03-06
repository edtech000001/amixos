'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { Plus, Search, Phone, Mail, Building2, MapPin, Pencil, Trash2, User, Upload, Download, CheckCircle2, Sliders, GripVertical, X } from 'lucide-react';
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
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} cliente${selectedIds.size > 1 ? 's' : ''} permanentemente?`)) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const { error: e } = await supabase.from('clients').delete().in('id', ids);
    if (!e) {
      setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    }
    setDeleting(false);
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
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, errors: 0 });

  // Fields available for mapping
  const CLIENT_FIELDS: { key: string; label: string; required?: boolean }[] = [
    { key: 'first_name',   label: 'Nombre' },
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

  // Includes custom field templates so the mapper shows them too
  const allImportFields: { key: string; label: string; required?: boolean; isCustom?: boolean }[] = [
    ...CLIENT_FIELDS,
    ...templates.map(t => ({ key: `custom:${t.field_key}`, label: t.field_label, isCustom: true })),
  ];

  const handleFileSelect = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        setCsvHeaders(headers);
        setCsvRows(result.data);
        // Auto-map columns with similar names (standard + custom fields)
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
      // DB has NOT NULL on both name columns — default to '' to avoid constraint violations
      if (!entry.last_name) entry.last_name = '';
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
    const headers = ['Nombre', 'Apellido', 'Empresa', 'Celular', 'Telefono oficina', 'Correo oficina', 'Correo personal', 'Direccion', 'Ciudad', 'Estado', 'Codigo postal', 'Notas',
      ...templates.map(t => t.field_label)];
    const example = ['Juan', 'Pérez', 'Construcciones JP', '555-1234', '555-5678', 'jp@empresa.com', 'juan@personal.com', '123 Main St', 'Omaha', 'NE', '68102', 'Cliente frecuente',
      ...templates.map(() => '')];
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


  // ── Field template manager state ─────────────────────────────────────────
  const FIELD_TYPES: Record<string, string> = {
    text: 'Texto', number: 'Número', date: 'Fecha', boolean: 'Sí / No', select: 'Lista de opciones',
  };
  const [camposModal, setCamposModal] = useState(false);
  const [addFieldModal, setAddFieldModal] = useState(false);
  const [editFieldModal, setEditFieldModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<FieldTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

  const toKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('client_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setTemplates(data ?? []);
  };

  const addTemplate = async () => {
    if (!tplForm.field_label.trim()) { setTplError('El nombre del campo es requerido'); return; }
    const key = toKey(tplForm.field_label);
    if (templates.some(t => t.field_key === key)) { setTplError('Ya existe un campo con ese nombre'); return; }
    setSavingTpl(true); setTplError('');
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean)
      : null;
    const { error } = await supabase.from('client_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type, field_options: options,
      required: tplForm.required, sort_order: templates.length,
    });
    if (error) { setTplError('Error al guardar.'); setSavingTpl(false); return; }
    await loadTemplates();
    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingTpl(false); setAddFieldModal(false);
  };

  const removeTemplate = async (id: string) => {
    if (!confirm('¿Eliminar este campo? Los datos en clientes existentes se perderán.')) return;
    await supabase.from('client_field_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const openEditTemplate = (tpl: FieldTemplate) => {
    setEditingTpl(tpl);
    setTplForm({
      field_label: tpl.field_label,
      field_type: tpl.field_type,
      required: tpl.required,
      options_raw: tpl.field_options?.join('\n') ?? '',
    });
    setTplError('');
    setEditFieldModal(true);
  };

  const updateTemplate = async () => {
    if (!editingTpl || !tplForm.field_label.trim()) { setTplError('El nombre del campo es requerido'); return; }
    setSavingTpl(true); setTplError('');
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean)
      : null;
    const { error } = await supabase.from('client_field_templates').update({
      field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type,
      field_options: options,
      required: tplForm.required,
    }).eq('id', editingTpl.id);
    if (error) { setTplError('Error al guardar.'); setSavingTpl(false); return; }
    await loadTemplates();
    setSavingTpl(false);
    setEditFieldModal(false);
    setEditingTpl(null);
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
          <Button variant="secondary" size="md" onClick={() => setCamposModal(true)} title="Campos personalizados">
            <Sliders size={15} className="mr-1.5"/> Campos
          </Button>
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
          onChange={e => { setSearch(e.target.value); setSelectedIds(new Set()); }} leftIcon={<Search size={16}/>}/>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
          <button onClick={() => setSelectedIds(new Set())} className="p-1 rounded hover:bg-primary/10 transition-colors">
            <X size={14} className="text-primary"/>
          </button>
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex-1"/>
          <Button variant="danger" size="sm" onClick={bulkDelete} loading={deleting}>
            <Trash2 size={14} className="mr-1.5"/> Eliminar
          </Button>
        </div>
      )}

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
          {/* Select all header */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-100 bg-gray-50/50">
              <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"/>
              <span className="text-xs text-gray-400">Seleccionar todos</span>
            </div>
          )}
          {filtered.map((c, i) => {
            const phone = displayPhone(c);
            const email = displayEmail(c);
            const isChecked = selectedIds.has(c.id);
            return (
              <div key={c.id} className={`flex items-center justify-between px-5 py-4 ${i < filtered.length-1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors ${isChecked ? 'bg-primary/[0.03]' : ''}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer shrink-0"/>
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
                </div>
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
                <Input label="Nombre" placeholder="Juan" value={form.first_name}
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
              <div className="grid grid-cols-[1fr_100px_110px] gap-3">
                <Input label="Ciudad" placeholder="Omaha" value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Estado</label>
                  <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
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
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
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
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:border-transparent"/>
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
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:border-transparent resize-none"/>
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
                {allImportFields.map(field => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-red-400">*</span>}
                      {field.isCustom && <span className="text-blue-400 text-[10px]">personalizado</span>}
                    </label>
                    <select
                      value={colMap[field.key] ?? ''}
                      onChange={e => setColMap(m => ({ ...m, [field.key]: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                      <option value="">— No importar —</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setImportStep('upload')} fullWidth>Cancelar</Button>
                <Button onClick={() => setImportStep('preview')} fullWidth>
                  Ver datos
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

      {/* ── Campos personalizados manager ───────────────────────────────── */}
      <Modal open={camposModal} onClose={() => setCamposModal(false)} title="Campos personalizados de clientes" size="md">
        <div className="flex flex-col gap-4">
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-600">
              Agrega campos extra que aparecerán en el formulario de cada cliente — ideal para datos específicos de tu negocio como "Número de contrato", "Tipo de servicio", etc.
            </p>
          </div>

          {templates.length === 0 ? (
            <div className="py-8 text-center text-gray-400">
              <Sliders size={28} className="mx-auto mb-2 opacity-30"/>
              <p className="text-sm">Sin campos personalizados.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
              {templates.map(tpl => (
                <div key={tpl.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                  <GripVertical size={14} className="text-gray-300 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{tpl.field_label}</span>
                      {tpl.required && (
                        <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">Requerido</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {FIELD_TYPES[tpl.field_type]}
                      {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                    </p>
                  </div>
                  <button onClick={() => openEditTemplate(tpl)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0">
                    <Pencil size={13} className="text-blue-400"/>
                  </button>
                  <button onClick={() => removeTemplate(tpl.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 size={13} className="text-red-400"/>
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button onClick={() => { setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' }); setTplError(''); setAddFieldModal(true); }} fullWidth variant="secondary">
            <Plus size={14} className="mr-1.5"/> Agregar campo
          </Button>
        </div>
      </Modal>

      {/* ── Add field modal ─────────────────────────────────────────────── */}
      <Modal open={addFieldModal} onClose={() => setAddFieldModal(false)} title="Nuevo campo personalizado" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Nombre del campo *" placeholder="ej. Número de contrato"
            value={tplForm.field_label}
            onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {tplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              Clave: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(tplForm.field_label)}</code>
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Tipo de campo</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Opciones <span className="text-gray-400 font-normal">(una por línea)</span>
              </label>
              <textarea rows={4} placeholder={"Opción 1\nOpción 2\nOpción 3"}
                value={tplForm.options_raw}
                onChange={e => setTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}

          {/* Fixed toggle — div wrapper, not label */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={tplForm.required}
              onClick={() => setTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${
                tplForm.required ? 'bg-primary' : 'bg-gray-200'
              }`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                tplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
            <span className="text-sm text-gray-700 select-none">Campo requerido</span>
          </div>

          {tplError && <p className="text-xs text-red-500">{tplError}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddFieldModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={addTemplate} loading={savingTpl} fullWidth>Agregar campo</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit field modal ─────────────────────────────────────────────── */}
      <Modal open={editFieldModal} onClose={() => setEditFieldModal(false)} title="Editar campo personalizado" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Nombre del campo *" placeholder="ej. Número de contrato"
            value={tplForm.field_label}
            onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Tipo de campo</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Opciones <span className="text-gray-400 font-normal">(una por línea)</span>
              </label>
              <textarea rows={4} placeholder={"Opción 1\nOpción 2\nOpción 3"}
                value={tplForm.options_raw}
                onChange={e => setTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={tplForm.required}
              onClick={() => setTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${
                tplForm.required ? 'bg-primary' : 'bg-gray-200'
              }`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                tplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
            <span className="text-sm text-gray-700 select-none">Campo requerido</span>
          </div>

          {tplError && <p className="text-xs text-red-500">{tplError}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditFieldModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={updateTemplate} loading={savingTpl} fullWidth>Guardar cambios</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
