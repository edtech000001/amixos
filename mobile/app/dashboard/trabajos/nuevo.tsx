import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal as RNModal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronDown,
  Search,
  X,
  Trash2,
  MapPin,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  DollarSign,
  FileText,
  Check,
} from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { Button, Input, Select, DatePicker } from '@amixos/shared/ui';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  city: string | null;
  state: string | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

type ItemType = 'labor' | 'material' | 'equipment' | 'other';

interface LineItem {
  id: string;
  item_type: ItemType;
  description: string;
  quantity: number;
  unit_price: number;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const newId = () => Math.random().toString(36).slice(2);
const newLaborItem = (): LineItem => ({ id: newId(), item_type: 'labor', description: '', quantity: 1, unit_price: 0 });

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function NuevoTrabajoRoute() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.jobs.new;
  const tc = full.common;
  const tStatuses = full.dashboard.jobs.statuses;
  const tPriorities = full.dashboard.jobs.priorities;

  const editId = edit ?? null;
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [isProposal, setIsProposal] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<'scheduled' | 'in_progress'>('scheduled');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([newLaborItem()]);
  const [assignedEmployees, setAssignedEmployees] = useState<string[]>([]);
  const [manualWorkers, setManualWorkers] = useState<string[]>(['']);

  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load clients + employees + (optionally) the job being edited.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      const [{ data: cl }, { data: emp }] = await Promise.all([
        supabase
          .from('clients')
          .select('id, first_name, last_name, company, city, state')
          .eq('business_id', business.id)
          .order('first_name'),
        supabase
          .from('employees')
          .select('id, first_name, last_name, role')
          .eq('business_id', business.id)
          .eq('active', true)
          .order('first_name'),
      ]);
      if (cancelled) return;
      setClients((cl ?? []) as Client[]);
      setEmployees((emp ?? []) as Employee[]);

      if (editId) {
        const [{ data: job }, { data: jobItems }, { data: assigns }] = await Promise.all([
          supabase.from('jobs').select('*').eq('id', editId).single(),
          supabase.from('job_items').select('*').eq('job_id', editId).order('created_at'),
          supabase.from('job_assignments').select('*').eq('job_id', editId),
        ]);
        if (cancelled) return;
        if (job) {
          setIsProposal(!!job.estimate_number);
          setTitle(job.title ?? '');
          setClientId(job.client_id ?? '');
          setStatus(job.status === 'in_progress' ? 'in_progress' : 'scheduled');
          setPriority(job.priority ?? 'normal');
          setAddress(job.job_address ?? '');
          setCity(job.job_city ?? '');
          setState(job.job_state ?? '');
          setScheduledDate(job.scheduled_date ?? '');
          setTimeStart(job.time_start ?? '');
          setTimeEnd(job.time_end ?? '');
          setDescription(job.description ?? '');
          setInternalNotes(job.internal_notes ?? '');
        }
        if (jobItems && jobItems.length > 0) {
          setItems(
            jobItems.map((i: any) => ({
              id: i.id,
              item_type: (i.item_type ?? 'other') as ItemType,
              description: i.description ?? '',
              quantity: i.quantity ?? 1,
              unit_price: i.unit_price ?? 0,
            })),
          );
        }
        if (assigns) {
          setAssignedEmployees(
            assigns.filter((a: any) => a.employee_id).map((a: any) => a.employee_id),
          );
          const manual = assigns
            .filter((a: any) => !a.employee_id && a.worker_name)
            .map((a: any) => a.worker_name);
          if (manual.length > 0) setManualWorkers(manual);
        }
        setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business?.id, editId]);

  // Auto-append a blank row when the last item has a description.
  useEffect(() => {
    if (items.length === 0) return;
    if (items.every((i) => i.description.trim() !== '')) {
      setItems((prev) => [...prev, newLaborItem()]);
    }
  }, [items.map((i) => i.description).join('|')]);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) =>
      [c.first_name, c.last_name, c.company].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [clients, clientSearch]);

  const pickClient = (id: string) => {
    setClientId(id);
    setClientPickerOpen(false);
    setClientSearch('');
    const c = clients.find((x) => x.id === id);
    if (c) {
      if (c.city && !city) setCity(c.city);
      if (c.state && !state) setState(c.state);
    }
  };

  const toggleEmployee = (id: string) =>
    setAssignedEmployees((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const updateItem = <K extends keyof LineItem>(id: string, field: K, value: LineItem[K]) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const ITEM_TYPE_OPTIONS = [
    { value: 'labor', label: t.itemTypeLabor },
    { value: 'material', label: t.itemTypeMaterial },
    { value: 'equipment', label: t.itemTypeEquipment },
    { value: 'other', label: t.itemTypeOther },
  ];

  const save = async () => {
    if (!business) return;
    if (!title.trim()) {
      setError(t.errorTitleRequiredJob);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const validItems = items.filter((i) => i.description.trim());
      const jobData = {
        client_id: clientId || null,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        job_address: address.trim() || null,
        job_city: city.trim() || null,
        job_state: state || null,
        scheduled_date: scheduledDate || null,
        time_start: timeStart || null,
        time_end: timeEnd || null,
        internal_notes: internalNotes.trim() || null,
        total_amount: subtotal,
      };

      let jobId: string;
      if (editId) {
        const { error: upErr } = await supabase.from('jobs').update(jobData).eq('id', editId);
        if (upErr) throw new Error(upErr.message);
        jobId = editId;
      } else {
        const { data: created, error: insErr } = await supabase
          .from('jobs')
          .insert({ business_id: business.id, status, created_by: user?.id ?? null, ...jobData })
          .select()
          .single();
        if (insErr || !created) throw new Error(insErr?.message ?? t.errorSaveGeneric);
        jobId = created.id;
      }

      // Replace items
      if (editId) await supabase.from('job_items').delete().eq('job_id', jobId);
      if (validItems.length > 0) {
        await supabase.from('job_items').insert(
          validItems.map((i) => ({
            job_id: jobId,
            item_type: i.item_type,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
        );
      }

      // Replace assignments
      if (editId) await supabase.from('job_assignments').delete().eq('job_id', jobId);
      const assignments: { job_id: string; employee_id?: string; worker_name: string }[] = [];
      assignedEmployees.forEach((empId) => {
        const emp = employees.find((e) => e.id === empId);
        if (emp) {
          assignments.push({
            job_id: jobId,
            employee_id: empId,
            worker_name: `${emp.first_name} ${emp.last_name}`,
          });
        }
      });
      manualWorkers
        .map((w) => w.trim())
        .filter(Boolean)
        .forEach((name) => assignments.push({ job_id: jobId, worker_name: name }));
      if (assignments.length > 0) {
        await supabase.from('job_assignments').insert(assignments);
      }

      router.replace(`/dashboard/trabajos/${jobId}` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorSaveGeneric);
      setSaving(false);
    }
  };

  // If we're editing a proposal, the mobile form doesn't yet support that surface.
  // Bounce the user back rather than corrupt the proposal-specific fields.
  if (editId && isProposal) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
          <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
            <ChevronLeft size={22} color="#111827" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-gray-700 text-center">
            La edición de propuestas aún no está disponible en móvil. Usa la versión web.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadingEdit) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#4F46E5" />
      </SafeAreaView>
    );
  }

  const heading = editId ? t.headingEditJob : t.headingNewJob;
  const subtitle = editId ? t.subtitleEdit : t.subtitleNewJob;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-gray-900">{heading}</Text>
          <Text className="text-xs text-gray-400">{subtitle}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-32"
          keyboardShouldPersistTaps="handled"
        >
          {/* General info */}
          <Section title={t.generalInfo}>
            <Input
              label={t.titleLabelJob}
              placeholder={t.titlePlaceholder}
              value={title}
              onChangeText={setTitle}
            />

            {/* Client picker */}
            <View className="flex flex-col gap-2 mt-3">
              <Text className="text-sm font-semibold text-gray-700">{t.clientLabel}</Text>
              <Pressable
                onPress={() => setClientPickerOpen(true)}
                className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5"
              >
                {selectedClient ? (
                  <Text className="text-base text-gray-900 flex-1" numberOfLines={1}>
                    {selectedClient.first_name} {selectedClient.last_name}
                    {selectedClient.company ? ` · ${selectedClient.company}` : ''}
                  </Text>
                ) : (
                  <Text className="text-base text-gray-400 flex-1">{t.clientPlaceholder}</Text>
                )}
                {clientId ? (
                  <Pressable
                    onPress={() => setClientId('')}
                    hitSlop={8}
                    className="mr-2 p-1 rounded-lg"
                  >
                    <X size={14} color="#9CA3AF" />
                  </Pressable>
                ) : null}
                <ChevronDown size={16} color="#9CA3AF" />
              </Pressable>
            </View>

            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <Select
                  label={t.statusLabel}
                  value={status}
                  onValueChange={(v) => setStatus(v as 'scheduled' | 'in_progress')}
                  options={[
                    { value: 'scheduled', label: tStatuses.scheduled },
                    { value: 'in_progress', label: tStatuses.in_progress },
                  ]}
                />
              </View>
              <View className="flex-1">
                <Select
                  label={t.priorityLabel}
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as 'low' | 'normal' | 'high' | 'urgent')
                  }
                  options={[
                    { value: 'low', label: tPriorities.low },
                    { value: 'normal', label: tPriorities.normal },
                    { value: 'high', label: tPriorities.high },
                    { value: 'urgent', label: tPriorities.urgent },
                  ]}
                />
              </View>
            </View>

            <View className="flex flex-col gap-2 mt-3">
              <Text className="text-sm font-semibold text-gray-700">{t.descriptionLabel}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t.descriptionPlaceholder}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[80px]"
                style={{ textAlignVertical: 'top' }}
              />
            </View>
          </Section>

          {/* Location */}
          <Section title={t.locationHeading} icon={<MapPin size={14} color="#4F46E5" />}>
            <Input
              label={t.addressLabel}
              placeholder={t.addressPlaceholder}
              value={address}
              onChangeText={setAddress}
            />
            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <Input
                  label={t.cityLabel}
                  placeholder={t.cityPlaceholder}
                  value={city}
                  onChangeText={setCity}
                />
              </View>
              <View style={{ width: 110 }}>
                <Select
                  label={t.stateLabel}
                  value={state}
                  onValueChange={setState}
                  placeholder={t.stateNone}
                  options={US_STATES.map((s) => ({ value: s, label: s }))}
                />
              </View>
            </View>
          </Section>

          {/* Schedule */}
          <Section title={t.scheduleHeading} icon={<CalendarIcon size={14} color="#4F46E5" />}>
            <DatePicker label={t.dateLabel} value={scheduledDate} onChange={setScheduledDate} />
            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <DatePicker
                  label={t.timeStartLabel}
                  mode="time"
                  value={timeStart}
                  onChange={setTimeStart}
                />
              </View>
              <View className="flex-1">
                <DatePicker
                  label={t.timeEndLabel}
                  mode="time"
                  value={timeEnd}
                  onChange={setTimeEnd}
                />
              </View>
            </View>
          </Section>

          {/* Workers */}
          <Section title={t.workersHeading} icon={<UsersIcon size={14} color="#4F46E5" />}>
            {employees.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {employees.map((emp) => {
                  const on = assignedEmployees.includes(emp.id);
                  return (
                    <Pressable
                      key={emp.id}
                      onPress={() => toggleEmployee(emp.id)}
                      className={`flex-row items-center gap-2 px-3 py-2 rounded-xl border-2 ${
                        on ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <View
                        className={`w-7 h-7 rounded-full items-center justify-center ${
                          on ? 'bg-primary' : 'bg-gray-100'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            on ? 'text-white' : 'text-gray-500'
                          }`}
                        >
                          {emp.first_name.charAt(0)}
                          {emp.last_name.charAt(0)}
                        </Text>
                      </View>
                      <Text
                        className={`text-sm font-medium ${
                          on ? 'text-primary' : 'text-gray-700'
                        }`}
                      >
                        {emp.first_name} {emp.last_name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View className="mt-4">
              <Text className="text-xs text-gray-400 mb-2">{t.additionalWorkersLabel}</Text>
              {manualWorkers.map((w, i) => (
                <View key={i} className="flex-row items-center gap-2 mb-2">
                  <TextInput
                    value={w}
                    onChangeText={(v) =>
                      setManualWorkers((prev) => prev.map((x, j) => (j === i ? v : x)))
                    }
                    placeholder={t.workerNumberPlaceholder.replace('{{count}}', String(i + 1))}
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-base text-gray-900"
                  />
                  {manualWorkers.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        setManualWorkers((prev) => prev.filter((_, j) => j !== i))
                      }
                      hitSlop={8}
                      className="p-2 rounded-xl active:bg-red-50"
                    >
                      <Trash2 size={16} color="#EF4444" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Pressable
                onPress={() => setManualWorkers((prev) => [...prev, ''])}
                hitSlop={8}
              >
                <Text className="text-sm font-semibold text-primary">{t.addWorker}</Text>
              </Pressable>
            </View>
          </Section>

          {/* Items */}
          <Section title={t.itemsHeadingJob} icon={<DollarSign size={14} color="#4F46E5" />}>
            <View className="flex flex-col gap-3">
              {items.map((item) => (
                <View
                  key={item.id}
                  className="bg-gray-50 rounded-2xl p-3 border border-gray-100"
                >
                  <View className="flex-row gap-2">
                    <View style={{ width: 130 }}>
                      <Select
                        value={item.item_type}
                        onValueChange={(v) => updateItem(item.id, 'item_type', v as ItemType)}
                        options={ITEM_TYPE_OPTIONS}
                      />
                    </View>
                    <View className="flex-1">
                      <TextInput
                        value={item.description}
                        onChangeText={(v) => updateItem(item.id, 'description', v)}
                        placeholder={t.itemDescriptionPlaceholderJob}
                        placeholderTextColor="#9CA3AF"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"
                      />
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mt-2">
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 mb-1">{t.colQty}</Text>
                      <TextInput
                        value={item.quantity ? String(item.quantity) : ''}
                        onChangeText={(v) =>
                          updateItem(item.id, 'quantity', parseFloat(v) || 0)
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#9CA3AF"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 text-center"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 mb-1">{t.colUnitPrice}</Text>
                      <TextInput
                        value={item.unit_price ? String(item.unit_price) : ''}
                        onChangeText={(v) =>
                          updateItem(item.id, 'unit_price', parseFloat(v) || 0)
                        }
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#9CA3AF"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 text-right"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[10px] text-gray-400 mb-1">{t.colTotal}</Text>
                      <View className="rounded-xl bg-white px-3 py-2 border border-gray-100">
                        <Text className="text-sm font-semibold text-gray-900 text-right">
                          {fmtMoney(item.quantity * item.unit_price)}
                        </Text>
                      </View>
                    </View>
                    {items.length > 1 ? (
                      <Pressable
                        onPress={() => removeItem(item.id)}
                        hitSlop={8}
                        className="p-2 rounded-xl active:bg-red-50 self-end"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    ) : (
                      <View style={{ width: 32 }} />
                    )}
                  </View>
                </View>
              ))}

              <View className="flex-row justify-between items-center pt-2 border-t border-gray-100">
                <Text className="text-sm text-gray-500">{t.totalEstimated}</Text>
                <Text className="text-lg font-bold text-gray-900">{fmtMoney(subtotal)}</Text>
              </View>
            </View>
          </Section>

          {/* Notes */}
          <Section title={t.notesHeading} icon={<FileText size={14} color="#4F46E5" />}>
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              {t.internalNoteLabelJob}
            </Text>
            <TextInput
              value={internalNotes}
              onChangeText={setInternalNotes}
              placeholder={t.internalNotePlaceholderJob}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[100px]"
              style={{ textAlignVertical: 'top' }}
            />
          </Section>

          {error ? (
            <View className="mt-4 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky footer actions */}
        <View
          className="border-t border-gray-100 bg-white px-5 pt-3"
          style={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
        >
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button variant="secondary" onPress={() => router.back()} fullWidth>
                {tc.buttons.cancel}
              </Button>
            </View>
            <View className="flex-[2]">
              <Button onPress={save} loading={saving} fullWidth>
                {editId ? tc.buttons.saveChanges : t.submitCreateJob}
              </Button>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Client picker modal */}
      <RNModal
        visible={clientPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setClientPickerOpen(false)}
      >
        <Pressable
          onPress={() => setClientPickerOpen(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl pt-3 pb-8"
            style={{ maxHeight: '85%' }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="px-5 mb-3">
              <Text className="text-base font-semibold text-gray-900">{t.clientLabel}</Text>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-gray-200 bg-white px-3">
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder={t.clientSearchPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  autoFocus
                  className="flex-1 py-2.5 pl-2 text-sm text-gray-900"
                />
              </View>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => pickClient('')}
                className="flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50"
              >
                <Text className={`text-sm ${!clientId ? 'text-primary font-semibold' : 'text-gray-500'}`}>
                  {t.clientNone}
                </Text>
                {!clientId ? <Check size={16} color="#4F46E5" /> : null}
              </Pressable>
              {filteredClients.map((c) => {
                const isSel = c.id === clientId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => pickClient(c.id)}
                    className={`flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50 ${
                      isSel ? 'bg-primary/5' : ''
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`text-sm ${
                          isSel ? 'text-primary font-semibold' : 'text-gray-900'
                        }`}
                        numberOfLines={1}
                      >
                        {c.first_name} {c.last_name}
                      </Text>
                      {c.company ? (
                        <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                          {c.company}
                        </Text>
                      ) : null}
                    </View>
                    {isSel ? <Check size={16} color="#4F46E5" /> : null}
                  </Pressable>
                );
              })}
              {filteredClients.length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-sm text-gray-400">{t.clientNoResults}</Text>
                </View>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-5">
      <View className="flex-row items-center gap-2 mb-3 px-1">
        {icon}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <View className="bg-white rounded-2xl border border-gray-100 p-4">
        {children}
      </View>
    </View>
  );
}
