'use client';

// Rental Properties module — web root. Lazy-loaded via next/dynamic from
// /dashboard/modulos/rentals.
//
// Layout: three top tabs — Resumen (rent roll), Propiedades (keyset-paged
// list → full-page PropertyDetail), Inquilinos (module-owned tenants; see
// shared/lib/rentals.ts for why tenants are NOT clients). All Supabase I/O
// stays in this module; ledger math lives in shared/lib/rentals.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonCard } from '@amixos/shared/ui/Skeleton';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { Building2, Home, Plus, Search, Users, LayoutDashboard } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { swrRead, swrWrite } from '@amixos/shared/lib/swrCache';
import { useSignedUrls } from '@amixos/shared/lib/storageUrls';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import { toUsStateAbbr, usStateName } from '@amixos/shared/lib/usStates';
import { normalizeImageFiles } from '@/lib/imageFile';
import {
  MAX_PHOTOS_PER_PROPERTY,
  PROPERTY_TYPES,
  RENTALS_BUCKET,
  rentalPropertyPhotoPath,
  rentalUid,
  type RentalLease,
  type RentalProperty,
  type RentalPropertyPhoto,
  type RentalTenant,
} from '@amixos/shared/lib/rentals';
import {
  fetchAllLeases,
  fetchAllTenants,
  fetchRentalPropertiesCount,
  fetchRentalPropertiesPage,
  generateChargesForLeases,
  generateLateFees,
  type RentalPropertyCursor,
  type RentalPropertyQueryParams,
} from '@amixos/shared/lib/rentalsQuery';
import { sanitizeMoney, withCommas } from './util';
import { PropertyDetail } from './PropertyDetail';
import { TenantsTab } from './TenantsTab';
import { RentRoll } from './RentRoll';

type TabKey = 'overview' | 'properties' | 'tenants';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const EMPTY_FORM = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  property_type: '',
  unit_count: '',
  purchase_date: '',
  purchase_price: '',
  notes: '',
  status: 'active' as 'active' | 'inactive',
  location_id: '',
};

export default function RentalsModule() {
  const supabase = createSupabaseClient();
  const { business, user, locations, activeLocationId, myHomeLocationId, currentRole } = useApp();
  const canEdit = can.editRentals(currentRole);
  const canCreate = can.createRentals(currentRole);
  const canDelete = can.deleteRentals(currentRole);
  const multiLocation = (locations?.length ?? 0) > 1;
  const { t: full, locale } = useLang();
  const t = full.dashboard.modules.rentals;
  const tc = full.common;

  const [tab, setTab] = useState<TabKey>('overview');
  const [detail, setDetail] = useState<RentalProperty | null>(null);

  // ── Properties: keyset page + search + branch scope ─────────────────────────
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverTotal, setServerTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<RentalPropertyCursor | null>(null);
  const paramsRef = useRef<RentalPropertyQueryParams | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);
  const [coverPhotos, setCoverPhotos] = useState<Record<string, RentalPropertyPhoto>>({});

  const loadCovers = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await supabase.from('rental_property_photos').select('*')
      .in('property_id', ids).order('is_cover', { ascending: false }).order('created_at');
    setCoverPhotos(prev => {
      const next = { ...prev };
      for (const p of (data as RentalPropertyPhoto[] | null) ?? []) {
        if (!next[p.property_id]) next[p.property_id] = p;
      }
      return next;
    });
  }, [supabase]);

  const runQuery = async () => {
    if (!business) return;
    const seq = ++loadSeqRef.current;
    const base: RentalPropertyQueryParams = {
      businessId: business.id,
      locationId: activeLocationId ?? null,
      search: debouncedSearch,
    };
    paramsRef.current = base;
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    const isDefault = !debouncedSearch.trim();
    const cacheKey = `rentals_props_${business.id}_${activeLocationId ?? 'all'}`;
    try {
      if (isDefault && !hydratedRef.current) {
        const cached = await swrRead<{ items: RentalProperty[]; total: number }>(cacheKey);
        if (cached?.data && seq === loadSeqRef.current && !hydratedRef.current) {
          hydratedRef.current = true;
          setProperties(cached.data.items);
          setServerTotal(cached.data.total);
          setLoading(false);
          void loadCovers(cached.data.items.map(r => r.id));
        }
      }
      const [page, total] = await Promise.all([
        fetchRentalPropertiesPage<RentalProperty>(supabase, '*', { ...base, pageSize: 50 }),
        fetchRentalPropertiesCount(supabase, base),
      ]);
      if (seq !== loadSeqRef.current) return;
      hydratedRef.current = true;
      setProperties(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
      setServerTotal(total);
      if (isDefault) void swrWrite(cacheKey, { items: page.items.slice(0, 50), total });
      setCoverPhotos({});
      await loadCovers(page.items.map(r => r.id));
    } catch (e) {
      console.error('Rentals query failed', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !cursorRef.current || !business || !paramsRef.current) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchRentalPropertiesPage<RentalProperty>(
        supabase, '*', { ...paramsRef.current, cursor: cursorRef.current, pageSize: 50 },
      );
      if (seq !== loadSeqRef.current) return;
      setProperties(prev => [...prev, ...page.items]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
      await loadCovers(page.items.map(r => r.id));
    } catch { /* keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  const reRun = () => { void runQuery(); };

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!business) return;
    void runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business, debouncedSearch, activeLocationId]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasMore && !loadingMore) void loadMore(); },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, tab]);

  // ── Tenants + leases (low-volume; loaded whole, cached) ─────────────────────
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [leases, setLeases] = useState<RentalLease[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);

  const loadPeople = useCallback(async () => {
    if (!business) return;
    try {
      const [tn, ls] = await Promise.all([
        fetchAllTenants(supabase, business.id),
        fetchAllLeases(supabase, business.id),
      ]);
      setTenants(tn);
      setLeases(ls);
      void swrWrite(`rentals_people_${business.id}`, { tenants: tn, leases: ls });
      // Materialize any missing lease-month charges (idempotent; edit-gated).
      if (canEdit) {
        // Rent first, then fees (a fee is only owed on an unpaid rent row).
        const changed = await generateChargesForLeases(supabase, ls).catch(() => false);
        const feesChanged = await generateLateFees(supabase, business.id, ls).catch(() => false);
        // Either one means the ledger moved — re-set leases so the Overview's
        // effect (keyed on the lease array) re-pulls charges and payments.
        if (changed || feesChanged) {
          const fresh = await fetchAllLeases(supabase, business.id);
          setLeases(fresh);
          void swrWrite(`rentals_people_${business.id}`, { tenants: tn, leases: fresh });
        }
      }
    } finally {
      setPeopleLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, canEdit]);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    void swrRead<{ tenants: RentalTenant[]; leases: RentalLease[] }>(`rentals_people_${business.id}`)
      .then(cached => {
        if (cached?.data && !cancelled) {
          setTenants(prev => (prev.length ? prev : cached.data.tenants));
          setLeases(prev => (prev.length ? prev : cached.data.leases));
          setPeopleLoading(false);
        }
      });
    void loadPeople();
    return () => { cancelled = true; };
  }, [business?.id, loadPeople, business]);

  const activeLeases = useMemo(() => leases.filter(l => l.status === 'active'), [leases]);
  const activeLeaseCountByProp = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of activeLeases) m.set(l.property_id, (m.get(l.property_id) ?? 0) + 1);
    return m;
  }, [activeLeases]);

  // ── Property form modal ─────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RentalProperty | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Photos queued while ADDING (no property row yet) — uploaded after insert.
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const pendingPhotoInputRef = useRef<HTMLInputElement | null>(null);
  // NO revoke-on-cleanup here: React StrictMode (next dev) double-invokes
  // effects, so the cleanup revoked these URLs while the memo still returned
  // them — broken preview thumbnails on localhost. Blob URLs are tiny and die
  // with the page; leaking a handful per form session is fine.
  const pendingUrls = useMemo(() => pendingPhotos.map(f => URL.createObjectURL(f)), [pendingPhotos]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, location_id: activeLocationId ?? myHomeLocationId ?? '' });
    setPendingPhotos([]);
    setError('');
    setFormOpen(true);
  };

  const openEdit = (p: RentalProperty) => {
    setEditing(p);
    setForm({
      name: p.name,
      address: p.address ?? '',
      city: p.city ?? '',
      // Legacy free-text states ("Nebraska") normalize into the picker's
      // 2-letter values; unknown text passes through untouched.
      state: toUsStateAbbr(p.state),
      zip: p.zip ?? '',
      property_type: p.property_type ?? '',
      unit_count: p.unit_count ? String(p.unit_count) : '',
      purchase_date: p.purchase_date ?? '',
      purchase_price: p.purchase_price != null ? String(p.purchase_price) : '',
      notes: p.notes ?? '',
      status: p.status,
      location_id: p.location_id ?? '',
    });
    setPendingPhotos([]);
    setError('');
    setFormOpen(true);
  };

  const onPendingPhotosChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    // Copy BEFORE clearing: input.files is a LIVE FileList, so resetting
    // value empties the reference too — the old order silently dropped every
    // selection (the "photo does nothing" bug).
    const files = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    if (files.length === 0) return;
    const picked = await normalizeImageFiles(files);
    if (pendingPhotos.length + picked.length > MAX_PHOTOS_PER_PROPERTY) {
      setError(t.photos.limitHit.replace('{{max}}', String(MAX_PHOTOS_PER_PROPERTY)));
      return;
    }
    setPendingPhotos(prev => [...prev, ...picked]);
  };

  const saveProperty = async () => {
    if (!business || !form.name.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      business_id: business.id,
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      property_type: form.property_type || null,
      unit_count: form.unit_count ? parseInt(form.unit_count, 10) : null,
      purchase_date: form.purchase_date || null,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
      notes: form.notes.trim() || null,
      status: form.status,
      ...(multiLocation ? { location_id: form.location_id || null } : {}),
    };
    if (!editing) {
      const { data: created, error: err } = await supabase
        .from('rental_properties').insert({ ...payload, created_by: user?.id ?? null })
        .select().single();
      if (err) { setError(t.saveError); setSaving(false); return; }
      const row = created as RentalProperty;
      // Flush photos queued while adding, now that the row exists.
      let photoFailMsg: string | null = null;
      for (const file of pendingPhotos) {
        const path = rentalPropertyPhotoPath(business.id, row.id, rentalUid());
        const { error: upErr } = await supabase.storage.from(RENTALS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
        if (!upErr) {
          const { error: insErr } = await supabase.from('rental_property_photos').insert({
            business_id: business.id, property_id: row.id, storage_path: path,
            created_by: user?.id ?? null,
          });
          if (insErr) photoFailMsg = insErr.message;
        } else photoFailMsg = upErr.message;
      }
      if (photoFailMsg) window.alert(`${t.photos.uploadError}\n\n${photoFailMsg}`);
      if (pendingPhotos.length) { setCoverPhotos({}); void loadCovers([row.id]); }
      setPendingPhotos([]);
      void logAudit(supabase, business.id, 'rental_property.created', 'rental_property', row.id, { name: payload.name });
    } else {
      const { error: err } = await supabase.from('rental_properties').update(payload).eq('id', editing.id);
      if (err) { setError(t.saveError); setSaving(false); return; }
      if (detail?.id === editing.id) setDetail({ ...detail, ...payload } as RentalProperty);
      void logAudit(supabase, business.id, 'rental_property.updated', 'rental_property', editing.id, { name: payload.name });
    }
    setSaving(false);
    setFormOpen(false);
    setEditing(null);
    reRun();
  };

  const deleteProperty = async (p: RentalProperty) => {
    if (!business) return;
    if (!(await confirm({ title: t.deleteConfirmTitle, message: t.deleteConfirmBody, destructive: true }))) return;
    // Collect storage paths BEFORE the cascade wipes the rows, then best-effort
    // remove the files (SQL triggers can't delete storage objects). Lease ids
    // come from the DB (not the leases state, which could be stale).
    const { data: leaseRows } = await supabase.from('rental_leases').select('id').eq('property_id', p.id);
    const leaseIds = ((leaseRows as { id: string }[] | null) ?? []).map(r => r.id);
    const emptyRes = Promise.resolve({ data: [] as { storage_path?: string; photo_path?: string | null }[] });
    const [{ data: ph }, { data: docs }, { data: pays }, { data: exps }, { data: maintPh }] = await Promise.all([
      supabase.from('rental_property_photos').select('storage_path').eq('property_id', p.id),
      leaseIds.length
        ? supabase.from('rental_lease_documents').select('storage_path').in('lease_id', leaseIds)
        : emptyRes,
      leaseIds.length
        ? supabase.from('rental_payments').select('photo_path').in('lease_id', leaseIds)
        : emptyRes,
      supabase.from('rental_expenses').select('receipt_path').eq('property_id', p.id),
      supabase.from('rental_maintenance_photos').select('storage_path, rental_maintenance!inner(property_id)').eq('rental_maintenance.property_id', p.id),
    ]);
    const { error: err } = await supabase.from('rental_properties').delete().eq('id', p.id);
    if (err) return;
    const paths = [
      ...((ph as { storage_path: string }[] | null) ?? []).map(r => r.storage_path),
      ...((docs as { storage_path: string }[] | null) ?? []).map(r => r.storage_path),
      ...((pays as { photo_path: string | null }[] | null) ?? []).map(r => r.photo_path),
      ...((exps as { receipt_path: string | null }[] | null) ?? []).map(r => r.receipt_path),
      ...((maintPh as unknown as { storage_path: string }[] | null) ?? []).map(r => r.storage_path),
    ].filter((x): x is string => !!x);
    if (paths.length) void supabase.storage.from(RENTALS_BUCKET).remove(paths).then(() => {}, () => {});
    void logAudit(supabase, business.id, 'rental_property.deleted', 'rental_property', p.id, { name: p.name });
    setDetail(null);
    void loadPeople();
    reRun();
  };

  const photoUrls = useSignedUrls(supabase, Object.values(coverPhotos).map(p => p.storage_path));

  const tabs: { key: TabKey; label: string; Icon: typeof Home }[] = [
    { key: 'overview', label: t.tabs.overview, Icon: LayoutDashboard },
    { key: 'properties', label: t.tabs.properties, Icon: Home },
    { key: 'tenants', label: t.tabs.tenants, Icon: Users },
  ];

  const propertyFormModal = (
    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t.editProperty : t.addProperty} size="lg">
      <div className="flex flex-col gap-4">
        <Input label={t.propertyForm.nameLabel} placeholder={t.propertyForm.namePlaceholder} value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label={t.propertyForm.addressLabel} value={form.address}
          onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        <div className="grid grid-cols-3 gap-3">
          <Input label={t.propertyForm.cityLabel} value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.propertyForm.stateLabel}</label>
            <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
              <option value="">—</option>
              {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
            </select>
          </div>
          <Input label={t.propertyForm.zipLabel} value={form.zip}
            onChange={e => setForm(f => ({ ...f, zip: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.propertyForm.typeLabel}</label>
            <select value={form.property_type} onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
              <option value="">—</option>
              {PROPERTY_TYPES.map(k => <option key={k} value={k}>{t.propertyTypes[k]}</option>)}
            </select>
          </div>
          <Input label={t.propertyForm.unitCountLabel} hint={t.propertyForm.unitCountHint}
            inputMode="numeric" value={form.unit_count}
            onChange={e => setForm(f => ({ ...f, unit_count: e.target.value.replace(/[^0-9]/g, '') }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={t.propertyForm.purchaseDateLabel} type="date" value={form.purchase_date}
            onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
          <Input label={t.propertyForm.purchasePriceLabel} leftIcon={<span className="text-sm">$</span>}
            value={withCommas(form.purchase_price)}
            onChange={e => setForm(f => ({ ...f, purchase_price: sanitizeMoney(e.target.value) }))} />
        </div>
        {multiLocation && (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.propertyForm.branchLabel}</label>
            <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
              <option value="">—</option>
              {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {editing ? (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.propertyForm.statusLabel}</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
              <option value="active">{t.propertyStatus.active}</option>
              <option value="inactive">{t.propertyStatus.inactive}</option>
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">{t.propertyForm.notesLabel}</label>
          <textarea rows={3} value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        {/* Photos while ADDING (uploaded after the row is created). Editing an
            existing property manages photos from its Fotos tab. */}
        {!editing ? (
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">{t.photos.heading}</label>
            <div className="flex flex-wrap gap-2">
              {pendingPhotos.map((f, i) => (
                <div key={pendingUrls[i]} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden border border-border-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                  <button type="button"
                    onClick={() => setPendingPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px]">
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => pendingPhotoInputRef.current?.click()}
                className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-border flex items-center justify-center text-faint hover:bg-surface">
                <Plus size={18} />
              </button>
            </div>
            <input ref={pendingPhotoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPendingPhotosChosen} />
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFormOpen(false)}>{tc.buttons.cancel}</Button>
          <Button onClick={saveProperty} loading={saving} disabled={!form.name.trim()}>{tc.buttons.save}</Button>
        </div>
      </div>
    </Modal>
  );

  if (detail) {
    return (
      <>
        <PropertyDetail
          property={detail}
          tenants={tenants}
          canEdit={canEdit}
          canCreate={canCreate}
          canDelete={canDelete}
          onBack={() => setDetail(null)}
          onEdit={() => openEdit(detail)}
          onDelete={() => deleteProperty(detail)}
          onDataChanged={() => { void loadPeople(); }}
          onCoversChanged={() => { setCoverPhotos({}); void loadCovers([detail.id]); }}
        />
        {propertyFormModal}
      </>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
            <p className="text-xs text-muted">
              {t.propertiesCount.replace('{{count}}', String(serverTotal))} · {t.subtitle}
            </p>
          </div>
        </div>
        {canCreate && tab === 'properties' ? (
          <Button onClick={openAdd}>
            <Plus size={14} className="mr-1.5" />
            {t.addProperty}
          </Button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-border-soft">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <RentRoll
          supabase={supabase}
          businessId={business?.id ?? null}
          properties={properties}
          tenants={tenants}
          leases={leases}
          loading={peopleLoading}
          onOpenProperty={(id) => {
            const p = properties.find(x => x.id === id);
            if (p) setDetail(p);
          }}
        />
      ) : null}

      {tab === 'tenants' ? (
        <TenantsTab
          supabase={supabase}
          businessId={business?.id ?? null}
          userId={user?.id ?? null}
          tenants={tenants}
          leases={leases}
          loading={peopleLoading}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          onChanged={() => { void loadPeople(); }}
        />
      ) : null}

      {tab === 'properties' ? (
        <>
          <div className="relative mb-5">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {loading && properties.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} lines={3} />)}
            </div>
          ) : properties.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border-soft p-10 text-center">
              <Building2 size={36} className="text-faint mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink">{t.emptyTitle}</p>
              <p className="text-xs text-muted mt-1">{t.emptyHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {properties.map(p => {
                const cover = coverPhotos[p.id];
                const activeCount = activeLeaseCountByProp.get(p.id) ?? 0;
                const capacity = Math.max(1, p.unit_count ?? 1);
                const vacant = p.status === 'active' && activeCount < capacity;
                return (
                  <button
                    key={p.id}
                    onClick={() => setDetail(p)}
                    className="text-left bg-card rounded-2xl border border-border-soft hover:border-border hover:shadow-sm transition-all overflow-hidden flex flex-col"
                  >
                    <div className="relative w-full aspect-video bg-surface overflow-hidden">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrls[cover.storage_path] ?? undefined} alt={p.name}
                          className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Home size={40} className="text-faint" />
                        </div>
                      )}
                      {p.status === 'inactive' ? (
                        <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-700 text-white">
                          {t.propertyStatus.inactive}
                        </span>
                      ) : vacant ? (
                        <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-sm">
                          {t.overview.occupiedOf.replace('{{occupied}}', String(activeCount)).replace('{{capacity}}', String(capacity))}
                        </span>
                      ) : null}
                    </div>
                    <div className="p-4">
                      <p className="text-base font-semibold text-ink truncate">{p.name}</p>
                      <p className="text-xs text-muted truncate mt-0.5">
                        {[p.address, p.city].filter(Boolean).join(', ') || (p.property_type ? t.propertyTypes[p.property_type] : '—')}
                      </p>
                      <p className="text-xs text-muted mt-1.5 inline-flex items-center gap-1">
                        <Users size={12} />
                        {activeCount} · {p.property_type ? t.propertyTypes[p.property_type] : '—'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div ref={sentinelRef} />
          {loadingMore ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={3} />)}
            </div>
          ) : null}
        </>
      ) : null}

      {propertyFormModal}
    </div>
  );
}
