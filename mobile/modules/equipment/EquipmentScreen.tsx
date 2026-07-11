// Equipment module — mobile. Counterpart to web/src/modules/equipment.
// Lists every piece of equipment in the business, lets the user
// add/edit/delete, attach photos (camera or library), and assign to
// an active employee.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronDown,
  ScanLine,
  RotateCw,
  Star,
  Layers,
  Image as ImageIcon,
  Camera,
  ImagePlus,
  AlertTriangle,
  User as UserIcon,
  Forklift,
  Truck,
  List,
  Tag,
  Wallet,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached, writeCached } from '@/lib/offline/cache';
import { queuedInsert, queuedUpdate, queuedDelete, queuedUpload } from '@/lib/offline/mutate';
import { newUuid } from '@/lib/offline/ids';
import { isOnlineNow } from '@/lib/offline/network';
import { Button, Input, DatePicker, Toggle, Fab } from '@amixos/shared/ui';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import {
  EQUIPMENT_BUCKET,
  MAX_PHOTOS_PER_EQUIPMENT,
  equipmentPhotoPath,
  plateExpirationDays,
  type Equipment,
  type EquipmentPhoto,
} from '@amixos/shared/lib/equipment';
import { useSignedUrls } from '@amixos/shared/lib/storageUrls';
import { formatDateLong, formatDateTimeLong } from '@amixos/shared/lib/format';
import { nextRotation } from '@amixos/shared/lib/jobPhotos';
import {
  groupEquipment,
  parseEquipmentGroupKey,
  EQUIPMENT_GROUP_KEY,
  type EquipmentGroupKey,
} from '@amixos/shared/lib/equipmentGroups';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface EquipForm {
  name: string;
  equipment_type: string;
  make: string;
  model: string;
  year: string;
  color: string;
  vin: string;
  serial_number: string;
  mileage: string;
  plate_number: string;
  plate_expiration: string;
  insurance_carrier: string;
  insurance_policy_number: string;
  insurance_agent: string;
  insurance_agent_phone: string;
  insurance_expiration: string;
  purchase_date: string;
  warranty_expiration: string;
  location: string;
  paid_off: boolean;
  loan_lender: string;
  value: string;
  loan_amount: string;
  assigned_employee_id: string;
  notes: string;
}

const EMPTY_FORM: EquipForm = {
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
  paid_off: false,
  loan_lender: '',
  value: '',
  loan_amount: '',
  assigned_employee_id: '',
  notes: '',
};

// Group with thousands separators for display ("10000" → "10,000"), preserving
// any decimals the user has typed ("1234.5" → "1,234.5", trailing "." kept).
function fmtThousands(raw: string): string {
  if (!raw) return '';
  const [int, dec] = raw.split('.');
  const intFmt = int ? Number(int).toLocaleString('en-US') : '';
  return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
}

// Keep digits + a single decimal point (max 2 places) for a money input.
function sanitizeMoney(s: string): string {
  let cleaned = s.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  return cleaned;
}

// Inline single-select that expands within the form. A shared Select opens a
// nested RNModal whose option list renders empty inside this form sheet on iOS,
// so we use an inline expanding list (with optional search) instead.
function InlinePicker({
  label,
  value,
  placeholder,
  options,
  onSelect,
  searchable,
  searchPlaceholder,
  noResultsText,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.value === value);
  const hasValue = !!(selected && selected.value);
  const list = searchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-gray-700">{label}</Text>
      <Pressable
        onPress={() => { setOpen(o => !o); setQuery(''); }}
        className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5"
      >
        <Text className={`text-base flex-1 ${hasValue ? 'text-gray-900' : 'text-gray-400'}`}>
          {hasValue ? selected!.label : placeholder}
        </Text>
        <ChevronDown size={16} color="#9CA3AF" />
      </Pressable>
      {open ? (
        <View className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {searchable ? (
            <View className="flex-row items-center gap-2 px-3 py-2 border-b border-gray-100">
              <Search size={14} color="#9CA3AF" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor="#9CA3AF"
                autoFocus
                autoCorrect={false}
                className="flex-1 py-1 text-sm text-gray-900"
              />
            </View>
          ) : null}
          <ScrollView className="max-h-56" nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {list.length === 0 ? (
              <Text className="text-sm text-gray-400 px-4 py-3">{noResultsText}</Text>
            ) : list.map(o => {
              const sel = o.value === value;
              return (
                <Pressable
                  key={o.value || '__none__'}
                  onPress={() => { onSelect(o.value); setOpen(false); }}
                  className={`flex-row items-center justify-between px-4 py-3 ${sel ? 'bg-primary/5' : 'active:bg-gray-50'}`}
                >
                  <Text className={`text-sm flex-1 ${sel ? 'text-primary font-semibold' : 'text-gray-900'}`}>{o.label}</Text>
                  {sel ? <Check size={16} color="#4F46E5" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

// Currency — shows cents only when present (whole amounts stay clean).
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// Soft card shadow — explicit because RN iOS ignores NativeWind's shadow-sm.
const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 3,
  elevation: 2,
};

type DetailRowData = { label: string; value: string | null | undefined };

// A grouped white card holding several labeled rows (divider between each),
// with an optional footer (e.g. a status badge). Renders nothing if every row
// is empty and there's no footer.
function DetailCard({ rows, footer }: { rows: DetailRowData[]; footer?: ReactNode }) {
  const visible = rows.filter((r) => r.value);
  if (visible.length === 0 && !footer) return null;
  return (
    <View className="rounded-2xl bg-white border border-gray-100" style={cardShadow}>
      {visible.map((r, i) => (
        <View key={r.label} className={`px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
          <Text className="text-xs font-medium text-gray-400">{r.label}</Text>
          <Text className="text-base text-gray-900 mt-0.5">{r.value}</Text>
        </View>
      ))}
      {footer ? <View className="px-4 pb-3.5 pt-0.5">{footer}</View> : null}
    </View>
  );
}

export default function EquipmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.modules.equipment;
  const tc = full.common;

  // Group-by — persists across navigation + refresh, scoped per business so it
  // doesn't carry across companies.
  const [groupBy, setGroupBy] = useState<EquipmentGroupKey>('none');
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupHydrated = useRef(false);
  const groupKey = business?.id ? `${EQUIPMENT_GROUP_KEY}.${business.id}` : EQUIPMENT_GROUP_KEY;
  useEffect(() => {
    let cancelled = false;
    groupHydrated.current = false;
    AsyncStorage.getItem(groupKey)
      .then((raw) => { if (!cancelled) setGroupBy(parseEquipmentGroupKey(raw)); })
      .finally(() => { groupHydrated.current = true; });
    return () => { cancelled = true; };
  }, [groupKey]);
  useEffect(() => {
    if (!groupHydrated.current) return;
    void AsyncStorage.setItem(groupKey, groupBy).catch(() => {});
  }, [groupKey, groupBy]);
  const groupOptions: { key: EquipmentGroupKey; label: string; Icon: LucideIcon }[] = [
    { key: 'none', label: t.groups.none, Icon: List },
    { key: 'lead', label: t.groups.lead, Icon: UserIcon },
    { key: 'type', label: t.groups.type, Icon: Tag },
    { key: 'property', label: t.groups.property, Icon: Wallet },
    { key: 'expiration', label: t.groups.expiration, Icon: CalendarClock },
  ];

  const sheetScrim = {
    position: 'absolute' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  };
  const sheetShadow = {
    marginBottom: insets.bottom + 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 24,
  };

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [coverPhotos, setCoverPhotos] = useState<Record<string, EquipmentPhoto>>({});
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'add' | 'edit' | 'detail' | null>(null);
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [form, setForm] = useState<EquipForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<EquipmentPhoto[]>([]);
  // Photos picked while ADDING (no equipment row yet) — local URIs uploaded
  // once the row is created on save.
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Full-screen photo viewer (detail view) — index into `photos`, or null.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerListRef = useRef<FlatList<EquipmentPhoto>>(null);
  // Bottom-sheet delete confirmation (one-hand friendly; replaces Alert).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // VIN barcode scanner (expo-camera). scannedRef de-dupes the rapid-fire
  // onBarcodeScanned callbacks down to a single capture.
  const [scanning, setScanning] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const startVinScan = async () => {
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) { setError(t.scanPermissionDenied); return; }
    }
    scannedRef.current = false;
    setError('');
    setScanning(true);
  };

  const onVinScanned = useCallback((res: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    const raw = (res.data || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // VINs are exactly 17 chars (no I/O/Q) — pull that pattern out of any
    // longer barcode payload, else fall back to the first 17.
    const match = raw.match(/[A-HJ-NPR-Z0-9]{17}/);
    setForm(f => ({ ...f, vin: match ? match[0] : raw.slice(0, 17) }));
    setScanning(false);
  }, []);

  // Photos live in a private bucket — sign the list covers + the open
  // equipment's photos together, keyed by storage_path.
  const photoUrls = useSignedUrls(supabase, [
    ...Object.values(coverPhotos).map((p) => p.storage_path),
    ...photos.map((p) => p.storage_path),
  ]);

  const TYPE_OPTIONS = useMemo(() => [
    // "—" is the canonical "no selection" label across the app (matches
    // the state picker etc.). The descriptive `typePlaceholder` shows in
    // the closed Select's placeholder slot, not as a confusing first row.
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

  const loadEquipment = useCallback(async () => {
    if (!business) return;
    const res = await loadCached(`equipment_${business.id}`, () =>
      fetchAll<Equipment>((from, to) =>
        supabase.from('equipment').select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .range(from, to)));
    const data = res.data ?? [];
    setEquipment(data);
    if (data.length > 0) {
      const ids = data.map((e) => e.id);
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
    const e = employees.find((x) => x.id === id);
    return e ? `${e.first_name} ${e.last_name}` : null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.make ?? '').toLowerCase().includes(q) ||
      (e.model ?? '').toLowerCase().includes(q) ||
      (e.plate_number ?? '').toLowerCase().includes(q) ||
      (e.equipment_type ?? '').toLowerCase().includes(q),
    );
  }, [equipment, search]);

  // Grouped sections (or a single flat section when grouping is off / searching).
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
    setForm(EMPTY_FORM);
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
      paid_off: form.paid_off,
      loan_lender: form.paid_off ? null : form.loan_lender.trim() || null,
      value: form.value ? Number(form.value) : null,
      loan_amount: form.paid_off ? null : form.loan_amount ? Number(form.loan_amount) : null,
      assigned_employee_id: form.assigned_employee_id || null,
      notes: form.notes.trim() || null,
    };
    // Client-generated id so an offline create works (and pending photos can
    // reference it before it syncs).
    const isAdd = modal === 'add';
    const id = isAdd ? newUuid() : selected?.id;
    if (!id) { setSaving(false); return; }
    try {
      if (isAdd) {
        await queuedInsert({ table: 'equipment', payload: { ...payload, id, created_by: user?.id ?? null }, businessId: business.id, label: `Equipo: ${payload.name}` });
      } else {
        await queuedUpdate({ table: 'equipment', match: { id }, payload, businessId: business.id, label: `Equipo: ${payload.name}` });
      }
    } catch { setError(t.saveError); setSaving(false); return; }
    // Flush photos queued while adding (also offline-capable via queuedUpload).
    if (isAdd && pendingPhotos.length > 0) {
      try {
        for (let i = 0; i < pendingPhotos.length; i++) {
          await uploadPhotoFromUri(pendingPhotos[i], id, i);
        }
      } catch {
        setError(t.photoUploadError);
      }
      setPendingPhotos([]);
    }
    // Optimistic local + cache so the change shows offline.
    setEquipment(prev => {
      const next = isAdd
        ? [{ ...payload, id, created_by: user?.id ?? null } as Equipment, ...prev]
        : prev.map(e => (e.id === id ? ({ ...e, ...payload } as Equipment) : e));
      void writeCached(`equipment_${business.id}`, next);
      return next;
    });
    setSaving(false);
    setModal(null);
    setSelected(null);
  };

  // Opens the bottom-sheet confirmation (one-hand friendly vs a centered Alert).
  const onDelete = () => {
    if (!selected) return;
    setConfirmingDelete(true);
  };

  const doDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    const delId = selected.id;
    try {
      await queuedDelete({ table: 'equipment', match: { id: delId }, businessId: business?.id ?? null, label: 'Eliminar equipo' });
    } catch { setDeleting(false); return; }
    if (business) {
      setEquipment(prev => {
        const next = prev.filter(e => e.id !== delId);
        void writeCached(`equipment_${business.id}`, next);
        return next;
      });
    }
    setDeleting(false);
    setConfirmingDelete(false);
    setModal(null); setSelected(null);
    await loadEquipment();
  };

  // ── Photo capture / upload ─────────────────────────────────────────
  // Upload one local image URI to the private bucket + record its row.
  const uploadPhotoFromUri = async (uri: string, equipmentId: string, sortOrder: number) => {
    if (!business) return;
    const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
    const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const path = equipmentPhotoPath(business.id, equipmentId, `${uid}.${ext}`);
    const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    // Offline: copy to the document dir so the queued upload survives a restart.
    let uploadUri = uri;
    if (!isOnlineNow()) {
      try {
        const FileSystem = require('expo-file-system');
        const durable = `${FileSystem.documentDirectory}offline_equip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: durable });
        uploadUri = durable;
      } catch { /* expo-file-system missing — fall back to temp uri */ }
    }
    await queuedUpload({
      table: 'equipment_photos',
      payload: {
        id: newUuid(),
        business_id: business.id,
        equipment_id: equipmentId,
        storage_path: path,
        sort_order: sortOrder,
        created_by: user?.id ?? null,
      },
      businessId: business.id,
      label: 'Foto de equipo',
      localUri: uploadUri,
      bucket: EQUIPMENT_BUCKET,
      storagePath: path,
      contentType,
    });
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (!business) return;
    // Cap counts the live photos (edit) or the queued ones (add).
    const count = selected ? photos.length : pendingPhotos.length;
    if (count >= MAX_PHOTOS_PER_EQUIPMENT) {
      setError(t.photoLimitHit.replace('{{n}}', String(MAX_PHOTOS_PER_EQUIPMENT)));
      return;
    }
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;

    // Add mode: no equipment row yet — queue locally, upload on save.
    if (!selected) {
      setPendingPhotos((prev) => [...prev, uri]);
      return;
    }

    setUploadingPhoto(true); setError('');
    try {
      await uploadPhotoFromUri(uri, selected.id, photos.length);
      await loadPhotosFor(selected.id);
      await loadEquipment();
    } catch {
      setError(t.photoUploadError);
    }
    setUploadingPhoto(false);
  };

  const removePending = (uri: string) =>
    setPendingPhotos((prev) => prev.filter((u) => u !== uri));

  const removePhoto = (photo: EquipmentPhoto) => {
    Alert.alert('', t.photoDeleteConfirm, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: tc.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('equipment_photos').delete().eq('id', photo.id);
          await supabase.storage.from(EQUIPMENT_BUCKET).remove([photo.storage_path]);
          if (selected) await loadPhotosFor(selected.id);
          await loadEquipment();
        },
      },
    ]);
  };

  // Make a photo the cover (list thumbnail): move it to sort_order 0 and
  // renumber the rest, preserving their relative order.
  const setCover = async (photo: EquipmentPhoto) => {
    if (!selected || photos[0]?.id === photo.id) return;
    const reordered = [photo, ...photos.filter((p) => p.id !== photo.id)];
    setPhotos(reordered.map((p, i) => ({ ...p, sort_order: i }))); // optimistic
    setViewerIndex(0);
    viewerListRef.current?.scrollToIndex({ index: 0, animated: true });
    await Promise.all(
      reordered.map((p, i) =>
        supabase.from('equipment_photos').update({ sort_order: i }).eq('id', p.id),
      ),
    );
    await loadEquipment();
  };

  // ── Full-screen photo viewer (detail view) ─────────────────────────
  const rotateCurrent = async () => {
    if (viewerIndex === null) return;
    const photo = photos[viewerIndex];
    if (!photo) return;
    const rotation = nextRotation(photo.rotation ?? 0);
    // Optimistic local update so the rotation feels instant, then persist.
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, rotation } : p)));
    await supabase.from('equipment_photos').update({ rotation }).eq('id', photo.id);
  };

  const goTo = (delta: number) => {
    if (viewerIndex === null) return;
    const next = Math.min(Math.max(viewerIndex + delta, 0), photos.length - 1);
    if (next === viewerIndex) return;
    setViewerIndex(next);
    viewerListRef.current?.scrollToIndex({ index: next, animated: true });
  };

  const onViewerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
    setViewerIndex((prev) => (prev === idx ? prev : idx));
  };

  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;
  const viewerAvailH = screenH - insets.top - insets.bottom - 120;

  // One swipeable page per photo, sized so the rotated image stays inside the
  // viewport (90/270 swap the on-screen footprint).
  const renderViewerPage = ({ item }: { item: EquipmentPhoto }) => {
    const r = (item.rotation ?? 0) % 360;
    const swap = r === 90 || r === 270;
    // Zoomable page: pinch-to-zoom + pan handled natively. At zoom 1 the content
    // fits exactly, so horizontal swipes bubble to the outer paging FlatList.
    return (
      <ScrollView
        style={{ width: screenW, height: viewerAvailH }}
        contentContainerStyle={{
          width: screenW,
          height: viewerAvailH,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        maximumZoomScale={4}
        minimumZoomScale={1}
        bouncesZoom
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: photoUrls[item.storage_path] }}
          style={{
            width: swap ? viewerAvailH : screenW,
            height: swap ? screenW : viewerAvailH,
            transform: [{ rotate: `${r}deg` }],
          }}
          resizeMode="contain"
        />
      </ScrollView>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-lg font-semibold text-gray-900">{t.title}</Text>
          <Text className="text-xs text-gray-500">
            {t.countTotal.replace('{{count}}', String(filtered.length))} · {t.subtitle}
          </Text>
        </View>
        {/* Group-by — icon-only, highlighted when active (matches clients). */}
        <Pressable
          onPress={() => setGroupMenuOpen(true)}
          className={`p-2.5 rounded-xl border active:opacity-80 ${
            groupBy !== 'none' ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
          }`}
        >
          <Layers size={18} color={groupBy !== 'none' ? '#4F46E5' : '#374151'} />
        </Pressable>
      </View>

      {/* Search */}
      <View className="px-4 pt-3">
        <View className="flex-row items-center rounded-2xl border border-gray-200 bg-white px-3">
          <Search size={14} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="#9CA3AF"
            className="flex-1 py-2.5 pl-2 text-sm text-gray-900"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} className="pl-1">
              <X size={16} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* List */}
      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-32">
        {filtered.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center">
            <Forklift size={32} color="#D1D5DB" />
            <Text className="text-sm font-semibold text-gray-700 mt-3">{t.emptyTitle}</Text>
            <Text className="text-xs text-gray-500 mt-1 text-center">{t.emptyHint}</Text>
          </View>
        ) : (
          <View className="gap-5">
            {sections.map((section) => (
              <View key={section.title || '__all'} className="gap-3">
                {section.title ? (
                  <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide px-1">
                    {section.title} <Text className="text-gray-400">· {section.data.length}</Text>
                  </Text>
                ) : null}
                {section.data.map((e) => {
                  const cover = coverPhotos[e.id];
                  const days = plateExpirationDays(e.plate_expiration);
                  const plateBadge =
                    days === null ? null
                    : days < 0 ? { text: t.plateExpired, bg: 'bg-red-50', fg: 'text-red-700' }
                    : days <= 30 ? { text: t.plateExpiresSoon.replace('{{days}}', String(days)), bg: 'bg-amber-50', fg: 'text-amber-700' }
                    : null;
                  const assigned = employeeName(e.assigned_employee_id);
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => openDetail(e)}
                      className="bg-white rounded-2xl border border-gray-100 overflow-hidden active:bg-gray-50"
                    >
                      {cover ? (
                        <Image
                          source={{ uri: photoUrls[cover.storage_path] }}
                          style={{ width: '100%', height: 160 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ height: 160 }} className="bg-gray-50 items-center justify-center">
                          <Truck size={40} color="#D1D5DB" />
                        </View>
                      )}
                      <View className="p-4 gap-1">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="text-base font-semibold text-gray-900 flex-1" numberOfLines={1}>{e.name}</Text>
                          {e.paid_off ? (
                            <View className="bg-emerald-50 px-2 py-0.5 rounded-full">
                              <Text className="text-[10px] font-semibold text-emerald-700">{t.paidOffBadge}</Text>
                            </View>
                          ) : e.loan_lender ? (
                            <View className="bg-amber-50 px-2 py-0.5 rounded-full">
                              <Text className="text-[10px] font-semibold text-amber-700">{t.loanBadge}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-xs text-gray-500" numberOfLines={1}>
                          {[e.year, e.make, e.model].filter(Boolean).join(' ') || e.equipment_type || '—'}
                        </Text>
                        <View className="flex-row items-center gap-1.5 mt-1">
                          <UserIcon size={12} color="#6B7280" />
                          <Text className="text-xs text-gray-500">{assigned ?? t.unassignedBadge}</Text>
                        </View>
                        {plateBadge ? (
                          <View className={`mt-1 self-start flex-row items-center gap-1 ${plateBadge.bg} px-2 py-0.5 rounded-full`}>
                            <AlertTriangle size={10} color={days! < 0 ? '#B91C1C' : '#B45309'} />
                            <Text className={`text-[10px] font-semibold ${plateBadge.fg}`}>{plateBadge.text}</Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add equipment — floating action, one-handed thumb reach. */}
      <Fab onPress={openAdd} />

      {/* Add / edit modal — same floating sheet pattern as the empleados
         modal so the look is consistent. */}
      <RNModal
        visible={modal === 'add' || modal === 'edit'}
        transparent
        animationType="fade"
        onRequestClose={() => { setModal(null); setSelected(null); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View className="flex-1 justify-end">
            <Pressable onPress={() => { setModal(null); setSelected(null); }} style={sheetScrim} />
            <View
              className="bg-white rounded-3xl pt-3 mx-3 overflow-hidden"
              style={{ maxHeight: '85%', ...sheetShadow }}
            >
              <View className="items-center mb-2">
                <View className="w-10 h-1 bg-gray-200 rounded-full" />
              </View>
              <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
                <Text className="text-lg font-bold text-gray-900">
                  {modal === 'add' ? t.addTitle : t.editTitle}
                </Text>
                <Pressable onPress={() => { setModal(null); setSelected(null); }} hitSlop={8}>
                  <X size={20} color="#9CA3AF" />
                </Pressable>
              </View>
              <ScrollView contentContainerClassName="px-5 py-5 pb-10 gap-4" keyboardShouldPersistTaps="handled">
                {/* Basic info */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.basicInfoHeading}</Text>
                <Input
                  label={t.nameLabel}
                  placeholder={t.namePlaceholder}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                />
                <InlinePicker
                  label={t.typeLabel}
                  value={form.equipment_type}
                  placeholder={t.typePlaceholder}
                  options={TYPE_OPTIONS}
                  onSelect={(v) => setForm((f) => ({ ...f, equipment_type: v }))}
                  noResultsText={t.selectNoResults}
                />
                <Input label={t.makeLabel} placeholder={t.makePlaceholder} value={form.make}
                  onChangeText={(v) => setForm((f) => ({ ...f, make: v }))} />
                <Input label={t.modelLabel} placeholder={t.modelPlaceholder} value={form.model}
                  onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} />
                <Input label={t.yearLabel} placeholder={t.yearPlaceholder} keyboardType="number-pad"
                  value={form.year} onChangeText={(v) => setForm((f) => ({ ...f, year: v.replace(/[^0-9]/g, '') }))} />
                <Input label={t.colorLabel} placeholder={t.colorPlaceholder} value={form.color}
                  onChangeText={(v) => setForm((f) => ({ ...f, color: v }))} />
                <Input label={t.mileageLabel} placeholder={t.mileagePlaceholder} keyboardType="number-pad"
                  value={fmtThousands(form.mileage)}
                  onChangeText={(v) => setForm((f) => ({ ...f, mileage: v.replace(/[^0-9]/g, '') }))} />
                <Input label={t.vinLabel} placeholder={t.vinPlaceholder} value={form.vin}
                  onChangeText={(v) => setForm((f) => ({ ...f, vin: v }))} autoCapitalize="characters"
                  rightIcon={
                    <Pressable onPress={startVinScan} hitSlop={8} accessibilityLabel={t.scanVinHint}>
                      <ScanLine size={18} color="#4F46E5" />
                    </Pressable>
                  } />
                <Input label={t.serialNumberLabel} placeholder={t.serialNumberPlaceholder} value={form.serial_number}
                  onChangeText={(v) => setForm((f) => ({ ...f, serial_number: v }))} autoCapitalize="characters" />

                {/* Registration */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.registrationHeading}</Text>
                <Input label={t.plateNumberLabel} placeholder={t.plateNumberPlaceholder} value={form.plate_number}
                  onChangeText={(v) => setForm((f) => ({ ...f, plate_number: v }))} autoCapitalize="characters" />
                <DatePicker label={t.plateExpirationLabel} value={form.plate_expiration}
                  onChange={(v) => setForm((f) => ({ ...f, plate_expiration: v }))} />

                {/* Insurance */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.insuranceHeading}</Text>
                <Input label={t.insuranceCarrierLabel} placeholder={t.insuranceCarrierPlaceholder} value={form.insurance_carrier}
                  onChangeText={(v) => setForm((f) => ({ ...f, insurance_carrier: v }))} />
                <Input label={t.insurancePolicyLabel} placeholder={t.insurancePolicyPlaceholder} value={form.insurance_policy_number}
                  onChangeText={(v) => setForm((f) => ({ ...f, insurance_policy_number: v }))} />
                <Input label={t.insuranceAgentLabel} placeholder={t.insuranceAgentPlaceholder} value={form.insurance_agent}
                  onChangeText={(v) => setForm((f) => ({ ...f, insurance_agent: v }))} />
                <Input label={t.insuranceAgentPhoneLabel} placeholder={t.insuranceAgentPhonePlaceholder} keyboardType="phone-pad"
                  value={form.insurance_agent_phone} onChangeText={(v) => setForm((f) => ({ ...f, insurance_agent_phone: v }))} />
                <DatePicker label={t.insuranceExpirationLabel} value={form.insurance_expiration}
                  onChange={(v) => setForm((f) => ({ ...f, insurance_expiration: v }))} />

                {/* Ownership */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.ownershipHeading}</Text>
                {/* Value is always shown; lender + loan amount only when not paid off. */}
                <Input label={t.valueLabel} placeholder={t.valuePlaceholder} keyboardType="decimal-pad"
                  leftIcon={<Text className="text-base text-gray-500">$</Text>}
                  value={fmtThousands(form.value)}
                  onChangeText={(v) => setForm((f) => ({ ...f, value: sanitizeMoney(v) }))} />
                <View className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
                  <Text className="text-base text-gray-900">{t.paidOffLabel}</Text>
                  <Toggle value={form.paid_off} onValueChange={(v) => setForm((f) => ({ ...f, paid_off: v }))} />
                </View>
                {!form.paid_off ? (
                  <>
                    <Input label={t.loanLenderLabel} placeholder={t.loanLenderPlaceholder} value={form.loan_lender}
                      onChangeText={(v) => setForm((f) => ({ ...f, loan_lender: v }))} />
                    <Input label={t.loanAmountLabel} placeholder={t.loanAmountPlaceholder} keyboardType="decimal-pad"
                      leftIcon={<Text className="text-base text-gray-500">$</Text>}
                      value={fmtThousands(form.loan_amount)}
                      onChangeText={(v) => setForm((f) => ({ ...f, loan_amount: sanitizeMoney(v) }))} />
                  </>
                ) : null}
                <DatePicker label={t.purchaseDateLabel} value={form.purchase_date}
                  onChange={(v) => setForm((f) => ({ ...f, purchase_date: v }))} />
                <DatePicker label={t.warrantyExpirationLabel} value={form.warranty_expiration}
                  onChange={(v) => setForm((f) => ({ ...f, warranty_expiration: v }))} />

                {/* Assignment */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.assignmentHeading}</Text>
                <InlinePicker
                  label={t.assignedToLabel}
                  value={form.assigned_employee_id}
                  placeholder={t.assignedToNone}
                  options={[
                    { value: '', label: t.assignedToNone },
                    ...employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })),
                  ]}
                  onSelect={(v) => setForm((f) => ({ ...f, assigned_employee_id: v }))}
                  searchable
                  searchPlaceholder={t.assignedToSearch}
                  noResultsText={t.selectNoResults}
                />
                <Input label={t.locationLabel} placeholder={t.locationPlaceholder} value={form.location}
                  onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} />

                {/* Notes */}
                <Input label={t.notesLabel} placeholder={t.notesPlaceholder} value={form.notes}
                  onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline numberOfLines={3}
                  style={{ minHeight: 70, textAlignVertical: 'top' }} />

                {/* Photos — only after the equipment exists. */}
                {/* Photos — available while adding (queued locally) and editing
                   (uploaded immediately). */}
                {(modal === 'add' || (modal === 'edit' && selected)) ? (
                  <>
                    <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.photosHeading}</Text>
                    {(modal === 'add' ? pendingPhotos.length : photos.length) === 0 ? (
                      <View className="py-8 items-center rounded-2xl border-2 border-dashed border-gray-200 gap-2">
                        <ImageIcon size={20} color="#9CA3AF" />
                        <Text className="text-sm text-gray-500">{t.photoEmpty}</Text>
                      </View>
                    ) : modal === 'add' ? (
                      <View className="flex-row flex-wrap gap-2">
                        {pendingPhotos.map((uri) => (
                          <View key={uri} className="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100">
                            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            <Pressable
                              onPress={() => removePending(uri)}
                              hitSlop={6}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 items-center justify-center"
                            >
                              <X size={12} color="#EF4444" />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View className="flex-row flex-wrap gap-2">
                        {photos.map((p) => (
                          <Pressable
                            key={p.id}
                            onLongPress={() => removePhoto(p)}
                            className="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 active:opacity-80"
                          >
                            <Image
                              source={{ uri: photoUrls[p.storage_path] }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                            <Pressable
                              onPress={() => removePhoto(p)}
                              hitSlop={6}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 items-center justify-center"
                            >
                              <X size={12} color="#EF4444" />
                            </Pressable>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => pickPhoto('camera')}
                        disabled={uploadingPhoto}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 active:opacity-70 disabled:opacity-50"
                      >
                        <Camera size={16} color="#374151" />
                        <Text className="text-sm font-semibold text-gray-700">{t.photoTakeBtn}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => pickPhoto('library')}
                        disabled={uploadingPhoto}
                        className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 active:opacity-70 disabled:opacity-50"
                      >
                        <ImagePlus size={16} color="#374151" />
                        <Text className="text-sm font-semibold text-gray-700">{t.photoLibraryBtn}</Text>
                      </Pressable>
                    </View>
                    {uploadingPhoto ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#4F46E5" />
                        <Text className="text-xs text-gray-500">{t.photoUploading}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}

                {error ? <Text className="text-xs text-red-500">{error}</Text> : null}

                {/* Delete lives on the detail page (not here) — opening the
                   confirm sheet from inside this modal would nest modals. */}
                <View className="pt-3">
                  <Button onPress={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
                </View>
              </ScrollView>
            </View>

            {/* VIN barcode scanner — full-screen camera overlay (rendered
               in-place, not a nested modal which would break inside the sheet
               on iOS). */}
            {scanning ? (
              <View style={StyleSheet.absoluteFill} className="bg-black">
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['code39', 'code128', 'code93', 'datamatrix', 'qr', 'pdf417'] }}
                  onBarcodeScanned={onVinScanned}
                />
                <View style={StyleSheet.absoluteFill} pointerEvents="none" className="items-center justify-center">
                  <View className="w-72 h-28 border-2 border-white/80 rounded-2xl" />
                  <Text className="text-white text-sm mt-5 px-10 text-center">{t.scanVinHint}</Text>
                </View>
                <Pressable
                  onPress={() => setScanning(false)}
                  style={{ top: insets.top + 12 }}
                  className="absolute right-5 w-10 h-10 rounded-full bg-black/50 items-center justify-center"
                >
                  <X size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Detail view — a full-screen PAGE, not a modal, so the delete sheet
         and the photo viewer (both RNModals) present cleanly above it. iOS
         won't reliably stack transparent modals, which is why clicking
         delete / a photo did nothing when this was a modal. */}
      {modal === 'detail' && selected ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: '#F9FAFB', zIndex: 30, elevation: 30, paddingTop: insets.top }]}
        >
          <View className="flex-row items-center px-3 pt-2 pb-3 border-b border-gray-100 bg-white">
            <Pressable
              onPress={() => { setModal(null); setSelected(null); }}
              hitSlop={12}
              className="p-2 -ml-2 rounded-lg active:bg-gray-100"
            >
              <ChevronLeft size={22} color="#111827" />
            </Pressable>
            <Text className="text-lg font-bold text-gray-900 flex-1 mx-1" numberOfLines={1}>{selected.name}</Text>
            <Pressable
              onPress={() => openEdit(selected)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-gray-100"
            >
              <Pencil size={18} color="#6B7280" />
            </Pressable>
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-red-50"
            >
              <Trash2 size={18} color="#EF4444" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="px-5 pt-5 pb-32 gap-4" keyboardShouldPersistTaps="handled">
                {photos.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                    {photos.map((p, idx) => (
                      <Pressable
                        key={p.id}
                        onPress={() => setViewerIndex(idx)}
                        className="rounded-2xl overflow-hidden bg-gray-100 active:opacity-80"
                      >
                        <Image
                          source={{ uri: photoUrls[p.storage_path] }}
                          style={{ width: 170, height: 170, transform: [{ rotate: `${(p.rotation ?? 0) % 360}deg` }] }}
                          resizeMode="cover"
                        />
                        {idx === 0 ? (
                          <View className="absolute top-2 left-2 flex-row items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full">
                            <Star size={10} color="#FBBF24" fill="#FBBF24" />
                            <Text className="text-[10px] font-semibold text-white">{t.coverBadge}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {/* Vehicle */}
                <DetailCard
                  rows={[
                    { label: t.typeLabel, value: selected.equipment_type },
                    { label: t.makeLabel, value: selected.make },
                    { label: t.modelLabel, value: selected.model },
                    { label: t.yearLabel, value: selected.year != null ? String(selected.year) : null },
                    { label: t.colorLabel, value: selected.color },
                    { label: t.serialNumberLabel, value: selected.serial_number },
                    { label: t.vinLabel, value: selected.vin },
                    { label: t.mileageLabel, value: selected.mileage != null ? selected.mileage.toLocaleString('en-US') : null },
                  ]}
                />
                {/* Plate (+ expiry countdown badge, same as the list cards) */}
                {(() => {
                  const days = plateExpirationDays(selected.plate_expiration);
                  const badge =
                    days === null ? null
                    : days < 0 ? { text: t.plateExpired, bg: 'bg-red-50', fg: 'text-red-700', icon: '#B91C1C' }
                    : days <= 30 ? { text: t.plateExpiresSoon.replace('{{days}}', String(days)), bg: 'bg-amber-50', fg: 'text-amber-700', icon: '#B45309' }
                    : null;
                  return (
                    <DetailCard
                      rows={[
                        { label: t.plateNumberLabel, value: selected.plate_number },
                        { label: t.plateExpirationLabel, value: selected.plate_expiration ? formatDateLong(selected.plate_expiration, locale) : null },
                      ]}
                      footer={badge ? (
                        <View className={`self-start flex-row items-center gap-1 ${badge.bg} px-2 py-1 rounded-full`}>
                          <AlertTriangle size={11} color={badge.icon} />
                          <Text className={`text-[11px] font-semibold ${badge.fg}`}>{badge.text}</Text>
                        </View>
                      ) : null}
                    />
                  );
                })()}
                {/* Insurance (+ renewal countdown badge) */}
                {(selected.insurance_carrier || selected.insurance_policy_number || selected.insurance_agent || selected.insurance_agent_phone || selected.insurance_expiration) ? (() => {
                  const days = plateExpirationDays(selected.insurance_expiration);
                  const badge =
                    days === null ? null
                    : days < 0 ? { text: t.insuranceExpired, bg: 'bg-red-50', fg: 'text-red-700', icon: '#B91C1C' }
                    : days <= 30 ? { text: t.insuranceExpiresSoon.replace('{{days}}', String(days)), bg: 'bg-amber-50', fg: 'text-amber-700', icon: '#B45309' }
                    : null;
                  return (
                    <DetailCard
                      rows={[
                        { label: t.insuranceCarrierLabel, value: selected.insurance_carrier },
                        { label: t.insurancePolicyLabel, value: selected.insurance_policy_number },
                        { label: t.insuranceAgentLabel, value: selected.insurance_agent },
                        { label: t.insuranceAgentPhoneLabel, value: selected.insurance_agent_phone },
                        { label: t.insuranceExpirationLabel, value: selected.insurance_expiration ? formatDateLong(selected.insurance_expiration, locale) : null },
                      ]}
                      footer={badge ? (
                        <View className={`self-start flex-row items-center gap-1 ${badge.bg} px-2 py-1 rounded-full`}>
                          <AlertTriangle size={11} color={badge.icon} />
                          <Text className={`text-[11px] font-semibold ${badge.fg}`}>{badge.text}</Text>
                        </View>
                      ) : null}
                    />
                  );
                })() : null}
                {/* Value + ownership + acquisition */}
                <DetailCard
                  rows={[
                    { label: t.valueLabel, value: selected.value != null ? fmtMoney(selected.value) : null },
                    ...(selected.paid_off
                      ? [{ label: t.ownershipHeading, value: t.paidOffLabel }]
                      : [
                          { label: t.loanLenderLabel, value: selected.loan_lender },
                          { label: t.loanAmountLabel, value: selected.loan_amount != null ? fmtMoney(selected.loan_amount) : null },
                        ]),
                    { label: t.purchaseDateLabel, value: selected.purchase_date ? formatDateLong(selected.purchase_date, locale) : null },
                    { label: t.warrantyExpirationLabel, value: selected.warranty_expiration ? formatDateLong(selected.warranty_expiration, locale) : null },
                  ]}
                />
                {/* Assignment */}
                <DetailCard
                  rows={[
                    { label: t.assignedToLabel, value: employeeName(selected.assigned_employee_id) ?? t.unassignedBadge },
                    { label: t.locationLabel, value: selected.location },
                  ]}
                />
                {/* Notes */}
                <DetailCard rows={[{ label: t.notesLabel, value: selected.notes }]} />
                {/* Audit timestamps */}
                <DetailCard
                  rows={[
                    { label: t.createdLabel, value: selected.created_at ? formatDateTimeLong(selected.created_at, locale) : null },
                    { label: t.updatedLabel, value: selected.updated_at ? formatDateTimeLong(selected.updated_at, locale) : null },
                  ]}
                />
          </ScrollView>
        </View>
      ) : null}

      {/* Full-screen photo viewer — swipe between photos, rotate to fix
         orientation (persisted). Mirrors the job-photos viewer. */}
      <RNModal
        visible={viewerPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 16,
              paddingBottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Pressable onPress={() => setViewerIndex(null)} hitSlop={10}>
              <X size={26} color="#FFFFFF" />
            </Pressable>
            <Text className="text-sm font-medium text-white/80">
              {viewerIndex !== null ? `${viewerIndex + 1} / ${photos.length}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <Pressable
                onPress={() => viewerPhoto && void setCover(viewerPhoto)}
                hitSlop={10}
                accessibilityLabel={t.setCoverBtn}
              >
                <Star
                  size={22}
                  color={viewerIndex === 0 ? '#FBBF24' : '#FFFFFF'}
                  fill={viewerIndex === 0 ? '#FBBF24' : 'none'}
                />
              </Pressable>
              <Pressable onPress={rotateCurrent} hitSlop={10} accessibilityLabel="Rotate">
                <RotateCw size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <FlatList
              ref={viewerListRef}
              data={photos}
              keyExtractor={(p) => p.id}
              extraData={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={viewerIndex ?? 0}
              getItemLayout={(_, index) => ({ length: screenW, offset: screenW * index, index })}
              onMomentumScrollEnd={onViewerScrollEnd}
              renderItem={renderViewerPage}
            />
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 12,
              paddingBottom: insets.bottom + 12,
            }}
          >
            <Pressable
              onPress={() => goTo(-1)}
              disabled={viewerIndex === 0}
              hitSlop={10}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', opacity: viewerIndex === 0 ? 0.3 : 1 }}
            >
              <ChevronLeft size={26} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => goTo(1)}
              disabled={viewerIndex === photos.length - 1}
              hitSlop={10}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', opacity: viewerIndex === photos.length - 1 ? 0.3 : 1 }}
            >
              <ChevronRight size={26} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </RNModal>

      {/* Delete confirmation — bottom sheet (one-hand friendly). */}
      <RNModal
        visible={confirmingDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingDelete(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => setConfirmingDelete(false)} style={sheetScrim} />
          <View
            className="bg-white rounded-3xl px-5 pt-5 mx-3 overflow-hidden"
            style={{ paddingBottom: insets.bottom + 16, ...sheetShadow }}
          >
            <Text className="text-lg font-bold text-gray-900">{t.deleteConfirmTitle}</Text>
            <Text className="text-sm text-gray-500 mt-1.5">{t.deleteConfirmMsg}</Text>
            <View className="flex-row gap-3 mt-5">
              <View className="flex-1">
                <Button variant="secondary" onPress={() => setConfirmingDelete(false)} fullWidth>
                  {tc.buttons.cancel}
                </Button>
              </View>
              <View className="flex-1">
                <Button variant="danger" onPress={doDelete} loading={deleting} fullWidth>
                  {tc.buttons.delete}
                </Button>
              </View>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Group-by — bottom sheet. */}
      <RNModal
        visible={groupMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupMenuOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => setGroupMenuOpen(false)} style={sheetScrim} />
          <View
            className="bg-white rounded-3xl px-4 pt-3 mx-3 overflow-hidden"
            style={{ paddingBottom: insets.bottom + 12, ...sheetShadow }}
          >
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <Text className="text-lg font-bold text-gray-900 px-1 mb-3">{t.groups.title}</Text>
            <View className="gap-1">
              {groupOptions.map((o) => {
                const active = groupBy === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
                    className={`flex-row items-center gap-3 px-3 py-3 rounded-2xl ${active ? 'bg-primary/10' : 'active:bg-gray-50'}`}
                  >
                    <View className={`w-9 h-9 rounded-xl items-center justify-center ${active ? 'bg-primary' : 'bg-gray-100'}`}>
                      <o.Icon size={18} color={active ? '#FFFFFF' : '#6B7280'} />
                    </View>
                    <Text className={`flex-1 text-base ${active ? 'text-primary font-semibold' : 'text-gray-900'}`}>
                      {o.label}
                    </Text>
                    {active ? <Check size={20} color="#4F46E5" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </RNModal>
    </SafeAreaView>
  );
}
