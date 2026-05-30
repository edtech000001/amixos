'use client';

// Equipment module — web. List + add/edit modal + photo grid.
// Lazy-loaded via next/dynamic from /dashboard/modulos/equipment.
//
// Storage layout for photos lives in shared/lib/equipment.ts; this
// component is the UI on top.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Forklift,
  Plus,
  Search,
  Trash2,
  X,
  Image as ImageIcon,
  Upload,
  AlertTriangle,
  User,
  Save,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import {
  EQUIPMENT_BUCKET,
  MAX_PHOTOS_PER_EQUIPMENT,
  equipmentPhotoPath,
  equipmentPhotoUrl,
  plateExpirationDays,
  type Equipment,
  type EquipmentPhoto,
} from '@amixos/shared/lib/equipment';

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
}

const EMPTY_FORM = {
  name: '',
  equipment_type: '',
  make: '',
  model: '',
  year: '',
  vin: '',
  mileage: '',
  plate_number: '',
  plate_expiration: '',
  paid_off: false,
  loan_lender: '',
  assigned_employee_id: '',
  notes: '',
};

export default function EquipmentModule() {
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.equipment;
  const tc = full.common;

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // Map of equipment_id → first photo (for list thumbnails). Detail
  // modal loads the full set on open.
  const [coverPhotos, setCoverPhotos] = useState<Record<string, EquipmentPhoto>>({});
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<EquipmentPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const TYPE_SUGGESTIONS = useMemo(() => [
    { value: '', label: t.typePlaceholder },
    { value: t.typeSuggestions.truck, label: t.typeSuggestions.truck },
    { value: t.typeSuggestions.car, label: t.typeSuggestions.car },
    { value: t.typeSuggestions.van, label: t.typeSuggestions.van },
    { value: t.typeSuggestions.semi, label: t.typeSuggestions.semi },
    { value: t.typeSuggestions.trailer, label: t.typeSuggestions.trailer },
    { value: t.typeSuggestions.skidLoader, label: t.typeSuggestions.skidLoader },
    { value: t.typeSuggestions.tractor, label: t.typeSuggestions.tractor },
    { value: t.typeSuggestions.generator, label: t.typeSuggestions.generator },
    { value: t.typeSuggestions.other, label: t.typeSuggestions.other },
  ], [t]);

  const loadEquipment = useCallback(async () => {
    if (!business) return;
    const data = await fetchAll<Equipment>((from, to) =>
      supabase.from('equipment').select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .range(from, to),
    );
    setEquipment(data);
    // Load one photo per equipment for the list thumbnail.
    if (data.length > 0) {
      const ids = data.map(e => e.id);
      const { data: ph } = await supabase
        .from('equipment_photos')
        .select('*')
        .in('equipment_id', ids)
        .order('sort_order');
      const covers: Record<string, EquipmentPhoto> = {};
      for (const p of (ph as EquipmentPhoto[] | null) ?? []) {
        if (!covers[p.equipment_id]) covers[p.equipment_id] = p;
      }
      setCoverPhotos(covers);
    } else {
      setCoverPhotos({});
    }
  }, [business, supabase]);

  const loadEmployees = useCallback(async () => {
    if (!business) return;
    const data = await fetchAll<EmployeeOption>((from, to) =>
      supabase.from('employees').select('id, first_name, last_name')
        .eq('business_id', business.id)
        .eq('active', true)
        .order('first_name')
        .range(from, to),
    );
    setEmployees(data);
  }, [business, supabase]);

  useEffect(() => { loadEquipment(); loadEmployees(); }, [loadEquipment, loadEmployees]);

  const loadPhotosFor = useCallback(async (equipmentId: string) => {
    const { data } = await supabase
      .from('equipment_photos')
      .select('*')
      .eq('equipment_id', equipmentId)
      .order('sort_order');
    setPhotos((data as EquipmentPhoto[] | null) ?? []);
  }, [supabase]);

  const employeeName = (id: string | null) => {
    if (!id) return null;
    const e = employees.find(x => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.make ?? '').toLowerCase().includes(q) ||
      (e.model ?? '').toLowerCase().includes(q) ||
      (e.plate_number ?? '').toLowerCase().includes(q) ||
      (e.equipment_type ?? '').toLowerCase().includes(q),
    );
  }, [equipment, search]);

  const openAdd = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    setPhotos([]);
    setError('');
    setModal('add');
  };

  const openEdit = (e: Equipment) => {
    setSelected(e);
    setForm({
      name: e.name,
      equipment_type: e.equipment_type ?? '',
      make: e.make ?? '',
      model: e.model ?? '',
      year: e.year != null ? String(e.year) : '',
      vin: e.vin ?? '',
      mileage: e.mileage != null ? String(e.mileage) : '',
      plate_number: e.plate_number ?? '',
      plate_expiration: e.plate_expiration ?? '',
      paid_off: e.paid_off,
      loan_lender: e.loan_lender ?? '',
      assigned_employee_id: e.assigned_employee_id ?? '',
      notes: e.notes ?? '',
    });
    setError('');
    void loadPhotosFor(e.id);
    setModal('edit');
  };

  const save = async () => {
    if (!business) return;
    if (!form.name.trim()) {
      setError(t.nameRequiredError);
      return;
    }
    setSaving(true); setError('');
    const payload = {
      business_id: business.id,
      name: form.name.trim(),
      equipment_type: form.equipment_type.trim() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      year: form.year ? parseInt(form.year, 10) : null,
      vin: form.vin.trim() || null,
      mileage: form.mileage ? parseInt(form.mileage, 10) : null,
      plate_number: form.plate_number.trim() || null,
      plate_expiration: form.plate_expiration || null,
      paid_off: form.paid_off,
      loan_lender: form.paid_off ? null : (form.loan_lender.trim() || null),
      assigned_employee_id: form.assigned_employee_id || null,
      notes: form.notes.trim() || null,
    };
    if (modal === 'add') {
      const { data: created, error: err } = await supabase
        .from('equipment').insert({ ...payload, created_by: user?.id ?? null })
        .select().single();
      if (err) { setError(t.saveError); setSaving(false); return; }
      // After insert, set the selected to the new row so photo upload
      // lands on the right equipment_id and re-opens in edit mode.
      setSelected(created as Equipment);
      setModal('edit');
    } else if (selected) {
      const { error: err } = await supabase.from('equipment').update(payload).eq('id', selected.id);
      if (err) { setError(t.saveError); setSaving(false); return; }
    }
    await loadEquipment();
    setSaving(false);
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!confirm(t.deleteConfirmMsg)) return;
    await supabase.from('equipment').delete().eq('id', selected.id);
    // Storage objects under equipment/<business_id>/<selected.id>/ are
    // left in the bucket; the DB rows cascade-delete (the photos table
    // FK is on delete cascade). A periodic cleanup job can sweep
    // orphaned objects later.
    setModal(null); setSelected(null);
    await loadEquipment();
  };

  // ── Photo upload ───────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    if (!files || files.length === 0 || !business || !selected) return;
    if (photos.length + files.length > MAX_PHOTOS_PER_EQUIPMENT) {
      setError(t.photoLimitHit.replace('{{n}}', String(MAX_PHOTOS_PER_EQUIPMENT)));
      ev.target.value = '';
      return;
    }
    setUploadingPhoto(true); setError('');
    try {
      for (const file of Array.from(files)) {
        const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const filename = `${crypto.randomUUID()}.${ext}`;
        const path = equipmentPhotoPath(business.id, selected.id, filename);
        const { error: upErr } = await supabase.storage
          .from(EQUIPMENT_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || `image/${ext}` });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('equipment_photos').insert({
          business_id: business.id,
          equipment_id: selected.id,
          storage_path: path,
          sort_order: photos.length,
          created_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
      }
      await loadPhotosFor(selected.id);
      await loadEquipment(); // refresh cover thumbnails
    } catch {
      setError(t.photoUploadError);
    }
    setUploadingPhoto(false);
    ev.target.value = '';
  };

  const removePhoto = async (photo: EquipmentPhoto) => {
    if (!confirm(t.photoDeleteConfirm)) return;
    // Delete the DB row first; the RLS policy gates writes. Best-effort
    // storage cleanup follows.
    await supabase.from('equipment_photos').delete().eq('id', photo.id);
    await supabase.storage.from(EQUIPMENT_BUCKET).remove([photo.storage_path]);
    if (selected) await loadPhotosFor(selected.id);
    await loadEquipment();
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center">
            <Forklift size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
            <p className="text-xs text-gray-500">{t.subtitle}</p>
          </div>
        </div>
        <Button onClick={openAdd}>
          <Plus size={14} className="mr-1.5" />
          {t.addBtn}
        </Button>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Forklift size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700">{t.emptyTitle}</p>
          <p className="text-xs text-gray-500 mt-1">{t.emptyHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(e => {
            const cover = coverPhotos[e.id];
            const days = plateExpirationDays(e.plate_expiration);
            const plateBadge =
              days === null ? null
              : days < 0 ? { text: t.plateExpired, cls: 'bg-red-50 text-red-700 border-red-200' }
              : days <= 30 ? { text: t.plateExpiresSoon.replace('{{days}}', String(days)), cls: 'bg-amber-50 text-amber-700 border-amber-200' }
              : null;
            const assigned = employeeName(e.assigned_employee_id);
            return (
              <button
                key={e.id}
                onClick={() => openEdit(e)}
                className="text-left bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all overflow-hidden flex flex-col"
              >
                <div className="relative w-full aspect-video bg-gray-50 flex items-center justify-center">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={equipmentPhotoUrl(supabase, cover.storage_path)}
                      alt={e.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={32} className="text-gray-300" />
                  )}
                  {plateBadge ? (
                    <span className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${plateBadge.cls}`}>
                      <AlertTriangle size={10} /> {plateBadge.text}
                    </span>
                  ) : null}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{e.name}</p>
                    {e.paid_off ? (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{t.paidOffBadge}</span>
                    ) : e.loan_lender ? (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{t.loanBadge}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {[e.year, e.make, e.model].filter(Boolean).join(' ') || e.equipment_type || '—'}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                    <User size={12} />
                    {assigned ?? <span className="text-gray-400">{t.unassignedBadge}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Add / edit modal */}
      <Modal
        open={modal !== null}
        onClose={() => { setModal(null); setSelected(null); }}
        title={modal === 'add' ? t.addTitle : t.editTitle}
      >
        <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Basic info */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.basicInfoHeading}</p>
          <Input label={t.nameLabel} placeholder={t.namePlaceholder} value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.typeLabel}</label>
            <select value={form.equipment_type}
              onChange={e => setForm(f => ({ ...f, equipment_type: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              {TYPE_SUGGESTIONS.map(o => <option key={o.value || '__none'} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.makeLabel} placeholder={t.makePlaceholder} value={form.make}
              onChange={e => setForm(f => ({ ...f, make: e.target.value }))} />
            <Input label={t.modelLabel} placeholder={t.modelPlaceholder} value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.yearLabel} placeholder={t.yearPlaceholder} type="number" min="1900" max="2100"
              value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            <Input label={t.mileageLabel} placeholder={t.mileagePlaceholder} type="number" min="0"
              value={form.mileage} onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))} />
          </div>
          <Input label={t.vinLabel} placeholder={t.vinPlaceholder} value={form.vin}
            onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} />

          {/* Registration */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.registrationHeading}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.plateNumberLabel} placeholder={t.plateNumberPlaceholder} value={form.plate_number}
              onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))} />
            <Input label={t.plateExpirationLabel} type="date" value={form.plate_expiration}
              onChange={e => setForm(f => ({ ...f, plate_expiration: e.target.value }))} />
          </div>

          {/* Ownership */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.ownershipHeading}</p>
          <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5">
            <span className="text-sm text-gray-900">{t.paidOffLabel}</span>
            <Toggle checked={form.paid_off} onChange={v => setForm(f => ({ ...f, paid_off: v }))} />
          </label>
          {!form.paid_off ? (
            <Input label={t.loanLenderLabel} placeholder={t.loanLenderPlaceholder} value={form.loan_lender}
              onChange={e => setForm(f => ({ ...f, loan_lender: e.target.value }))} />
          ) : null}

          {/* Assignment */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.assignmentHeading}</p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.assignedToLabel}</label>
            <select value={form.assigned_employee_id}
              onChange={e => setForm(f => ({ ...f, assigned_employee_id: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              <option value="">{t.assignedToNone}</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.notesLabel}</label>
            <textarea rows={3} placeholder={t.notesPlaceholder} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
          </div>

          {/* Photos — only shown after the equipment has been saved (we need
             an id to attach photos to). */}
          {modal === 'edit' && selected ? (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.photosHeading}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onFileChosen}
                className="hidden"
              />
              {photos.length === 0 ? (
                <button type="button" onClick={onPickFile}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-500">{t.photoEmpty}</span>
                  <span className="text-xs font-semibold text-primary">{t.photoAddBtn}</span>
                </button>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map(p => (
                      <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={equipmentPhotoUrl(supabase, p.storage_path)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(p)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                          aria-label="Delete photo"
                        >
                          <X size={12} className="text-red-500" />
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS_PER_EQUIPMENT ? (
                      <button
                        type="button"
                        onClick={onPickFile}
                        className="aspect-square rounded-lg border-2 border-dashed border-gray-200 hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center"
                      >
                        <Plus size={18} className="text-gray-400" />
                      </button>
                    ) : null}
                  </div>
                  {uploadingPhoto ? (
                    <p className="text-xs text-gray-500">{t.photoUploading}</p>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {error ? <p className="text-xs text-red-500">{error}</p> : null}

          <div className="flex gap-3 pt-2">
            {modal === 'edit' && selected ? (
              <Button variant="secondary" onClick={onDelete}>
                <Trash2 size={14} className="mr-1.5" />
                {t.deleteBtn}
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => { setModal(null); setSelected(null); }}>
              {tc.buttons.cancel}
            </Button>
            <Button onClick={save} loading={saving}>
              <Save size={14} className="mr-1.5" />
              {tc.buttons.save}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
