'use client';

// Equipment module — web. List + add/edit modal + photo grid.
// Lazy-loaded via next/dynamic from /dashboard/modulos/equipment.
//
// Storage layout for photos lives in shared/lib/equipment.ts; this
// component is the UI on top.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import {
  Forklift,
  Plus,
  Search,
  Trash2,
  X,
  Truck,
  Upload,
  AlertTriangle,
  User,
  Save,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Check,
  Star,
  List,
  Tag,
  Wallet,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import {
  fetchEquipmentPage,
  fetchAllEquipmentMatching,
  fetchEquipmentCount,
  equipmentNeedsAll,
  type EquipmentCursor,
  type EquipmentQueryParams,
} from '@amixos/shared/lib/equipmentQuery';
import {
  EQUIPMENT_BUCKET,
  MAX_PHOTOS_PER_EQUIPMENT,
  equipmentPhotoPath,
  plateExpirationDays,
  type Equipment,
  type EquipmentPhoto,
} from '@amixos/shared/lib/equipment';
import { useSignedUrls } from '@amixos/shared/lib/storageUrls';
import { formatDateLong, formatDateTimeLong, formatPhoneInput } from '@amixos/shared/lib/format';
import { nextRotation } from '@amixos/shared/lib/jobPhotos';
import { can } from '@amixos/shared/lib/permissions';
import {
  groupEquipment,
  parseEquipmentGroupKey,
  EQUIPMENT_GROUP_KEY,
  type EquipmentGroupKey,
} from '@amixos/shared/lib/equipmentGroups';

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
  color: '',
  vin: '',
  serial_number: '',
  mileage: '',
  plate_number: '',
  plate_expiration: '',
  insurance_carrier: '',
  insurance_policy_number: '',
  insurance_agent: '',
  insurance_agent_phone: '',
  insurance_expiration: '',
  purchase_date: '',
  warranty_expiration: '',
  location: '',
  location_id: '',
  paid_off: false,
  loan_lender: '',
  value: '',
  loan_amount: '',
  assigned_employee_id: '',
  notes: '',
};

// Currency — shows cents only when present (whole amounts stay clean).
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// Keep digits + a single decimal point (max 2 places) for a money input. The
// form stores this raw string; Number() parses it on save.
function sanitizeMoney(s: string): string {
  let cleaned = s.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot !== -1) {
    // one dot only, and at most 2 decimals
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  return cleaned;
}

// Display a raw money string with thousands separators, preserving whatever
// decimals the user has typed (incl. a trailing "." mid-entry).
function withCommas(raw: string): string {
  if (!raw) return '';
  const [int, dec] = raw.split('.');
  const intFmt = int ? Number(int).toLocaleString('en-US') : '';
  return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
}

// One labeled read-only row in the detail view; renders nothing when empty.
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-sm text-ink mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// A grouped card of detail rows (mirrors the mobile detail layout) — a soft
// card holding a 2-column grid of DetailRows.
function DetailCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface px-4 py-3.5 grid grid-cols-2 gap-x-4 gap-y-3">
      {children}
    </div>
  );
}

export default function EquipmentModule() {
  const supabase = createSupabaseClient();
  const { business, user, locations, activeLocationId, myHomeLocationId, currentRole } = useApp();
  // Equipment maps to the inventory permission per the role matrix. Read-only
  // roles keep view access; add/edit/delete + photo management are gated off
  // (RLS blocks the writes server-side either way).
  const canEdit = can.editEquipment(currentRole);
  const multiLocation = (locations?.length ?? 0) > 1;
  const { t: full, locale } = useLang();
  const t = full.dashboard.modules.equipment;
  const tc = full.common;

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // Map of equipment_id → first photo (for list thumbnails). Detail
  // modal loads the full set on open.
  const [coverPhotos, setCoverPhotos] = useState<Record<string, EquipmentPhoto>>({});
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | 'detail' | null>(null);
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<EquipmentPhoto[]>([]);
  // Photos picked while ADDING (no equipment row yet) — uploaded once the row
  // is created on save.
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Full-screen photo viewer (detail view) — index into `photos`, or null.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Photos live in a private bucket — sign the list covers + the open
  // equipment's photos together, keyed by storage_path.
  const photoUrls = useSignedUrls(supabase, [
    ...Object.values(coverPhotos).map((p) => p.storage_path),
    ...photos.map((p) => p.storage_path),
  ]);

  // Local object URLs for photos queued while adding (revoked on change).
  const pendingUrls = useMemo(
    () => pendingPhotos.map((f) => URL.createObjectURL(f)),
    [pendingPhotos],
  );
  useEffect(
    () => () => { pendingUrls.forEach((u) => URL.revokeObjectURL(u)); },
    [pendingUrls],
  );

  const TYPE_SUGGESTIONS = useMemo(() => [
    { value: '', label: '—' },
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

  // ── Server-side pagination + search + grouping ──────────────────────────────
  const [serverTotal, setServerTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<EquipmentCursor | null>(null);
  const paramsRef = useRef<EquipmentQueryParams | null>(null);
  const modeRef = useRef<'page' | 'all'>('page');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load one cover photo per equipment (list thumbnail) for the given ids and
  // MERGE into the map — pages accumulate.
  const loadCovers = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data: ph } = await supabase.from('equipment_photos').select('*').in('equipment_id', ids).order('sort_order');
    setCoverPhotos(prev => {
      const next = { ...prev };
      for (const p of (ph as EquipmentPhoto[] | null) ?? []) if (!next[p.equipment_id]) next[p.equipment_id] = p;
      return next;
    });
  }, [supabase]);

  // Force-refresh one equipment's cover after a photo change (add / delete / set-cover).
  const refreshCover = useCallback(async (id: string) => {
    const { data: ph } = await supabase.from('equipment_photos').select('*').eq('equipment_id', id).order('sort_order').limit(1);
    setCoverPhotos(prev => {
      const next = { ...prev };
      const p = ((ph as EquipmentPhoto[] | null) ?? [])[0];
      if (p) next[id] = p; else delete next[id];
      return next;
    });
  }, [supabase]);

  // Plain function (not useCallback): it reads groupBy/debouncedSearch — declared
  // below — at CALL time, so it can't sit in a deps array without a TDZ. The
  // query effect (after the groupBy declaration) drives it.
  const runQuery = async () => {
    if (!business) return;
    const seq = ++loadSeqRef.current;
    const needsAll = equipmentNeedsAll(groupBy, debouncedSearch.trim().length > 0);
    const base: EquipmentQueryParams = { businessId: business.id, locationId: activeLocationId ?? null, search: debouncedSearch };
    paramsRef.current = base;
    modeRef.current = needsAll ? 'all' : 'page';
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    try {
      const countP = fetchEquipmentCount(supabase, base);
      if (needsAll) {
        const rows = await fetchAllEquipmentMatching<Equipment>(supabase, '*', base);
        const total = await countP;
        if (seq !== loadSeqRef.current) return;
        setEquipment(rows);
        setServerTotal(total);
        setCoverPhotos({});
        await loadCovers(rows.map(r => r.id));
      } else {
        const [page, total] = await Promise.all([
          fetchEquipmentPage<Equipment>(supabase, '*', { ...base, pageSize: 50 }),
          countP,
        ]);
        if (seq !== loadSeqRef.current) return;
        setEquipment(page.items);
        cursorRef.current = page.nextCursor;
        setHasMore(!!page.nextCursor);
        setServerTotal(total);
        setCoverPhotos({});
        await loadCovers(page.items.map(r => r.id));
      }
    } catch (e) {
      console.error('Equipment query failed', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || modeRef.current !== 'page' || !cursorRef.current || !business || !paramsRef.current) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchEquipmentPage<Equipment>(supabase, '*', { ...paramsRef.current, cursor: cursorRef.current, pageSize: 50 });
      if (seq !== loadSeqRef.current) return;
      setEquipment(prev => [...prev, ...page.items]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
      await loadCovers(page.items.map(r => r.id));
    } catch (e) {
      console.error('Equipment load-more failed', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const reRun = () => { void runQuery(); };

  const loadEmployees = useCallback(async () => {
    if (!business) return;
    // employees_roster (view, migration 178): names-only roster readable by
    // every member — assignee picker works without the Employees permission.
    const data = await fetchAllById<EmployeeOption>((afterId, pageSize) => {
      let q = supabase.from('employees_roster').select('id, first_name, last_name')
        .eq('business_id', business.id)
        .eq('active', true)
        .order('id', { ascending: true })
        .limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    });
    setEmployees(data);
  }, [business, supabase]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  // Debounce the search box so we don't query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

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

  // Group-by — persists across navigation + refresh, scoped per business so it
  // doesn't carry across companies.
  const groupKey = business?.id ? `${EQUIPMENT_GROUP_KEY}.${business.id}` : EQUIPMENT_GROUP_KEY;
  const [groupBy, setGroupBy] = useState<EquipmentGroupKey>('none');
  const [groupHydrated, setGroupHydrated] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') setGroupBy(parseEquipmentGroupKey(window.localStorage.getItem(groupKey)));
    setGroupHydrated(true);
  }, [groupKey]);
  useEffect(() => {
    if (!groupHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(groupKey, groupBy);
  }, [groupHydrated, groupKey, groupBy]);
  // Drive the server query: re-run on branch / group / debounced-search change,
  // once the saved group-by has hydrated so the first query uses it. 'none' (and
  // any search) pages; a real grouping loads all matching and groups.
  useEffect(() => {
    if (!business || !groupHydrated) return;
    void runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business, groupHydrated, debouncedSearch, groupBy, activeLocationId]);
  // Infinite scroll (flat/search view): load the next page when the sentinel nears view.
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
  }, [hasMore, loadingMore]);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupOptions: { key: EquipmentGroupKey; label: string; Icon: LucideIcon }[] = [
    { key: 'none', label: t.groups.none, Icon: List },
    { key: 'lead', label: t.groups.lead, Icon: User },
    { key: 'type', label: t.groups.type, Icon: Tag },
    { key: 'property', label: t.groups.property, Icon: Wallet },
    { key: 'expiration', label: t.groups.expiration, Icon: CalendarClock },
  ];
  const sections = useMemo(
    () =>
      groupEquipment(filtered, groupBy, search.trim().length > 0, {
        leadName: employeeName,
        labels: {
          unassigned: t.groups.unassigned,
          noType: t.groups.noType,
          paid: t.groups.paid,
          financed: t.groups.financed,
          expired: t.groups.expired,
          expiringSoon: t.groups.expiringSoon,
          valid: t.groups.valid,
          noPlate: t.groups.noPlate,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, groupBy, search, employees],
  );

  const openAdd = () => {
    setSelected(null);
    // Auto-file new equipment to the branch you're viewing, else your home branch.
    setForm({ ...EMPTY_FORM, location_id: activeLocationId ?? myHomeLocationId ?? '' });
    setPhotos([]);
    setPendingPhotos([]);
    setError('');
    setModal('add');
  };

  const openDetail = (e: Equipment) => {
    setSelected(e);
    setError('');
    void loadPhotosFor(e.id);
    setModal('detail');
  };

  const openEdit = (e: Equipment) => {
    setSelected(e);
    setForm({
      name: e.name,
      equipment_type: e.equipment_type ?? '',
      make: e.make ?? '',
      model: e.model ?? '',
      year: e.year != null ? String(e.year) : '',
      color: e.color ?? '',
      vin: e.vin ?? '',
      serial_number: e.serial_number ?? '',
      mileage: e.mileage != null ? String(e.mileage) : '',
      plate_number: e.plate_number ?? '',
      plate_expiration: e.plate_expiration ?? '',
      insurance_carrier: e.insurance_carrier ?? '',
      insurance_policy_number: e.insurance_policy_number ?? '',
      insurance_agent: e.insurance_agent ?? '',
      insurance_agent_phone: e.insurance_agent_phone ?? '',
      insurance_expiration: e.insurance_expiration ?? '',
      purchase_date: e.purchase_date ?? '',
      warranty_expiration: e.warranty_expiration ?? '',
      location: e.location ?? '',
      location_id: (e as { location_id?: string | null }).location_id ?? '',
      paid_off: e.paid_off,
      loan_lender: e.loan_lender ?? '',
      value: e.value != null ? String(e.value) : '',
      loan_amount: e.loan_amount != null ? String(e.loan_amount) : '',
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
      color: form.color.trim() || null,
      vin: form.vin.trim() || null,
      serial_number: form.serial_number.trim() || null,
      mileage: form.mileage ? parseInt(form.mileage, 10) : null,
      plate_number: form.plate_number.trim() || null,
      plate_expiration: form.plate_expiration || null,
      insurance_carrier: form.insurance_carrier.trim() || null,
      insurance_policy_number: form.insurance_policy_number.trim() || null,
      insurance_agent: form.insurance_agent.trim() || null,
      insurance_agent_phone: form.insurance_agent_phone.trim() || null,
      insurance_expiration: form.insurance_expiration || null,
      purchase_date: form.purchase_date || null,
      warranty_expiration: form.warranty_expiration || null,
      location: form.location.trim() || null,
      ...(multiLocation ? { location_id: form.location_id || null } : {}),
      paid_off: form.paid_off,
      loan_lender: form.paid_off ? null : (form.loan_lender.trim() || null),
      value: form.value ? Number(form.value) : null,
      loan_amount: form.paid_off ? null : (form.loan_amount ? Number(form.loan_amount) : null),
      assigned_employee_id: form.assigned_employee_id || null,
      notes: form.notes.trim() || null,
    };
    if (modal === 'add') {
      const { data: created, error: err } = await supabase
        .from('equipment').insert({ ...payload, created_by: user?.id ?? null })
        .select().single();
      if (err) { setError(t.saveError); setSaving(false); return; }
      const newRow = created as Equipment;
      // Flush any photos queued while adding, now that the row exists.
      if (pendingPhotos.length > 0) {
        try {
          for (let i = 0; i < pendingPhotos.length; i++) {
            await uploadFile(pendingPhotos[i], newRow.id, i);
          }
        } catch {
          setError(t.photoUploadError);
        }
        setPendingPhotos([]);
      }
    } else if (selected) {
      const { error: err } = await supabase.from('equipment').update(payload).eq('id', selected.id);
      if (err) { setError(t.saveError); setSaving(false); return; }
    }
    reRun();
    setSaving(false);
    setModal(null);
    setSelected(null);
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!(await confirm({ message: t.deleteConfirmMsg, destructive: true }))) return;
    await supabase.from('equipment').delete().eq('id', selected.id);
    // Storage objects under equipment/<business_id>/<selected.id>/ are
    // left in the bucket; the DB rows cascade-delete (the photos table
    // FK is on delete cascade). A periodic cleanup job can sweep
    // orphaned objects later.
    setModal(null); setSelected(null);
    reRun();
  };

  // ── Photo upload ───────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = () => fileInputRef.current?.click();

  // Upload one File to the private bucket + record its row.
  const uploadFile = async (file: File, equipmentId: string, sortOrder: number) => {
    if (!business) return;
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const filename = `${crypto.randomUUID()}.${ext}`;
    const path = equipmentPhotoPath(business.id, equipmentId, filename);
    const { error: upErr } = await supabase.storage
      .from(EQUIPMENT_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || `image/${ext}` });
    if (upErr) throw upErr;
    const { error: insErr } = await supabase.from('equipment_photos').insert({
      business_id: business.id,
      equipment_id: equipmentId,
      storage_path: path,
      sort_order: sortOrder,
      created_by: user?.id ?? null,
    });
    if (insErr) throw insErr;
  };

  const onFileChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files;
    if (!files || files.length === 0 || !business) return;
    const picked = Array.from(files);
    // Cap counts the live photos (edit) or the queued ones (add).
    const existing = selected ? photos.length : pendingPhotos.length;
    if (existing + picked.length > MAX_PHOTOS_PER_EQUIPMENT) {
      setError(t.photoLimitHit.replace('{{n}}', String(MAX_PHOTOS_PER_EQUIPMENT)));
      ev.target.value = '';
      return;
    }
    // Add mode: no equipment row yet — queue locally, upload on save.
    if (!selected) {
      setPendingPhotos((prev) => [...prev, ...picked]);
      ev.target.value = '';
      return;
    }
    setUploadingPhoto(true); setError('');
    try {
      for (let i = 0; i < picked.length; i++) {
        await uploadFile(picked[i], selected.id, photos.length + i);
      }
      await loadPhotosFor(selected.id);
      await refreshCover(selected.id); // refresh the list cover thumbnail
    } catch {
      setError(t.photoUploadError);
    }
    setUploadingPhoto(false);
    ev.target.value = '';
  };

  const removePending = (idx: number) =>
    setPendingPhotos((prev) => prev.filter((_, i) => i !== idx));

  const removePhoto = async (photo: EquipmentPhoto) => {
    if (!(await confirm({ message: t.photoDeleteConfirm, destructive: true }))) return;
    // Delete the DB row first; the RLS policy gates writes. Best-effort
    // storage cleanup follows.
    await supabase.from('equipment_photos').delete().eq('id', photo.id);
    await supabase.storage.from(EQUIPMENT_BUCKET).remove([photo.storage_path]);
    if (selected) await loadPhotosFor(selected.id);
    if (selected) await refreshCover(selected.id);
  };

  // Make a photo the cover (list thumbnail) by moving it to sort_order 0 and
  // renumbering the rest, preserving their relative order.
  const setCover = async (photo: EquipmentPhoto) => {
    if (!selected || photos[0]?.id === photo.id) return;
    const reordered = [photo, ...photos.filter((p) => p.id !== photo.id)];
    setPhotos(reordered.map((p, i) => ({ ...p, sort_order: i }))); // optimistic
    setViewerIndex(0); // the cover is now first; keep viewing it
    await Promise.all(
      reordered.map((p, i) =>
        supabase.from('equipment_photos').update({ sort_order: i }).eq('id', p.id),
      ),
    );
    await refreshCover(selected.id); // refresh the list cover thumbnail
  };

  // ── Full-screen photo viewer (detail view) ─────────────────────────
  const rotateCurrent = async () => {
    if (viewerIndex === null) return;
    const photo = photos[viewerIndex];
    if (!photo) return;
    const rotation = nextRotation(photo.rotation ?? 0);
    setPhotos(prev => prev.map(p => (p.id === photo.id ? { ...p, rotation } : p)));
    await supabase.from('equipment_photos').update({ rotation }).eq('id', photo.id);
  };

  const goTo = (delta: number) =>
    setViewerIndex(i =>
      i === null ? i : Math.min(Math.max(i + delta, 0), photos.length - 1),
    );

  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;
  const viewerRot = (viewerPhoto?.rotation ?? 0) % 360;
  const viewerSwap = viewerRot === 90 || viewerRot === 270;

  // Fullscreen viewer zoom/pan. zoom===1 is the reset (fit-to-screen) state.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Reset zoom/pan whenever the viewed photo (or its rotation) changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [viewerIndex, viewerRot]);
  const clampZoom = (z: number) => Math.min(Math.max(z, 1), 5);
  const onWheelZoom = (e: React.WheelEvent) => {
    setZoom(prev => {
      const next = clampZoom(prev - e.deltaY * 0.0025);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const toggleZoom = () =>
    setZoom(prev => {
      const next = prev > 1 ? 1 : 2.5;
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragRef.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) });
  };
  const onPointerUp = () => {
    dragRef.current = null;
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
            <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
            <p className="text-xs text-muted">
              {t.countTotal.replace('{{count}}', String(serverTotal))} · {t.subtitle}
            </p>
          </div>
        </div>
        {canEdit ? (
          <Button onClick={openAdd}>
            <Plus size={14} className="mr-1.5" />
            {t.addBtn}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {/* Group-by dropdown */}
        <div className="relative">
          <button
            onClick={() => setGroupMenuOpen(o => !o)}
            onBlur={() => setTimeout(() => setGroupMenuOpen(false), 150)}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium ${
              groupBy === 'none'
                ? 'border-border bg-card text-ink hover:bg-surface'
                : 'border-primary/30 bg-primary/10 text-primary'
            }`}
          >
            <Layers size={15} />
            {groupBy === 'none' ? t.groups.button : groupOptions.find(o => o.key === groupBy)?.label}
          </button>
          {groupMenuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border-soft bg-card shadow-lg p-1.5">
              <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{t.groups.title}</p>
              {groupOptions.map(o => {
                const active = groupBy === o.key;
                return (
                  <button
                    key={o.key}
                    onMouseDown={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm ${active ? 'bg-primary/10' : 'hover:bg-surface'}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? 'bg-primary text-white' : 'bg-border-soft text-muted'}`}>
                      <o.Icon size={15} />
                    </span>
                    <span className={`flex-1 text-left ${active ? 'text-primary font-semibold' : 'text-ink'}`}>{o.label}</span>
                    {active ? <Check size={15} className="text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {loading && equipment.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border-soft p-10 text-center">
          <Forklift size={36} className="text-faint mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink">{t.emptyTitle}</p>
          <p className="text-xs text-muted mt-1">{t.emptyHint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(section => (
            <div key={section.title || '__all'}>
              {section.title ? (
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted mb-2.5">
                  {section.title} <span className="text-faint">· {section.data.length}</span>
                </h2>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {section.data.map(e => {
            const cover = coverPhotos[e.id];
            const days = plateExpirationDays(e.plate_expiration);
            const plateBadge =
              days === null ? null
              : days < 0 ? { text: t.plateExpired, cls: 'bg-red-500/10 text-red-700 border-red-200' }
              : days <= 30 ? { text: t.plateExpiresSoon.replace('{{days}}', String(days)), cls: 'bg-amber-500/10 text-amber-700 border-amber-200' }
              : null;
            const assigned = employeeName(e.assigned_employee_id);
            return (
              <button
                key={e.id}
                onClick={() => openDetail(e)}
                className="[content-visibility:auto] [contain-intrinsic-size:auto_240px] text-left bg-card rounded-2xl border border-border-soft hover:border-border hover:shadow-sm transition-all overflow-hidden flex flex-col"
              >
                {/* Fixed aspect box; the image is absolutely positioned so it
                   fills the ratio instead of stretching the box to its own
                   height — keeps every card's photo identical in size. */}
                <div className="relative w-full aspect-video bg-surface overflow-hidden">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls[cover.storage_path] ?? undefined}
                      alt={e.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Truck size={40} className="text-faint" />
                    </div>
                  )}
                  {plateBadge ? (
                    <span className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${plateBadge.cls}`}>
                      <AlertTriangle size={10} /> {plateBadge.text}
                    </span>
                  ) : null}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{e.name}</p>
                    {e.paid_off ? (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">{t.paidOffBadge}</span>
                    ) : e.loan_lender ? (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700">{t.loanBadge}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted truncate">
                    {[e.year, e.make, e.model].filter(Boolean).join(' ') || e.equipment_type || '—'}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <User size={12} />
                    {assigned ?? <span className="text-faint">{t.unassignedBadge}</span>}
                  </div>
                </div>
              </button>
            );
          })}
              </div>
            </div>
          ))}
          {/* Infinite-scroll footer (flat/search view): sentinel loads the next page. */}
          {modeRef.current === 'page' ? (
            <>
              {loadingMore ? (
                <div className="flex items-center justify-center py-4">
                  <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                </div>
              ) : null}
              <div ref={sentinelRef} className="h-1" />
            </>
          ) : null}
        </div>
      )}

      {/* Add / edit modal */}
      <Modal
        open={modal === 'add' || modal === 'edit'}
        onClose={() => { setModal(null); setSelected(null); }}
        title={modal === 'add' ? t.addTitle : t.editTitle}
        size="xl"
      >
        <div className="flex flex-col gap-4">
          {/* Basic info — 2-column grid so fields aren't a narrow stack. */}
          <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.basicInfoHeading}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
            <div className="sm:col-span-2">
              <Input label={t.nameLabel} placeholder={t.namePlaceholder} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{t.typeLabel}</label>
              <select value={form.equipment_type}
                onChange={e => setForm(f => ({ ...f, equipment_type: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                {TYPE_SUGGESTIONS.map(o => <option key={o.value || '__none'} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Input label={t.makeLabel} placeholder={t.makePlaceholder} value={form.make}
              onChange={e => setForm(f => ({ ...f, make: e.target.value }))} />
            <Input label={t.modelLabel} placeholder={t.modelPlaceholder} value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
            <Input label={t.yearLabel} placeholder={t.yearPlaceholder} type="number" min="1900" max="2100"
              value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            <Input label={t.mileageLabel} placeholder={t.mileagePlaceholder} type="number" min="0"
              value={form.mileage} onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))} />
            <Input label={t.colorLabel} placeholder={t.colorPlaceholder} value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            <Input label={t.serialNumberLabel} placeholder={t.serialNumberPlaceholder} value={form.serial_number}
              onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            <div className="sm:col-span-2">
              <Input label={t.vinLabel} placeholder={t.vinPlaceholder} value={form.vin}
                onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} />
            </div>
          </div>

          {/* Registration */}
          <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.registrationHeading}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.plateNumberLabel} placeholder={t.plateNumberPlaceholder} value={form.plate_number}
              onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))} />
            <Input label={t.plateExpirationLabel} type="date" value={form.plate_expiration}
              onChange={e => setForm(f => ({ ...f, plate_expiration: e.target.value }))} />
          </div>

          {/* Insurance */}
          <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.insuranceHeading}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
            <Input label={t.insuranceCarrierLabel} placeholder={t.insuranceCarrierPlaceholder} value={form.insurance_carrier}
              onChange={e => setForm(f => ({ ...f, insurance_carrier: e.target.value }))} />
            <Input label={t.insurancePolicyLabel} placeholder={t.insurancePolicyPlaceholder} value={form.insurance_policy_number}
              onChange={e => setForm(f => ({ ...f, insurance_policy_number: e.target.value }))} />
            <Input label={t.insuranceAgentLabel} placeholder={t.insuranceAgentPlaceholder} value={form.insurance_agent}
              onChange={e => setForm(f => ({ ...f, insurance_agent: e.target.value }))} />
            <Input label={t.insuranceAgentPhoneLabel} placeholder={t.insuranceAgentPhonePlaceholder}
              value={formatPhoneInput(form.insurance_agent_phone)}
              onChange={e => setForm(f => ({ ...f, insurance_agent_phone: formatPhoneInput(e.target.value) }))} />
            <div className="sm:col-span-2">
              <Input label={t.insuranceExpirationLabel} type="date" value={form.insurance_expiration}
                onChange={e => setForm(f => ({ ...f, insurance_expiration: e.target.value }))} />
            </div>
          </div>

          {/* Ownership — Value always; lender + loan amount only when not paid off. */}
          <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.ownershipHeading}</p>
          <Input label={t.valueLabel} placeholder={t.valuePlaceholder} inputMode="numeric"
            leftIcon={<span className="text-muted">$</span>}
            value={withCommas(form.value)} onChange={e => setForm(f => ({ ...f, value: sanitizeMoney(e.target.value) }))} />
          <label className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
            <span className="text-sm text-ink">{t.paidOffLabel}</span>
            <Toggle checked={form.paid_off} onChange={v => setForm(f => ({ ...f, paid_off: v }))} />
          </label>
          {!form.paid_off ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
              <Input label={t.loanLenderLabel} placeholder={t.loanLenderPlaceholder} value={form.loan_lender}
                onChange={e => setForm(f => ({ ...f, loan_lender: e.target.value }))} />
              <Input label={t.loanAmountLabel} placeholder={t.loanAmountPlaceholder} inputMode="numeric"
                leftIcon={<span className="text-muted">$</span>}
                value={withCommas(form.loan_amount)} onChange={e => setForm(f => ({ ...f, loan_amount: sanitizeMoney(e.target.value) }))} />
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
            <Input label={t.purchaseDateLabel} type="date" value={form.purchase_date}
              onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
            <Input label={t.warrantyExpirationLabel} type="date" value={form.warranty_expiration}
              onChange={e => setForm(f => ({ ...f, warranty_expiration: e.target.value }))} />
          </div>

          {/* Assignment */}
          <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.assignmentHeading}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{t.assignedToLabel}</label>
              <select value={form.assigned_employee_id}
                onChange={e => setForm(f => ({ ...f, assigned_employee_id: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                <option value="">{t.assignedToNone}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                ))}
              </select>
            </div>
            <Input label={t.locationLabel} placeholder={t.locationPlaceholder} value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            {multiLocation && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">{locale === 'en' ? 'Branch' : 'Sucursal'}</label>
                <select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-ink">
                  <option value="">{locale === 'en' ? 'No branch' : 'Sin sucursal'}</option>
                  {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{t.notesLabel}</label>
            <textarea rows={3} placeholder={t.notesPlaceholder} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
          </div>

          {/* Photos — available while adding (queued locally) and editing
             (uploaded immediately). */}
          {(modal === 'add' || (modal === 'edit' && selected)) ? (
            <>
              <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.photosHeading}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onFileChosen}
                className="hidden"
              />
              {(modal === 'add' ? pendingPhotos.length : photos.length) === 0 ? (
                <button type="button" onClick={onPickFile}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors">
                  <Upload size={20} className="text-faint" />
                  <span className="text-sm text-muted">{t.photoEmpty}</span>
                  <span className="text-xs font-semibold text-primary">{t.photoAddBtn}</span>
                </button>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {modal === 'add'
                      ? pendingPhotos.map((_, idx) => (
                          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-border-soft group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pendingUrls[idx]} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removePending(idx)}
                              className="absolute top-1 right-1 p-1 rounded-full bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
                              aria-label="Remove photo"
                            >
                              <X size={12} className="text-red-500" />
                            </button>
                          </div>
                        ))
                      : photos.map(p => (
                          <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-border-soft group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoUrls[p.storage_path] ?? undefined}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removePhoto(p)}
                              className="absolute top-1 right-1 p-1 rounded-full bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
                              aria-label="Delete photo"
                            >
                              <X size={12} className="text-red-500" />
                            </button>
                          </div>
                        ))}
                    {(modal === 'add' ? pendingPhotos.length : photos.length) < MAX_PHOTOS_PER_EQUIPMENT ? (
                      <button
                        type="button"
                        onClick={onPickFile}
                        className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center"
                      >
                        <Plus size={18} className="text-faint" />
                      </button>
                    ) : null}
                  </div>
                  {uploadingPhoto ? (
                    <p className="text-xs text-muted">{t.photoUploading}</p>
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

      {/* Detail view — read-only; clicking a card lands here, not the edit form.
         Matches the edit modal's width (xl). */}
      <Modal
        open={modal === 'detail'}
        onClose={() => { setModal(null); setSelected(null); }}
        title={selected?.name ?? t.detailTitle}
        size="xl"
      >
        {selected ? (
          // Centered column of grouped cards, mirroring the mobile detail layout.
          <div className="flex flex-col gap-3 w-full max-w-2xl mx-auto">
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setViewerIndex(idx)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-border-soft"
                  >
                    {/* First photo is the cover/list thumbnail. */}
                    {idx === 0 ? (
                      <span className="absolute top-1 left-1 z-10 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/60 text-white">
                        <Star size={9} fill="currentColor" /> {t.coverBadge}
                      </span>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrls[p.storage_path] ?? undefined}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ transform: `rotate(${(p.rotation ?? 0) % 360}deg)` }}
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {/* Vehicle */}
            <DetailCard>
              <DetailRow label={t.typeLabel} value={selected.equipment_type} />
              <DetailRow label={t.makeLabel} value={selected.make} />
              <DetailRow label={t.modelLabel} value={selected.model} />
              <DetailRow label={t.yearLabel} value={selected.year != null ? String(selected.year) : null} />
              <DetailRow label={t.colorLabel} value={selected.color} />
              <DetailRow label={t.serialNumberLabel} value={selected.serial_number} />
              <DetailRow label={t.vinLabel} value={selected.vin} />
              <DetailRow
                label={t.mileageLabel}
                value={selected.mileage != null ? selected.mileage.toLocaleString('en-US') : null}
              />
            </DetailCard>

            {/* Registration (+ expiry countdown badge) */}
            {(selected.plate_number || selected.plate_expiration) ? (
              <DetailCard>
                <DetailRow label={t.plateNumberLabel} value={selected.plate_number} />
                <DetailRow
                  label={t.plateExpirationLabel}
                  value={selected.plate_expiration ? formatDateLong(selected.plate_expiration, locale) : null}
                />
                {(() => {
                  const days = plateExpirationDays(selected.plate_expiration);
                  const badge =
                    days === null ? null
                    : days < 0 ? { text: t.plateExpired, cls: 'bg-red-500/10 text-red-700 border-red-200' }
                    : days <= 30 ? { text: t.plateExpiresSoon.replace('{{days}}', String(days)), cls: 'bg-amber-500/10 text-amber-700 border-amber-200' }
                    : null;
                  return badge ? (
                    <span className={`col-span-2 justify-self-start inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
                      <AlertTriangle size={12} /> {badge.text}
                    </span>
                  ) : null;
                })()}
              </DetailCard>
            ) : null}

            {/* Insurance (+ renewal countdown badge) */}
            {(selected.insurance_carrier || selected.insurance_policy_number || selected.insurance_agent || selected.insurance_agent_phone || selected.insurance_expiration) ? (
              <DetailCard>
                <DetailRow label={t.insuranceCarrierLabel} value={selected.insurance_carrier} />
                <DetailRow label={t.insurancePolicyLabel} value={selected.insurance_policy_number} />
                <DetailRow label={t.insuranceAgentLabel} value={selected.insurance_agent} />
                <DetailRow label={t.insuranceAgentPhoneLabel} value={selected.insurance_agent_phone} />
                <DetailRow
                  label={t.insuranceExpirationLabel}
                  value={selected.insurance_expiration ? formatDateLong(selected.insurance_expiration, locale) : null}
                />
                {(() => {
                  const days = plateExpirationDays(selected.insurance_expiration);
                  const badge =
                    days === null ? null
                    : days < 0 ? { text: t.insuranceExpired, cls: 'bg-red-500/10 text-red-700 border-red-200' }
                    : days <= 30 ? { text: t.insuranceExpiresSoon.replace('{{days}}', String(days)), cls: 'bg-amber-500/10 text-amber-700 border-amber-200' }
                    : null;
                  return badge ? (
                    <span className={`col-span-2 justify-self-start inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.cls}`}>
                      <AlertTriangle size={12} /> {badge.text}
                    </span>
                  ) : null;
                })()}
              </DetailCard>
            ) : null}

            {/* Value + ownership + acquisition */}
            <DetailCard>
              <DetailRow label={t.valueLabel} value={selected.value != null ? fmtMoney(selected.value) : null} />
              {selected.paid_off ? (
                <DetailRow label={t.ownershipHeading} value={t.paidOffLabel} />
              ) : (
                <>
                  <DetailRow label={t.loanLenderLabel} value={selected.loan_lender} />
                  <DetailRow
                    label={t.loanAmountLabel}
                    value={selected.loan_amount != null ? fmtMoney(selected.loan_amount) : null}
                  />
                </>
              )}
              <DetailRow label={t.purchaseDateLabel} value={selected.purchase_date ? formatDateLong(selected.purchase_date, locale) : null} />
              <DetailRow label={t.warrantyExpirationLabel} value={selected.warranty_expiration ? formatDateLong(selected.warranty_expiration, locale) : null} />
            </DetailCard>

            {/* Assignment */}
            <DetailCard>
              <DetailRow
                label={t.assignedToLabel}
                value={employeeName(selected.assigned_employee_id) ?? t.unassignedBadge}
              />
              <DetailRow label={t.locationLabel} value={selected.location} />
            </DetailCard>

            {/* Notes */}
            {selected.notes ? (
              <DetailCard>
                <div className="col-span-2">
                  <DetailRow label={t.notesLabel} value={selected.notes} />
                </div>
              </DetailCard>
            ) : null}

            {/* Audit timestamps */}
            <DetailCard>
              <DetailRow label={t.createdLabel} value={selected.created_at ? formatDateTimeLong(selected.created_at, locale) : null} />
              <DetailRow label={t.updatedLabel} value={selected.updated_at ? formatDateTimeLong(selected.updated_at, locale) : null} />
            </DetailCard>

            {canEdit ? (
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={onDelete}>
                  <Trash2 size={14} className="mr-1.5" />
                  {t.deleteBtn}
                </Button>
                <div className="flex-1" />
                <Button onClick={() => openEdit(selected)}>{t.editBtn}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Full-screen photo viewer — click a detail photo to open; rotate to fix
         orientation (persisted). Mirrors the job-photos viewer. */}
      {viewerPhoto ? (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center overflow-hidden"
          // Backdrop click closes — but not while zoomed (clicks are pans then).
          onClick={() => { if (zoom === 1) setViewerIndex(null); }}
          onWheel={onWheelZoom}
        >
          {/* Controls need z-10: the photo has a CSS transform (rotation),
             which creates a stacking context that would otherwise paint over
             the counter/buttons since the img comes later in the DOM. */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewerIndex(null)}
              aria-label={tc.buttons.cancel}
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <X size={20} />
            </button>
            <span className="text-sm text-white/70">{(viewerIndex ?? 0) + 1} / {photos.length}</span>
            {canEdit ? (
              <div className="flex items-center gap-2">
                {/* Set the current photo as the list/cover thumbnail. */}
                <button
                  onClick={() => void setCover(viewerPhoto)}
                  aria-label={t.setCoverBtn}
                  title={t.setCoverBtn}
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${(viewerIndex ?? 0) === 0 ? 'bg-amber-400/90 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  <Star size={18} fill={(viewerIndex ?? 0) === 0 ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => void rotateCurrent()}
                  aria-label="Rotate"
                  className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                >
                  <RotateCw size={18} />
                </button>
              </div>
            ) : <div />}
          </div>

          {(viewerIndex ?? 0) > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(-1); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <ChevronLeft size={24} />
            </button>
          ) : null}
          {(viewerIndex ?? 0) < photos.length - 1 ? (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <ChevronRight size={24} />
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrls[viewerPhoto.storage_path] ?? undefined}
            alt=""
            draggable={false}
            className="object-contain select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${viewerRot}deg)`,
              maxWidth: viewerSwap ? '90vh' : '92vw',
              maxHeight: viewerSwap ? '92vw' : '90vh',
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
              touchAction: 'none',
              transition: dragRef.current ? 'none' : 'transform 0.15s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); toggleZoom(); }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      ) : null}
    </div>
  );
}
