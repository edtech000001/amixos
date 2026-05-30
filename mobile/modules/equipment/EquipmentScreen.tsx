// Equipment module — mobile. Counterpart to web/src/modules/equipment.
// Lists every piece of equipment in the business, lets the user
// add/edit/delete, attach photos (camera or library), and assign to
// an active employee.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ChevronLeft,
  Plus,
  Search,
  Trash2,
  X,
  Image as ImageIcon,
  Camera,
  ImagePlus,
  AlertTriangle,
  User as UserIcon,
  Forklift,
} from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { Button, Input, Select, DatePicker, Toggle } from '@amixos/shared/ui';
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

interface EquipForm {
  name: string;
  equipment_type: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  mileage: string;
  plate_number: string;
  plate_expiration: string;
  paid_off: boolean;
  loan_lender: string;
  assigned_employee_id: string;
  notes: string;
}

const EMPTY_FORM: EquipForm = {
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

export default function EquipmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.equipment;
  const tc = full.common;

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
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [form, setForm] = useState<EquipForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<EquipmentPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    const data = await fetchAll<Equipment>((from, to) =>
      supabase.from('equipment').select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .range(from, to),
    );
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
      loan_lender: form.paid_off ? null : form.loan_lender.trim() || null,
      assigned_employee_id: form.assigned_employee_id || null,
      notes: form.notes.trim() || null,
    };
    if (modal === 'add') {
      const { data: created, error: err } = await supabase
        .from('equipment').insert({ ...payload, created_by: user?.id ?? null })
        .select().single();
      if (err) { setError(t.saveError); setSaving(false); return; }
      setSelected(created as Equipment);
      setModal('edit'); // switch to edit so the user can attach photos
    } else if (selected) {
      const { error: err } = await supabase.from('equipment').update(payload).eq('id', selected.id);
      if (err) { setError(t.saveError); setSaving(false); return; }
    }
    await loadEquipment();
    setSaving(false);
  };

  const onDelete = () => {
    if (!selected) return;
    Alert.alert(t.deleteConfirmTitle, t.deleteConfirmMsg, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: tc.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('equipment').delete().eq('id', selected.id);
          setModal(null); setSelected(null);
          await loadEquipment();
        },
      },
    ]);
  };

  // ── Photo capture / upload ─────────────────────────────────────────
  const pickPhoto = async (source: 'camera' | 'library') => {
    if (!business || !selected) return;
    if (photos.length >= MAX_PHOTOS_PER_EQUIPMENT) {
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
    const asset = result.assets[0];

    setUploadingPhoto(true); setError('');
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
      // Random suffix — RN doesn't ship crypto.randomUUID universally on
      // older runtimes, so fall back to a timestamp+random combo.
      const uid =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const filename = `${uid}.${ext}`;
      const path = equipmentPhotoPath(business.id, selected.id, filename);
      const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const { error: upErr } = await supabase.storage
        .from(EQUIPMENT_BUCKET)
        .upload(path, arrayBuffer, { upsert: false, contentType });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('equipment_photos').insert({
        business_id: business.id,
        equipment_id: selected.id,
        storage_path: path,
        sort_order: photos.length,
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      await loadPhotosFor(selected.id);
      await loadEquipment();
    } catch {
      setError(t.photoUploadError);
    }
    setUploadingPhoto(false);
  };

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
          <Text className="text-xs text-gray-500">{t.subtitle}</Text>
        </View>
        <Pressable
          onPress={openAdd}
          hitSlop={8}
          className="px-3 py-1.5 rounded-full bg-primary active:opacity-80 flex-row items-center gap-1"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">{t.addBtn}</Text>
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
          <View className="gap-3">
            {filtered.map((e) => {
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
                  onPress={() => openEdit(e)}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden active:bg-gray-50"
                >
                  {cover ? (
                    <Image
                      source={{ uri: equipmentPhotoUrl(supabase, cover.storage_path) }}
                      style={{ width: '100%', height: 160 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ height: 120 }} className="bg-gray-50 items-center justify-center">
                      <ImageIcon size={28} color="#D1D5DB" />
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
        )}
      </ScrollView>

      {/* Add / edit modal — same floating sheet pattern as the empleados
         modal so the look is consistent. */}
      <RNModal
        visible={modal !== null}
        transparent
        animationType="slide"
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
                <Select
                  label={t.typeLabel}
                  value={form.equipment_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, equipment_type: v }))}
                  placeholder={t.typePlaceholder}
                  options={TYPE_OPTIONS}
                />
                <Input label={t.makeLabel} placeholder={t.makePlaceholder} value={form.make}
                  onChangeText={(v) => setForm((f) => ({ ...f, make: v }))} />
                <Input label={t.modelLabel} placeholder={t.modelPlaceholder} value={form.model}
                  onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} />
                <Input label={t.yearLabel} placeholder={t.yearPlaceholder} keyboardType="number-pad"
                  value={form.year} onChangeText={(v) => setForm((f) => ({ ...f, year: v }))} />
                <Input label={t.mileageLabel} placeholder={t.mileagePlaceholder} keyboardType="number-pad"
                  value={form.mileage} onChangeText={(v) => setForm((f) => ({ ...f, mileage: v }))} />
                <Input label={t.vinLabel} placeholder={t.vinPlaceholder} value={form.vin}
                  onChangeText={(v) => setForm((f) => ({ ...f, vin: v }))} autoCapitalize="characters" />

                {/* Registration */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.registrationHeading}</Text>
                <Input label={t.plateNumberLabel} placeholder={t.plateNumberPlaceholder} value={form.plate_number}
                  onChangeText={(v) => setForm((f) => ({ ...f, plate_number: v }))} autoCapitalize="characters" />
                <DatePicker label={t.plateExpirationLabel} value={form.plate_expiration}
                  onChange={(v) => setForm((f) => ({ ...f, plate_expiration: v }))} />

                {/* Ownership */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.ownershipHeading}</Text>
                <View className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
                  <Text className="text-base text-gray-900">{t.paidOffLabel}</Text>
                  <Toggle value={form.paid_off} onValueChange={(v) => setForm((f) => ({ ...f, paid_off: v }))} />
                </View>
                {!form.paid_off ? (
                  <Input label={t.loanLenderLabel} placeholder={t.loanLenderPlaceholder} value={form.loan_lender}
                    onChangeText={(v) => setForm((f) => ({ ...f, loan_lender: v }))} />
                ) : null}

                {/* Assignment */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.assignmentHeading}</Text>
                <Select
                  label={t.assignedToLabel}
                  value={form.assigned_employee_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_employee_id: v }))}
                  placeholder={t.assignedToNone}
                  options={[
                    { value: '', label: t.assignedToNone },
                    ...employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })),
                  ]}
                />

                {/* Notes */}
                <Input label={t.notesLabel} placeholder={t.notesPlaceholder} value={form.notes}
                  onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline numberOfLines={3}
                  style={{ minHeight: 70, textAlignVertical: 'top' }} />

                {/* Photos — only after the equipment exists. */}
                {modal === 'edit' && selected ? (
                  <>
                    <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.photosHeading}</Text>
                    {photos.length === 0 ? (
                      <View className="py-8 items-center rounded-2xl border-2 border-dashed border-gray-200 gap-2">
                        <ImageIcon size={20} color="#9CA3AF" />
                        <Text className="text-sm text-gray-500">{t.photoEmpty}</Text>
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
                              source={{ uri: equipmentPhotoUrl(supabase, p.storage_path) }}
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

                <View className="flex-row gap-3 pt-3">
                  {modal === 'edit' && selected ? (
                    <View className="flex-1">
                      <Button variant="secondary" onPress={onDelete} fullWidth>
                        <Text className="text-red-600 font-semibold">{t.deleteBtn}</Text>
                      </Button>
                    </View>
                  ) : null}
                  <View className="flex-1">
                    <Button onPress={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </SafeAreaView>
  );
}
