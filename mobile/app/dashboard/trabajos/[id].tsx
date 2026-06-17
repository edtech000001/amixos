import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
  Modal as RNModal,
  TextInput,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
  Copy,
  RotateCcw,
  Building2,
  Navigation,
  MessageSquare,
  Share2,
  X,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@amixos/shared/ui';
import { delegateJob } from '@amixos/shared/lib/delegation';
import { logAudit } from '@amixos/shared/lib/audit';
import { invoiceDefaultLanguage, invoiceNumberPrefix } from '@amixos/shared/lib/invoiceTemplate';
import { can } from '@amixos/shared/lib/permissions';
import { formatDateLong, formatDateTimeLong, formatStamp } from '@amixos/shared/lib/format';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { JobPhotosSection } from '@/components/JobPhotosSection';

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
  job_map_link: string | null;
  job_lat: number | null;
  job_lng: number | null;
  scheduled_date: string | null;
  end_date: string | null;
  estimated_hours: number | null;
  completed_date: string | null;
  all_day: boolean | null;
  total_amount: number;
  internal_notes: string | null;
  worker_notes: string | null;
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
  scheduled_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  invoiced_at: string | null;
  delegated_to_business_id: string | null;
  delegated_from_business_id: string | null;
  delegated_at: string | null;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  clients: {
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    phone_cell: string | null;
    phone_office: string | null;
    email_office: string | null;
    email_home: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    custom_fields: Record<string, string> | null;
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

// Swallow Linking.openURL rejections — simulator + devices without a
// handler throw an unhandled-rejection warning otherwise.
const openLink = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

// Build a maps link for the job. Prefers the original pasted link (the user's
// exact pin), then coordinates, then the address. Works on iOS and Android.
// Returns '' if the job has no location at all.
const buildMapsUrl = (job: Job): string => {
  if (job.job_map_link?.trim()) return job.job_map_link.trim();
  if (job.job_lat != null && job.job_lng != null) {
    return `https://maps.google.com/?q=${job.job_lat},${job.job_lng}`;
  }
  const addr = `${job.job_address ?? ''} ${job.job_city ?? ''} ${job.job_state ?? ''}`.trim();
  return addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : '';
};

interface PipelineStep {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Compact "when this step was reached" stamp, shown under the label. */
  stamp?: { date: string; time: string } | null;
}

export default function JobDetailRoute() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  // ?from=map → back arrow returns to the map module. Otherwise default
  // behavior (trabajos list).
  const goBack = () => {
    if (from === 'map') {
      router.replace('/dashboard/mas/modulos/map' as never);
    } else {
      router.replace('/dashboard/trabajos' as never);
    }
  };
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.jobs;
  const td = t.detail;
  const tc = full.common;
  const dateLoc = full.dashboard.dateLocale;

  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

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
        .select(
          '*, clients(id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, city, state, zip_code, custom_fields)',
        )
        .eq('id', id)
        .single(),
      supabase.from('job_items').select('*').eq('job_id', id).order('created_at'),
    ]);
    if (j) setJob(j as Job);
    setItems((it as JobItem[] | null) ?? []);
    setLoading(false);
  };

  // useFocusEffect (not useEffect): the edit screen returns here via
  // router.replace with the SAME id, so a useEffect keyed on [id, business?.id]
  // would never re-run — leaving the detail showing stale pre-edit data
  // (description, address, internal/worker notes) until a manual refresh.
  // Reloading on focus picks up edits as soon as the user lands back here.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [id, business?.id]),
  );

  // Generate (or reuse) the public share token + open the iOS/Android share
  // sheet with the proposal URL. Returns true if the share sheet opened.
  const shareProposal = async (): Promise<boolean> => {
    if (!job) return false;
    let token = job.share_token;
    if (!token) {
      token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      await supabase.from('jobs').update({ share_token: token }).eq('id', job.id);
      setJob((prev) => (prev ? { ...prev, share_token: token } : prev));
    }
    const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? '';
    const url = webUrl ? `${webUrl}/propuesta/${token}` : `/propuesta/${token}`;
    try {
      const result = await Share.share({
        message: `${job.title}${webUrl ? `\n${url}` : ''}`,
        url, // iOS picks this up natively in addition to message
      });
      return result.action !== Share.dismissedAction;
    } catch {
      Alert.alert('', td.shareError);
      return false;
    }
  };

  // Opens the native share sheet with a crew-ready summary of the job — the
  // maps pin link, job name, client and scheduled date. The user picks the
  // recipient (Messages, WhatsApp, etc.) and channel from the share sheet.
  const shareJobToCrew = async () => {
    if (!job) return;
    const lines = [
      buildMapsUrl(job),
      job.title,
      clientName ? `${td.crewTextClient} - ${clientName}` : '',
      job.scheduled_date ? `${td.crewTextDate} - ${fmtDate(job.scheduled_date)}` : '',
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      Alert.alert('', td.shareError);
    }
  };

  // Opens the action sheet for "Enviar cotización" — lets the user share the
  // link to the client (and auto-mark as sent) or just mark as sent without
  // sending anything. Mirrors the web's share + mark-sent flow.
  const sendProposalAction = () => {
    if (!job) return;
    Alert.alert(td.sendAction, td.sendActionMessage, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: td.markOnly,
        onPress: () => updateStatus('sent'),
      },
      {
        text: td.shareAndMark,
        onPress: async () => {
          const shared = await shareProposal();
          if (shared) void updateStatus('sent');
        },
      },
    ]);
  };

  const updateStatus = async (newStatus: string) => {
    if (!job) return;
    const prevStatus = job.status;
    setUpdatingStatus(true);
    const now = new Date().toISOString();
    const update: Record<string, string | null> = { status: newStatus };
    if (newStatus === 'completed') update.completed_date = now.split('T')[0];
    if (newStatus === 'sent') update.sent_at = now;
    if (newStatus === 'accepted') update.accepted_at = now;
    if (newStatus === 'declined') update.declined_at = now;
    if (newStatus === 'cancelled') update.cancelled_at = now;
    // Work-phase step timestamps (migration 072) — drive the stepper times.
    if (newStatus === 'scheduled') update.scheduled_at = now;
    if (newStatus === 'in_progress') update.in_progress_at = now;
    if (newStatus === 'completed') update.completed_at = now;
    if (newStatus === 'invoiced') update.invoiced_at = now;
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
    const invoiceLang = invoiceDefaultLanguage(business.invoice_template);
    const invNum = `${invoiceNumberPrefix(invoiceLang)}-${String((count ?? 0) + 1).padStart(4, '0')}`;

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
        language: invoiceLang,
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
      await supabase.from('jobs').update({ status: 'invoiced', invoice_id: invoice.id, invoiced_at: new Date().toISOString() }).eq('id', job.id);
      void logAudit(supabase, business.id, 'invoice.created', 'invoice', invoice.id, {
        invoice_number: invNum,
        total_amount: total,
        from_job_id: job.id,
      });
      router.replace(`/dashboard/facturas/${invoice.id}`);
    }
    setUpdatingStatus(false);
  };

  const runDelegate = async (targetBusinessId: string) => {
    if (!job) return;
    setDelegating(true);
    // delegateJob reports known failures as { ok: false }, but the network
    // call itself can reject — catch so `delegating` never wedges the sheet
    // with every row disabled.
    const result = await delegateJob(supabase, job.id, targetBusinessId).catch(
      () => ({ ok: false as const, error: 'network' }),
    );
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
  // 'posible' (lead) jobs get a posible→scheduled→… pipeline so the stepper
  // highlights their stage; other work jobs keep the standard pipeline.
  const POSIBLE_STEP: PipelineStep = { key: 'posible', label: t.statuses.posible, icon: Sparkles, color: '#0D9488' };
  const fullPipeline = isProposal
    ? PROPOSAL_PIPELINE
    : job.status === 'posible'
      ? [POSIBLE_STEP, ...WORK_PIPELINE]
      : WORK_PIPELINE;
  // When each step was reached. Falls back to completed_date for jobs completed
  // before the work-phase timestamp columns existed (migration 072).
  const stepStampValue = (key: string): string | null => {
    switch (key) {
      case 'proposal':
      case 'posible': return job.created_at;
      case 'sent': return job.sent_at;
      case 'accepted': return job.accepted_at;
      case 'scheduled': return job.scheduled_at;
      case 'in_progress': return job.in_progress_at;
      case 'completed': return job.completed_at ?? job.completed_date;
      case 'invoiced': return job.invoiced_at;
      default: return null;
    }
  };
  const pipeline = fullPipeline
    .filter((s) => !disabled[s.key])
    .map((s) => {
      const raw = stepStampValue(s.key);
      return { ...s, stamp: raw ? formatStamp(raw, dateLoc) : null };
    });
  const pipelineIdx = pipeline.findIndex((s) => s.key === job.status);
  const isCancelled = job.status === 'cancelled' || job.status === 'declined';
  const canInvoice = (job.status === 'completed' || job.status === 'accepted') && !job.invoice_id;
  const clientName = job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null;
  const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
  const total = isProposal && job.total_amount > 0 ? job.total_amount : itemSubtotal;

  // Date-only display ("Mayo 24, 2026") — used for scheduled_date, cancelled_at, etc.
  const fmtDate = (d: string | null) => {
    if (!d) return null;
    return formatDateLong(d, dateLoc);
  };
  // Date + time ("Mayo 24, 2026, 9:30 PM") — used for created / updated_at metadata.
  const fmtDateTime = (d: string | null) => {
    if (!d) return '';
    return formatDateTimeLong(d, dateLoc);
  };

  // Determine which actions are available based on current status
  // The forward action. For `proposal`, we use a verb ("Enviar cotización")
  // that opens an action sheet — the user can share the link OR just mark
  // sent without sending anything. For everything else it's a simple
  // status nudge to the next step in the pipeline.
  const nextStatusAction = (() => {
    if (isCancelled) return null;
    if (job.status === 'posible') return { label: t.statuses.scheduled, onPress: () => updateStatus('scheduled') };
    if (job.status === 'proposal') {
      return { label: td.sendAction, onPress: sendProposalAction };
    }
    if (job.status === 'sent') return { label: t.statuses.accepted, onPress: () => updateStatus('accepted') };
    if (job.status === 'accepted') return { label: t.statuses.scheduled, onPress: () => updateStatus('scheduled') };
    if (job.status === 'scheduled') return { label: t.statuses.in_progress, onPress: () => updateStatus('in_progress') };
    if (job.status === 'in_progress') return { label: t.statuses.completed, onPress: () => updateStatus('completed') };
    return null;
  })();

  // One-step back. Walks the visible pipeline so "Programado → En progreso"
  // can be undone by tapping ←. Hidden at the first step, during cancellation,
  // and once invoiced (the invoice would need to be deleted first).
  const prevStatusAction = (() => {
    if (isCancelled) return null;
    if (job.status === 'invoiced') return null;
    const idx = pipeline.findIndex((s) => s.key === job.status);
    if (idx <= 0) return null;
    const prev = pipeline[idx - 1];
    return { label: prev.label, next: prev.key };
  })();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="flex-row gap-1">
          {isProposal ? (
            <Pressable
              onPress={shareProposal}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-primary/10"
            >
              <Send size={18} color="#4F46E5" />
            </Pressable>
          ) : null}
          {businesses.length > 1 && !job.delegated_to_business_id && can.delegateJob(currentRole) ? (
            <Pressable
              onPress={() => setDelegateOpen(true)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-primary/10"
            >
              <Building2 size={18} color="#4F46E5" />
            </Pressable>
          ) : null}
          {can.createJob(currentRole) ? (
            <Pressable
              onPress={() => router.push(`/dashboard/trabajos/nuevo?duplicate=${job.id}` as never)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-gray-100"
            >
              <Copy size={18} color="#6B7280" />
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
        {/* Title + client + created date */}
        <View className="mb-6">
          {isProposal ? (
            <Text className="text-xs font-mono text-gray-400 mb-1">{job.estimate_number}</Text>
          ) : null}
          <Text className="text-2xl font-bold text-gray-900">{job.title}</Text>
          {clientName ? (
            <Pressable
              onPress={() =>
                job.client_id &&
                router.push(
                  `/dashboard/clientes/${job.client_id}?from=job&jobId=${job.id}` as never,
                )
              }
            >
              <Text className="text-sm text-primary font-medium mt-1">
                {clientName}
                {job.clients?.company ? ` · ${job.clients.company}` : ''}
              </Text>
            </Pressable>
          ) : null}
          <Text className="text-[11px] text-gray-400 mt-1.5">
            {td.createdOn.replace('{{date}}', fmtDateTime(job.created_at))}
          </Text>
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
                  {td.cancelledOn} {fmtDateTime(job.cancelled_at)}
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
          <PipelineStrip pipeline={pipeline} currentIdx={pipelineIdx} />
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

          {nextStatusAction || prevStatusAction ? (
            <View className="flex-row gap-2">
              {prevStatusAction ? (
                <Pressable
                  onPress={() => updateStatus(prevStatusAction.next)}
                  disabled={updatingStatus}
                  className={`${nextStatusAction ? '' : 'flex-1 '}flex-row items-center justify-center gap-1.5 py-3.5 px-4 rounded-2xl bg-gray-100 border border-gray-200 active:opacity-80`}
                >
                  <Text className="text-sm font-semibold text-gray-600">← {prevStatusAction.label}</Text>
                </Pressable>
              ) : null}
              {nextStatusAction ? (
                <Pressable
                  onPress={nextStatusAction.onPress}
                  disabled={updatingStatus}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary/10 border border-primary/20 active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-primary">
                    {job.status === 'proposal' ? '' : '→ '}
                    {nextStatusAction.label}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!isCancelled ? (
            <Pressable
              onPress={shareJobToCrew}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-gray-200 active:bg-gray-50"
            >
              <MessageSquare size={16} color="#374151" />
              <Text className="text-sm font-semibold text-gray-700">{td.sendToCrew}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Details card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 gap-3">
          <Text className="text-xs font-semibold text-gray-400 uppercase">
            {td.detailsHeading}
          </Text>

          {job.scheduled_date ? (
            <View className="flex-row items-center gap-3">
              <CalendarIcon size={16} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-xs text-gray-500">{td.scheduledDate}</Text>
                <Text className="text-sm text-gray-900">
                  {fmtDate(job.scheduled_date)}
                  {job.end_date ? ` — ${fmtDate(job.end_date)}` : ''}
                </Text>
                {(() => {
                  const totalTimeText = formatProjectDuration(
                    { startDate: job.scheduled_date, endDate: job.end_date, estimatedHours: job.estimated_hours },
                    tc.duration,
                  );
                  return totalTimeText ? (
                    <Text className="text-xs text-gray-400 mt-0.5">{t.new.totalTimeLabel}: {totalTimeText}</Text>
                  ) : null;
                })()}
              </View>
            </View>
          ) : null}

          {(job.job_address || job.job_lat != null || job.job_map_link) ? (
            <Pressable
              onPress={() => setLocationModalOpen(true)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-gray-50"
            >
              <MapPin size={16} color="#6B7280" />
              <View className="flex-1">
                <Text className="text-xs text-gray-500">{td.location}</Text>
                <Text className="text-sm text-primary">
                  {job.job_address
                    ? `${job.job_address}${job.job_city ? `, ${job.job_city}` : ''}${
                        job.job_state ? ` ${job.job_state}` : ''
                      }`
                    : job.job_lat != null
                      ? `${job.job_lat?.toFixed(5)}, ${job.job_lng?.toFixed(5)}`
                      : td.openInMaps}
                </Text>
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

          {job.worker_notes ? (
            <View>
              <Text className="text-xs text-gray-500 mb-1">
                {full.dashboard.jobs.new.workerNoteLabel}
              </Text>
              <Text className="text-sm text-gray-700">{job.worker_notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Project Leader's actuals — only renders when crew mode is on AND
           the current user is the lead on this job. Component handles its
           own visibility check + DB loads. */}
        <ActualsSection
          jobId={job.id}
          businessId={job.business_id}
          crewModeOn={business?.job_crew_mode !== false}
          assignmentFieldOrder={business?.assignment_field_order ?? null}
          jobStatus={job.status}
          onCompleted={() => updateStatus('completed')}
        />

        {/* Items list */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
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

        {/* Photos */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <JobPhotosSection
            jobId={job.id}
            businessId={job.business_id}
            canWrite={can.editJobMetadata(currentRole)}
          />
        </View>

        {/* Metadata — last edited (created moved to top) */}
        <View className="gap-1 px-1 mt-4">
          <Text className="text-[10px] text-gray-400">
            {td.lastEditedOn.replace('{{date}}', fmtDateTime(job.updated_at))}
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
          className="flex-1 justify-end bg-black/40"
        >
          {/* No-op press swallows taps on the sheet so they don't close it. */}
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pb-8 pt-4">
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
                      {delegating ? (
                        <ActivityIndicator size="small" color="#4F46E5" />
                      ) : (
                        <Building2 size={16} color="#4F46E5" />
                      )}
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
            <Pressable
              onPress={() => setDelegateOpen(false)}
              disabled={delegating}
              className="mt-3 items-center py-3.5 rounded-2xl bg-gray-100 active:bg-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">
                {full.common.buttons.cancel}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Location details modal */}
      <RNModal
        visible={locationModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <Pressable
          onPress={() => setLocationModalOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          <Pressable
            onPress={() => {}}
            className="bg-white rounded-t-3xl pt-3"
            style={{ maxHeight: '85%' }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
              <Text className="text-lg font-bold text-gray-900">{td.locationModalTitle}</Text>
              <Pressable onPress={() => setLocationModalOpen(false)} hitSlop={8}>
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>
            <View className="px-5 py-5 pb-8 gap-4">
              {job.job_address ? (
                <View>
                  <Text className="text-xs text-gray-500">{td.location}</Text>
                  <Text className="text-base text-gray-900 mt-1">
                    {job.job_address}
                    {job.job_city ? `\n${job.job_city}` : ''}
                    {job.job_state ? `, ${job.job_state}` : ''}
                  </Text>
                </View>
              ) : null}

              {job.job_lat != null && job.job_lng != null ? (
                <View>
                  <Text className="text-xs text-gray-500">{td.coordinates}</Text>
                  <Text className="text-base text-gray-900 mt-1 font-mono">
                    {job.job_lat}, {job.job_lng}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => {
                  const url = buildMapsUrl(job);
                  if (url) openLink(url);
                }}
                className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-2xl active:opacity-80"
              >
                <Navigation size={16} color="#FFFFFF" />
                <Text className="text-white font-semibold text-sm">{td.openInMaps}</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const url = buildMapsUrl(job);
                  if (url) Share.share({ message: url, url }).catch(() => {});
                }}
                className="flex-row items-center justify-center gap-2 border border-gray-200 py-3.5 rounded-2xl active:bg-gray-50"
              >
                <Share2 size={16} color="#374151" />
                <Text className="text-gray-700 font-semibold text-sm">{td.shareLocation}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </RNModal>
    </SafeAreaView>
  );
}

/**
 * Horizontal scrollable status pipeline. Each step gets a fixed footprint
 * (icon + label) so labels render in full instead of "Cotiza..." truncation.
 * Auto-scrolls to keep the current step visible.
 */
function PipelineStrip({
  pipeline,
  currentIdx,
}: {
  pipeline: PipelineStep[];
  currentIdx: number;
}) {
  const STEP_WIDTH = 84;
  const CONNECTOR_WIDTH = 18;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (currentIdx < 0) return;
    // Center the current step in the visible area (rough — RN's
    // contentOffset.x is from the left edge, so subtract half a viewport
    // width's worth of step. Works well in practice across phone widths.)
    const offset = Math.max(0, currentIdx * (STEP_WIDTH + CONNECTOR_WIDTH) - 80);
    scrollRef.current?.scrollTo({ x: offset, animated: false });
  }, [currentIdx]);

  return (
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5">
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="py-4 px-3"
      >
        {pipeline.map((s, i) => {
          const Icon = s.icon;
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isLast = i === pipeline.length - 1;
          return (
            <View key={s.key} className="flex-row items-start">
              <View style={{ width: STEP_WIDTH }} className="items-center">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: isCurrent ? `${s.color}1A` : isPast ? '#F3F4F6' : '#F9FAFB',
                    borderWidth: isCurrent ? 2 : 0,
                    borderColor: isCurrent ? s.color : 'transparent',
                  }}
                >
                  <Icon
                    size={18}
                    color={isCurrent ? s.color : isPast ? '#9CA3AF' : '#D1D5DB'}
                  />
                </View>
                <Text
                  className="text-[11px] font-semibold mt-1.5 text-center"
                  style={{ color: isCurrent ? s.color : isPast ? '#9CA3AF' : '#D1D5DB' }}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
                {(isPast || isCurrent) && s.stamp?.date ? (
                  <View className="items-center mt-0.5">
                    <Text className="text-[9px] text-gray-400 text-center" numberOfLines={1}>{s.stamp.date}</Text>
                    {s.stamp.time ? (
                      <Text className="text-[9px] text-gray-300 text-center" numberOfLines={1}>{s.stamp.time}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {!isLast ? (
                <View
                  style={{
                    width: CONNECTOR_WIDTH,
                    height: 2,
                    marginTop: 19,
                    backgroundColor: isPast ? '#D1D5DB' : '#F3F4F6',
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Project Leader actuals section ──────────────────────────────────────
// Loads job_assignments + per-worker field templates and renders an editor
// only when the current user is the lead on this job. RLS allows the lead
// (field role) to update assignments via the "lead update job_assignments"
// policy in migration 033.
interface AssignmentRow {
  id: string;
  employee_id: string | null;
  worker_name: string | null;
  is_lead: boolean | null;
  hours_worked: number | null;
  custom_fields: Record<string, unknown> | null;
  employees: { user_id: string | null } | null;
}

interface AssignmentFieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

function ActualsSection({
  jobId,
  businessId,
  crewModeOn,
  assignmentFieldOrder,
  jobStatus,
  onCompleted,
}: {
  jobId: string;
  businessId: string;
  crewModeOn: boolean;
  assignmentFieldOrder: string[] | null;
  jobStatus: string;
  onCompleted: () => void;
}) {
  const supabase = createSupabaseClient();
  const user = useAuthStore((s) => s.user);
  const { t: full } = useLang();
  const tA = full.dashboard.jobs.actuals;
  const tc = full.common;

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [templates, setTemplates] = useState<AssignmentFieldTemplate[]>([]);
  const [isLead, setIsLead] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);
  // Working copy — edits are buffered in state until "Guardar" is tapped.
  const [draft, setDraft] = useState<Record<string, { hours: string; custom: Record<string, unknown> }>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: a }, { data: tpl }] = await Promise.all([
        supabase
          .from('job_assignments')
          .select('id, employee_id, worker_name, is_lead, hours_worked, custom_fields, employees(user_id)')
          .eq('job_id', jobId),
        supabase
          .from('job_assignment_field_templates')
          .select('*')
          .eq('business_id', businessId)
          .order('sort_order'),
      ]);
      if (cancelled) return;
      const rows = ((a ?? []) as unknown) as AssignmentRow[];
      const tpls = ((tpl ?? []) as AssignmentFieldTemplate[]);
      setAssignments(rows);
      setTemplates(tpls);
      const leadHere = rows.some(
        (r) => r.is_lead === true && r.employees?.user_id === user.id,
      );
      setIsLead(leadHere);
      // Seed draft from saved values.
      const initial: typeof draft = {};
      for (const r of rows) {
        initial[r.id] = {
          hours: r.hours_worked != null ? String(r.hours_worked) : '',
          custom: { ...(r.custom_fields ?? {}) },
        };
      }
      setDraft(initial);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [jobId, businessId, user?.id]);

  if (!crewModeOn || !loaded || !isLead) return null;

  // Order templates by saved order then sort_order. Saved order entries
  // look like "custom:<uuid>" — we extract the uuid to match templates.
  const orderedTemplates = (() => {
    const byId = new Map(templates.map((t) => [t.id, t]));
    if (!Array.isArray(assignmentFieldOrder) || assignmentFieldOrder.length === 0) return templates;
    const out: AssignmentFieldTemplate[] = [];
    const used = new Set<string>();
    for (const ref of assignmentFieldOrder) {
      if (typeof ref !== 'string' || !ref.startsWith('custom:')) continue;
      const tpl = byId.get(ref.slice('custom:'.length));
      if (tpl) { out.push(tpl); used.add(tpl.id); }
    }
    return [...out, ...templates.filter((t) => !used.has(t.id))];
  })();

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Sequential updates — small N (one per worker) and Supabase upsert
      // can't easily mix per-row partial updates here.
      for (const row of assignments) {
        const d = draft[row.id];
        if (!d) continue;
        const hoursNum = d.hours.trim() === '' ? null : Number(d.hours);
        await supabase
          .from('job_assignments')
          .update({
            hours_worked: Number.isFinite(hoursNum) ? hoursNum : null,
            custom_fields: d.custom,
            logged_at: new Date().toISOString(),
            logged_by: user?.id ?? null,
          })
          .eq('id', row.id);
      }
      setMsg({ text: tA.saveSuccess, isError: false });
    } catch {
      setMsg({ text: tA.saveError, isError: true });
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async () => {
    await onSave();
    onCompleted();
    void logAudit(supabase, businessId, 'job.completion_logged', 'job', jobId, {
      lead_user_id: user?.id,
      worker_count: assignments.length,
      total_hours: assignments.reduce((s, a) => s + (Number(draft[a.id]?.hours) || 0), 0),
    });
  };

  const setHours = (rowId: string, v: string) =>
    setDraft((prev) => ({ ...prev, [rowId]: { ...prev[rowId], hours: v } }));
  const setCustom = (rowId: string, key: string, v: unknown) =>
    setDraft((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], custom: { ...prev[rowId].custom, [key]: v } },
    }));

  return (
    <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
      <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">{tA.heading}</Text>
      <Text className="text-xs text-gray-500 mb-3">{tA.subtitle}</Text>

      {assignments.map((row, i) => {
        const d = draft[row.id] ?? { hours: '', custom: {} };
        return (
          <View
            key={row.id}
            className={`py-3 ${i < assignments.length - 1 ? 'border-b border-gray-50' : ''}`}
          >
            <Text className="text-sm font-semibold text-gray-900 mb-2">
              {row.worker_name ?? '—'}
            </Text>

            {/* Hours worked — the universal core field. */}
            <View className="mb-2">
              <Text className="text-xs text-gray-500 mb-1">{tA.hoursWorkedLabel}</Text>
              <TextInput
                value={d.hours}
                onChangeText={(v) => setHours(row.id, v)}
                placeholder={tA.hoursWorkedPlaceholder}
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-base text-gray-900"
              />
            </View>

            {/* Custom per-worker fields. */}
            {orderedTemplates.map((tpl) => {
              const value = d.custom[tpl.field_key];
              if (tpl.field_type === 'boolean') {
                // Three states — null/undefined, true, false. Tapping the
                // active button clears to null so workers can return to
                // "unanswered" if they tapped by mistake.
                const yesActive = value === true;
                const noActive = value === false;
                return (
                  <View key={tpl.id} className="mb-2">
                    <Text className="text-xs text-gray-500 mb-1.5">{tpl.field_label}</Text>
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => setCustom(row.id, tpl.field_key, yesActive ? null : true)}
                        className={`flex-1 rounded-xl border px-3 py-2 items-center ${yesActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
                      >
                        <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-gray-700'}`}>
                          {tc.states.yes}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setCustom(row.id, tpl.field_key, noActive ? null : false)}
                        className={`flex-1 rounded-xl border px-3 py-2 items-center ${noActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
                      >
                        <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-gray-700'}`}>
                          {tc.states.no}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }
              return (
                <View key={tpl.id} className="mb-2">
                  <Text className="text-xs text-gray-500 mb-1">{tpl.field_label}</Text>
                  <TextInput
                    value={value == null ? '' : String(value)}
                    onChangeText={(v) =>
                      setCustom(
                        row.id,
                        tpl.field_key,
                        tpl.field_type === 'number'
                          ? v.trim() === '' ? null : Number(v)
                          : v,
                      )
                    }
                    keyboardType={tpl.field_type === 'number' ? 'decimal-pad' : 'default'}
                    placeholderTextColor="#9CA3AF"
                    className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-base text-gray-900"
                  />
                </View>
              );
            })}
          </View>
        );
      })}

      {msg ? (
        <Text className={`text-xs mt-2 ${msg.isError ? 'text-red-500' : 'text-emerald-600'}`}>
          {msg.text}
        </Text>
      ) : null}

      <View className="mt-3 gap-2">
        <Button onPress={onSave} loading={saving}>{tA.saveBtn}</Button>
        {jobStatus !== 'completed' && jobStatus !== 'invoiced' ? (
          <Pressable
            onPress={markComplete}
            disabled={saving}
            className="flex-row items-center justify-center gap-2 bg-emerald-600 py-3 rounded-2xl active:opacity-80"
          >
            <CheckCircle2 size={16} color="#FFFFFF" />
            <Text className="text-white font-semibold text-sm">{tA.markCompleteBtn}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

