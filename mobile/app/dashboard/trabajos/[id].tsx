import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  MapPin,
  Calendar as CalendarIcon,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Trash2,
  Pencil,
  Phone,
  RotateCcw,
  Share2,
  Building2,
  type LucideIcon,
} from 'lucide-react-native';
import { Modal as RNModal } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@amixos/shared/ui';
import { delegateJob } from '@amixos/shared/lib/delegation';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';

interface Job {
  id: string;
  business_id: string;
  client_id: string | null;
  invoice_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  total_amount: number;
  internal_notes: string | null;
  estimate_number: string | null;
  notes: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  delegated_at: string | null;
  created_at: string;
  updated_at: string;
  clients: {
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    phone_cell: string | null;
  } | null;
}

interface JobItem {
  id: string;
  item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

interface PipelineStep {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

export default function JobDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.jobs;
  const td = t.detail;
  const dateLoc = full.dashboard.dateLocale;

  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegating, setDelegating] = useState(false);

  const businesses = useAuthStore((s) => s.businesses);
  const setActiveBusiness = useAuthStore((s) => s.setActiveBusiness);
  const currentRole = useAuthStore((s) => s.currentRole);
  const tw = full.dashboard.workspaces;

  const PROPOSAL_PIPELINE: PipelineStep[] = [
    { key: 'proposal',    label: t.statuses.proposal,    icon: Clock,         color: '#6B7280' },
    { key: 'sent',        label: t.statuses.sent,        icon: Send,          color: '#2563EB' },
    { key: 'accepted',    label: t.statuses.accepted,    icon: CheckCircle2,  color: '#059669' },
    { key: 'scheduled',   label: t.statuses.scheduled,   icon: Clock,         color: '#2563EB' },
    { key: 'in_progress', label: t.statuses.in_progress, icon: AlertTriangle, color: '#D97706' },
    { key: 'completed',   label: t.statuses.completed,   icon: CheckCircle2,  color: '#059669' },
    { key: 'invoiced',    label: t.statuses.invoiced,    icon: FileText,      color: '#9333EA' },
  ];

  const WORK_PIPELINE: PipelineStep[] = [
    { key: 'scheduled',   label: t.statuses.scheduled,   icon: Clock,         color: '#2563EB' },
    { key: 'in_progress', label: t.statuses.in_progress, icon: AlertTriangle, color: '#D97706' },
    { key: 'completed',   label: t.statuses.completed,   icon: CheckCircle2,  color: '#059669' },
    { key: 'invoiced',    label: t.statuses.invoiced,    icon: FileText,      color: '#9333EA' },
  ];

  const ITEM_TYPE_LABELS: Record<string, string> = {
    labor: t.new.itemTypeLabor,
    material: t.new.itemTypeMaterial,
    equipment: t.new.itemTypeEquipment,
    other: t.new.itemTypeOther,
  };

  const load = async () => {
    if (!business || !id) return;
    setLoading(true);
    const [{ data: j }, { data: it }] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, clients(id, first_name, last_name, company, phone_cell)')
        .eq('id', id)
        .single(),
      supabase.from('job_items').select('*').eq('job_id', id).order('created_at'),
    ]);
    if (j) setJob(j as Job);
    setItems((it as JobItem[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [id, business?.id]);

  const updateStatus = async (newStatus: string) => {
    if (!job) return;
    const prevStatus = job.status;
    setUpdatingStatus(true);
    const update: Record<string, string | null> = { status: newStatus };
    if (newStatus === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    if (newStatus === 'sent') update.sent_at = new Date().toISOString();
    if (newStatus === 'accepted') update.accepted_at = new Date().toISOString();
    if (newStatus === 'declined') update.declined_at = new Date().toISOString();
    if (newStatus === 'cancelled') update.cancelled_at = new Date().toISOString();
    await supabase.from('jobs').update(update).eq('id', job.id);
    setJob((prev) => (prev ? ({ ...prev, ...update } as Job) : prev));
    void logAudit(supabase, job.business_id, 'job.status_changed', 'job', job.id, {
      from: prevStatus, to: newStatus, job_title: job.title,
    });
    setUpdatingStatus(false);
  };

  const reinstateJob = async () => {
    if (!job) return;
    setUpdatingStatus(true);
    const newStatus = job.estimate_number ? 'proposal' : 'scheduled';
    await supabase
      .from('jobs')
      .update({ status: newStatus, cancelled_at: null })
      .eq('id', job.id);
    setJob((prev) => (prev ? { ...prev, status: newStatus, cancelled_at: null } : prev));
    setUpdatingStatus(false);
  };

  const generateInvoice = async () => {
    if (!job || !business) return;
    setUpdatingStatus(true);
    const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
    const useStored = job.estimate_number && job.subtotal_amount > 0;
    const subtotal = useStored ? job.subtotal_amount : itemSubtotal;
    const taxRate = useStored ? job.tax_rate : 0;
    const taxAmount = useStored ? job.tax_amount : 0;
    const discount = useStored ? job.discount : 0;
    const total = subtotal + taxAmount - discount;

    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.id);
    const invNum = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const lineItems = items.map((i) => ({
      description: `${ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}: ${i.description}`,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    }));

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        business_id: business.id,
        client_id: job.client_id,
        invoice_number: invNum,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        line_items: lineItems,
        subtotal_amount: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount,
        total_amount: total,
        notes: job.estimate_number
          ? `${t.statuses.proposal}: ${job.estimate_number} — ${job.title}`
          : `${full.dashboard.sidebar.trabajos}: ${job.title}`,
      })
      .select()
      .single();

    if (!error && invoice) {
      await supabase.from('jobs').update({ status: 'invoiced', invoice_id: invoice.id }).eq('id', job.id);
      router.replace(`/dashboard/facturas/${invoice.id}`);
    }
    setUpdatingStatus(false);
  };

  const runDelegate = async (targetBusinessId: string) => {
    if (!job) return;
    setDelegating(true);
    const result = await delegateJob(supabase, job.id, targetBusinessId);
    setDelegating(false);
    setDelegateOpen(false);
    if (!result.ok) {
      Alert.alert('', tw.delegateError);
      return;
    }
    const targetBiz = businesses.find((b) => b.id === targetBusinessId);
    Alert.alert(
      tw.delegateSuccess.replace('{{name}}', targetBiz?.name ?? ''),
      undefined,
      [
        { text: full.common.buttons.close, style: 'cancel' },
        targetBiz
          ? {
              text: tw.switchToTarget.replace('{{name}}', targetBiz.name),
              onPress: () => {
                setActiveBusiness(targetBusinessId);
                router.replace(`/dashboard/trabajos/${result.newJobId}` as never);
              },
            }
          : null,
      ].filter(Boolean) as { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[],
    );
  };

  const confirmDelete = () => {
    Alert.alert(td.deleteJobTitle, td.deleteJobConfirm, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: td.deleteBtn,
        style: 'destructive',
        onPress: async () => {
          if (!job) return;
          void logAudit(supabase, job.business_id, 'job.deleted', 'job', job.id, {
            job_title: job.title, estimate_number: job.estimate_number,
          });
          await supabase.from('job_items').delete().eq('job_id', job.id);
          await supabase.from('job_assignments').delete().eq('job_id', job.id);
          const { error } = await supabase.from('jobs').delete().eq('id', job.id);
          if (!error) router.replace('/dashboard/trabajos' as never);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#4F46E5" />
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <Text className="text-sm text-gray-500">{t.notFound}</Text>
      </SafeAreaView>
    );
  }

  const isProposal = !!job.estimate_number;
  const disabled = business?.job_pipeline_disabled ?? {};
  const fullPipeline = isProposal ? PROPOSAL_PIPELINE : WORK_PIPELINE;
  const pipeline = fullPipeline.filter((s) => !disabled[s.key]);
  const pipelineIdx = pipeline.findIndex((s) => s.key === job.status);
  const isCancelled = job.status === 'cancelled' || job.status === 'declined';
  const canInvoice = (job.status === 'completed' || job.status === 'accepted') && !job.invoice_id;
  const clientName = job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null;
  const clientPhone = job.clients?.phone_cell;
  const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
  const total = isProposal && job.total_amount > 0 ? job.total_amount : itemSubtotal;

  const fmtDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString(dateLoc, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Determine which actions are available based on current status
  const nextStatusAction = (() => {
    if (isCancelled) return null;
    if (job.status === 'proposal') return { label: t.statuses.sent, next: 'sent' };
    if (job.status === 'sent') return { label: t.statuses.accepted, next: 'accepted' };
    if (job.status === 'accepted') return { label: t.statuses.scheduled, next: 'scheduled' };
    if (job.status === 'scheduled') return { label: t.statuses.in_progress, next: 'in_progress' };
    if (job.status === 'in_progress') return { label: t.statuses.completed, next: 'completed' };
    return null;
  })();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.replace('/dashboard/trabajos' as never)}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="flex-row gap-1">
          {businesses.length > 1 && !job.delegated_to_business_id && can.delegateJob(currentRole) ? (
            <Pressable
              onPress={() => setDelegateOpen(true)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-primary/10"
            >
              <Share2 size={18} color="#4F46E5" />
            </Pressable>
          ) : null}
          {can.editJobMetadata(currentRole) ? (
            <Pressable
              onPress={() => router.push(`/dashboard/trabajos/nuevo?edit=${job.id}` as never)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-gray-100"
            >
              <Pencil size={18} color="#6B7280" />
            </Pressable>
          ) : null}
          {can.deleteJob(currentRole) ? (
            <Pressable
              onPress={confirmDelete}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-red-50"
            >
              <Trash2 size={18} color="#EF4444" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-6 pt-6 pb-36">
        {/* Title + client */}
        <View className="mb-6">
          {isProposal ? (
            <Text className="text-xs font-mono text-gray-400 mb-1">{job.estimate_number}</Text>
          ) : null}
          <Text className="text-2xl font-bold text-gray-900">{job.title}</Text>
          {clientName ? (
            <Pressable
              onPress={() =>
                job.client_id && router.push(`/dashboard/clientes/${job.client_id}` as never)
              }
            >
              <Text className="text-sm text-primary font-medium mt-1">
                {clientName}
                {job.clients?.company ? ` · ${job.clients.company}` : ''}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Cancelled / declined banner */}
        {isCancelled ? (
          <View className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5 flex-row items-start gap-3">
            <AlertTriangle size={18} color="#DC2626" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-red-700">
                {job.status === 'cancelled' ? td.cancelledBanner : td.declinedBanner}
              </Text>
              {job.cancelled_at ? (
                <Text className="text-xs text-red-600 mt-0.5">
                  {td.cancelledOn} {fmtDate(job.cancelled_at)}
                </Text>
              ) : null}
              <Pressable
                onPress={reinstateJob}
                disabled={updatingStatus}
                className="self-start mt-2 flex-row items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-red-200 active:bg-red-50"
              >
                <RotateCcw size={12} color="#DC2626" />
                <Text className="text-xs font-semibold text-red-600">{td.reinstate}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Status pipeline */}
        {!isCancelled ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
            <View className="flex-row justify-between">
              {pipeline.map((s, i) => {
                const Icon = s.icon;
                const isPast = i < pipelineIdx;
                const isCurrent = i === pipelineIdx;
                return (
                  <View key={s.key} className="flex-1 items-center">
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: isCurrent ? `${s.color}1A` : isPast ? '#F3F4F6' : '#F9FAFB',
                        borderWidth: isCurrent ? 2 : 0,
                        borderColor: isCurrent ? s.color : 'transparent',
                      }}
                    >
                      <Icon
                        size={16}
                        color={isCurrent ? s.color : isPast ? '#9CA3AF' : '#D1D5DB'}
                      />
                    </View>
                    <Text
                      className="text-[10px] font-semibold mt-1 text-center"
                      style={{ color: isCurrent ? s.color : isPast ? '#9CA3AF' : '#D1D5DB' }}
                      numberOfLines={1}
                    >
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Primary actions */}
        <View className="gap-2 mb-5">
          {canInvoice ? (
            <Button onPress={generateInvoice} loading={updatingStatus} fullWidth>
              <FileText size={16} color="#FFFFFF" />
              <Text className="text-white font-semibold ml-2">{td.generateInvoiceBtn}</Text>
            </Button>
          ) : null}

          {job.invoice_id ? (
            <Pressable
              onPress={() => router.push(`/dashboard/facturas/${job.invoice_id}` as never)}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-gray-200 active:bg-gray-50"
            >
              <FileText size={16} color="#374151" />
              <Text className="text-sm font-semibold text-gray-700">{td.viewInvoiceBtn}</Text>
            </Pressable>
          ) : null}

          {nextStatusAction ? (
            <Pressable
              onPress={() => updateStatus(nextStatusAction.next)}
              disabled={updatingStatus}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary/10 border border-primary/20 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-primary">→ {nextStatusAction.label}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Details card */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 gap-3">
          <Text className="text-xs font-semibold text-gray-400 uppercase">
            {td.detailsHeading}
          </Text>

          {job.scheduled_date ? (
            <View className="flex-row items-center gap-3">
              <CalendarIcon size={16} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-xs text-gray-500">{td.scheduledDate}</Text>
                <Text className="text-sm text-gray-900">{fmtDate(job.scheduled_date)}</Text>
              </View>
            </View>
          ) : null}

          {job.job_address ? (
            <View className="flex-row items-start gap-3">
              <MapPin size={16} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-xs text-gray-500">{td.location}</Text>
                <Text className="text-sm text-gray-900">
                  {job.job_address}
                  {job.job_city ? `, ${job.job_city}` : ''}
                  {job.job_state ? ` ${job.job_state}` : ''}
                </Text>
              </View>
            </View>
          ) : null}

          {clientPhone ? (
            <Pressable
              onPress={() => {
                /* TODO: implement tel: link with Linking */
              }}
              className="flex-row items-center gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <Phone size={16} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-xs text-gray-500">{td.callClient}</Text>
                <Text className="text-sm text-primary">{clientPhone}</Text>
              </View>
            </Pressable>
          ) : null}

          {job.description ? (
            <View>
              <Text className="text-xs text-gray-500 mb-1">{td.description}</Text>
              <Text className="text-sm text-gray-900">{job.description}</Text>
            </View>
          ) : null}

          {job.internal_notes ? (
            <View>
              <Text className="text-xs text-gray-500 mb-1">{td.internalNote}</Text>
              <Text className="text-sm text-gray-700">{job.internal_notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Items list */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
            {isProposal ? td.itemsHeadingProposal : td.itemsHeadingJob}
          </Text>

          {items.length === 0 ? (
            <Text className="text-sm text-gray-400 py-2">{td.noItems}</Text>
          ) : (
            <View>
              {items.map((it, i) => (
                <View
                  key={it.id}
                  className={`flex-row items-start gap-3 py-3 ${
                    i < items.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-xs text-gray-400 mb-0.5">
                      {ITEM_TYPE_LABELS[it.item_type] ?? it.item_type}
                    </Text>
                    <Text className="text-sm text-gray-900">{it.description}</Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {it.quantity} × {fmt(it.unit_price)}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900">{fmt(it.total)}</Text>
                </View>
              ))}

              {isProposal && (job.tax_rate > 0 || job.discount > 0) ? (
                <View className="border-t border-gray-100 mt-2 pt-2 gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">{td.tax}</Text>
                    <Text className="text-xs text-gray-700">{fmt(job.tax_amount)}</Text>
                  </View>
                  {job.discount > 0 ? (
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">{td.discount}</Text>
                      <Text className="text-xs text-gray-700">−{fmt(job.discount)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View className="border-t border-gray-100 mt-3 pt-3 flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-gray-900">
                  {isProposal ? td.totalEstimated : td.totalEstimated}
                </Text>
                <Text className="text-lg font-bold text-gray-900">{fmt(total)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Metadata */}
        <View className="gap-1 px-1">
          <Text className="text-[10px] text-gray-400">
            {td.createdOn} {fmtDate(job.created_at)}
          </Text>
          {job.delegated_to_business_id ? (
            <Text className="text-[10px] text-primary mt-1">
              {tw.delegatedBadge.replace(
                '{{name}}',
                businesses.find((b) => b.id === job.delegated_to_business_id)?.name ?? '',
              )}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Delegate target picker */}
      <RNModal
        visible={delegateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDelegateOpen(false)}
      >
        <Pressable
          onPress={() => setDelegateOpen(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl px-4 pb-8 pt-4"
          >
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <Text className="text-base font-semibold text-gray-900 px-3">
              {tw.delegateModalTitle}
            </Text>
            <Text className="text-xs text-gray-500 px-3 mt-1 mb-4">
              {tw.delegateChooseTarget}
            </Text>
            <View className="bg-gray-50 rounded-2xl overflow-hidden">
              {businesses
                .filter((b) => b.id !== job.business_id)
                .map((b, i, arr) => (
                  <Pressable
                    key={b.id}
                    onPress={() => runDelegate(b.id)}
                    disabled={delegating}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      i < arr.length - 1 ? 'border-b border-gray-100' : ''
                    } active:bg-gray-100`}
                  >
                    <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                      <Building2 size={16} color="#4F46E5" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
                        {b.name}
                      </Text>
                      {b.city ? (
                        <Text className="text-xs text-gray-500">
                          {b.city}
                          {b.state ? `, ${b.state}` : ''}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
            </View>
          </Pressable>
        </Pressable>
      </RNModal>
    </SafeAreaView>
  );
}
