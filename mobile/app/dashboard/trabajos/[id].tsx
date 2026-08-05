import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Platform,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
  XCircle,
  Share2,
  X,
  Sparkles,
  type LucideIcon, Archive, DollarSign, PenLine, Download } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { useConfirmSheet } from '@/lib/useConfirmSheet';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { createSupabaseClient } from '@/lib/supabase';
import { WEB_APP_URL } from '@/lib/webUrl';
import { queuedUpdate } from '@/lib/offline/mutate';
import { loadCached, patchCached, writeCached } from '@/lib/offline/cache';
import { swrRead } from '@amixos/shared/lib/swrCache';
import { Button } from '@amixos/shared/ui';
import { delegateJob } from '@amixos/shared/lib/delegation';
import { jobShortCode } from '@amixos/shared/lib/jobRef';
import { secureShareToken } from '@amixos/shared/lib/shareToken';
import { logAudit } from '@amixos/shared/lib/audit';
import { removeJobFromInvoice, placeholderQtyFor } from '@amixos/shared/lib/invoicing';
import { invoiceDefaultLanguage, nextInvoiceNumber, resolveConfig, buildInvoiceViewModel, buildInvoiceHtml, type InvoiceBranding, type InvoiceDocData } from '@amixos/shared/lib/invoiceTemplate';
import { renderInvoiceEmail } from '@amixos/shared/lib/invoiceEmail';
import { memberNameMap } from '@amixos/shared/lib/memberNames';
import { can } from '@amixos/shared/lib/permissions';
import { rowToPriceSheetItem, autopriceLine, suggestPriceItem, matchingAddons, extractQuantity, type PriceSheetItem, type PriceSheetRow } from '@amixos/shared/lib/priceSheet';
import { formatDateLong, formatDateTimeLong, formatStamp, formatNumberGrouped, formatTime12h, todayLocalISO } from '@amixos/shared/lib/format';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { parseJobLayout, fieldsInSection, type JobLayoutSection } from '@amixos/shared/lib/jobSections';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { JobPhotosSection } from '@/components/JobPhotosSection';
import { JobDocumentsSection } from '@/components/JobDocumentsSection';
import { SignaturePad } from '@/components/SignaturePad';

// Local-date helpers for the schedule sheet (avoid UTC parsing shifting the
// picked day across midnight).
const parseISODate = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const toISODate = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// The public link stores PNG data-URLs (canvas); on-site signing stores
// utf8-encoded SVG data-URLs (react-native-svg pad). RN's <Image> can't
// render SVG, so branch to SvgXml for those.
function SignatureImage({ uri }: { uri: string }) {
  if (uri.startsWith('data:image/svg+xml;utf8,')) {
    const xml = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length));
    return <SvgXml xml={xml} width={200} height={56} />;
  }
  return <Image source={{ uri }} style={{ width: 200, height: 56 }} resizeMode="contain" />;
}

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
  time_start: string | null;
  time_end: string | null;
  total_hours: number | null;
  driver_hours: number | null;
  driver_names: string[] | null;
  completed_date: string | null;
  all_day: boolean | null;
  total_amount: number;
  internal_notes: string | null;
  worker_notes: string | null;
  archived_at: string | null;
  estimate_number: string | null;
  external_ref: string | null;
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
  created_by: string | null;
  updated_by: string | null;
  client_response: 'accepted' | 'declined' | null;
  client_responded_at: string | null;
  client_signed_name: string | null;
  client_signature: string | null;
  created_at: string;
  updated_at: string;
  custom_fields: Record<string, string> | null;
  clients: {
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    phone_cell: string | null;
    phone_office: string | null;
    email: string | null;
    email_office: string | null;
    email_home: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    custom_fields: Record<string, string> | null;
  } | null;
}

interface JobAssignment {
  id: string;
  worker_name: string | null;
  is_lead: boolean | null;
  employees: { first_name: string; last_name: string; user_id: string | null } | null;
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
  const { id, from, invoice: fromInvoice } = useLocalSearchParams<{ id: string; from?: string; invoice?: string }>();
  // ?from=map → back returns to the map module; ?from=calendar → back returns
  // to the calendar; ?from=invoice → back to that invoice. Otherwise default
  // behavior (trabajos list).
  const goBack = () => {
    if (from === 'map') {
      router.replace('/dashboard/mas/modulos/map' as never);
    } else if (from === 'calendar') {
      router.replace('/dashboard/mas/calendario' as never);
    } else if (from === 'invoice' && fromInvoice) {
      router.replace(`/dashboard/facturas/${fromInvoice}` as never);
    } else if (router.canGoBack()) {
      // Pop back to the existing list screen (each section is its own Stack)
      // so the list keeps its scroll position and loaded data — replace()
      // would build a fresh list from scratch, resetting both.
      router.back();
    } else {
      router.replace('/dashboard/trabajos' as never);
    }
  };
  const supabase = createSupabaseClient();
  const c = useThemeColors();
  const { business } = useApp();
  // Labor/Material/Equipment/Other categories on job line items — hidden when
  // the business turns them off (billed flat / by qty × rate instead).
  const showItemTypes = business?.job_item_types_enabled !== false;
  const { t: full, locale } = useLang();
  const t = full.dashboard.jobs;
  const td = t.detail;
  const { confirm: confirmAction, confirmSheet } = useConfirmSheet();
  const tc = full.common;
  const dateLoc = full.dashboard.dateLocale;

  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [templates, setTemplates] = useState<{ id: string; field_key: string; field_label: string; field_type: 'text' | 'number' | 'date' | 'boolean' | 'select' }[]>([]);
  const [itemsEditOpen, setItemsEditOpen] = useState(false);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [priceItems, setPriceItems] = useState<PriceSheetItem[]>([]);
  const [clientTierId, setClientTierId] = useState<string | null>(null);
  const [showPriceVerify, setShowPriceVerify] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [unInvoicing, setUnInvoicing] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const businesses = useAuthStore((s) => s.businesses);

  // Custom fields follow the saved layout (Ajustes → Trabajos): fields
  // assigned to real sections render inside the Details card in layout order;
  // only 'additional' fields get their own card — mirrors the job form.
  type DetailTemplate = (typeof templates)[number];
  const customLayout = useMemo(
    () => parseJobLayout(business?.job_field_layout, templates.map(tpl => `custom:${tpl.id}`)),
    [business?.job_field_layout, templates],
  );
  const customsFor = (secs: JobLayoutSection[]) =>
    secs
      .flatMap(sec => fieldsInSection(customLayout, sec))
      .map(k => templates.find(tpl => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is DetailTemplate => !!tpl);
  const detailCustoms = customsFor(['general', 'location', 'schedule', 'workers', 'notes']);
  const additionalCustoms = customsFor(['additional']);
  const customValue = (tpl: DetailTemplate): string | null => {
    const raw = job?.custom_fields?.[tpl.field_key];
    if (raw == null || raw === '') return null;
    return tpl.field_type === 'boolean' ? (raw === 'true' ? (locale === 'es' ? 'Sí' : 'Yes') : 'No')
      : tpl.field_type === 'number' ? formatNumberGrouped(raw)
      : tpl.field_type === 'date' ? formatDateLong(raw, locale)
      : raw;
  };
  // Stacked label-over-value, matching the other Details rows.
  const renderCustomRow = (tpl: DetailTemplate) => {
    const value = customValue(tpl);
    if (value === null) return null;
    return (
      <View key={tpl.id}>
        <Text className="text-xs text-muted mb-1">{tpl.field_label}</Text>
        <Text className="text-sm text-ink">{value}</Text>
      </View>
    );
  };
  const setActiveBusiness = useAuthStore((s) => s.setActiveBusiness);
  const currentRole = useAuthStore((s) => s.currentRole);
  const authUser = useAuthStore((s) => s.user);
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

  // True once ANY snapshot (cached or live) is on screen — focus revalidates
  // then run silently instead of blanking back to the spinner.
  const hasDataRef = useRef(false);
  const load = async () => {
    if (!business || !id) return;
    // Cache-first: paint the last saved snapshot immediately (instant open +
    // offline), then let the live fetch below replace it.
    if (!hasDataRef.current) {
      const [cj, ci, ca] = await Promise.all([
        swrRead<Job>(`job_${id}`),
        swrRead<JobItem[]>(`job_items_${id}`),
        swrRead<JobAssignment[]>(`job_assignments_${id}`),
      ]);
      if (cj?.data && !hasDataRef.current) {
        setJob(cj.data);
        setItems(ci?.data ?? []);
        setAssignments(ca?.data ?? []);
        hasDataRef.current = true;
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
    // Cached so a crew can open the job offline (to mark status / log actuals).
    // Each fetcher throws on error so loadCached can fall back to the cache.
    const [jobRes, itemsRes, asgRes] = await Promise.all([
      loadCached(`job_${id}`, async () => {
        const { data, error } = await supabase
          .from('jobs')
          .select(
            '*, clients(id, first_name, last_name, company, phone_cell, phone_office, email, email_office, email_home, address, city, state, zip_code, custom_fields)',
          )
          .eq('id', id)
          .single();
        if (error) throw error;
        return data;
      }),
      loadCached(`job_items_${id}`, async () => {
        const { data, error } = await supabase.from('job_items').select('*').eq('job_id', id).order('created_at');
        if (error) throw error;
        return (data as JobItem[] | null) ?? [];
      }),
      loadCached(`job_assignments_${id}`, async () => {
        const { data, error } = await supabase
          .from('job_assignments')
          .select('id, worker_name, is_lead, employees(first_name, last_name, user_id)')
          .eq('job_id', id);
        if (error) throw error;
        return data ?? [];
      }),
    ]);
    // Custom-field templates for the read-only view (offline-cached).
    void loadCached(`job_field_templates_${business.id}`, async () => {
      const { data, error } = await supabase
        .from('job_field_templates')
        .select('id, field_key, field_label, field_label_es, field_label_en, field_type')
        .eq('business_id', business.id)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    }).then(res => setTemplates(localizeTemplates((res.data as typeof templates) ?? [], locale)));
    // Set null (not "leave as-is") when the row is gone — otherwise a deleted
    // job id reuses this screen's previous job, showing the wrong record
    // instead of the not-found state. (Offline with no cache also lands here.)
    setJob(jobRes.data ? (jobRes.data as Job) : null);
    setItems((itemsRes.data as JobItem[] | null) ?? []);
    setAssignments((asgRes.data as unknown as JobAssignment[] | null) ?? []);
    hasDataRef.current = !!jobRes.data;
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
    }, [id, business?.id, locale]),
  );

  // user_id → display name, for the "created by / edited by" lines
  // (migration 150 stamps created_by/updated_by at the DB level).
  const [nameById, setNameById] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!business) return;
    void memberNameMap(supabase, business.id).then(setNameById);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);
  const byUser = (userId: string | null | undefined) =>
    userId && nameById[userId] ? ` · ${td.byUser.replace('{{name}}', nameById[userId])}` : '';

  // Generate (or reuse) the public share token + open the iOS/Android share
  // sheet with the proposal URL. Returns true if the share sheet opened.
  const shareProposal = async (): Promise<boolean> => {
    if (!job) return false;
    let token = job.share_token;
    if (!token) {
      token = secureShareToken();
      await supabase.from('jobs').update({ share_token: token }).eq('id', job.id);
      setJob((prev) => (prev ? { ...prev, share_token: token } : prev));
    }
    const url = `${WEB_APP_URL}/propuesta/${token}`;
    try {
      const result = await Share.share({
        message: `${job.title}\n${url}`,
        url, // iOS picks this up natively in addition to message
      });
      return result.action !== Share.dismissedAction;
    } catch {
      Alert.alert('', td.shareError);
      return false;
    }
  };

  // Texts the assigned crew lead a ready-to-send summary: the maps pin link,
  // job name, client and scheduled date. We open the SMS composer directly
  // (sms: with a body) rather than the OS share sheet because iOS Messages
  // drops the surrounding text when a shared message leads with a URL — the
  // composer keeps the full body verbatim. Pre-addresses the lead when they
  // have a phone on file; otherwise opens an unaddressed draft + falls back to
  // the share sheet if SMS isn't available.
  const shareJobToCrew = async () => {
    if (!job) return;
    const lines = [
      buildMapsUrl(job),
      job.title,
      clientName ? `${td.crewTextClient}: ${clientName}` : '',
      job.scheduled_date ? `${td.crewTextDate}: ${fmtDate(job.scheduled_date)}` : '',
    ].filter(Boolean);
    // Blank line between fields — keeps the text readable and stops iOS
    // Messages from gluing the map-link preview to the job name.
    const message = lines.join('\n\n');

    // Look up the assigned lead's phone to pre-address the text.
    let leadDigits = '';
    try {
      const { data } = await supabase
        .from('job_assignments')
        .select('employees(phone)')
        .eq('job_id', job.id)
        .eq('is_lead', true)
        .limit(1)
        .maybeSingle();
      const phone = (data?.employees as { phone?: string | null } | null)?.phone;
      if (phone) leadDigits = phone.replace(/\D/g, '');
    } catch {
      /* no lead / no read access — fall through to an unaddressed draft */
    }

    // iOS uses `&body=`, Android uses `?body=`.
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${leadDigits}${sep}body=${encodeURIComponent(message)}`;
    const canSms = await Linking.canOpenURL(smsUrl).catch(() => false);
    if (canSms) {
      openLink(smsUrl);
      return;
    }
    // Simulator / no SMS app — fall back to the share sheet so the draft is
    // still usable.
    try {
      await Share.share({ message });
    } catch {
      Alert.alert('', td.shareError);
    }
  };

  // One step back in the pipeline. Stepping a SIGNED estimate back before
  // "accepted" invalidates the client's signed approval (the estimate is no
  // longer accepted), so it warns first and clears the signature — same rule
  // as reinstate, with a record kept in the activity log.
  const stepBack = (prevKey: string) => {
    if (!job) return;
    const invalidatesSignature = !!job.client_signature && ['proposal', 'sent'].includes(prevKey);
    if (!invalidatesSignature) { void updateStatus(prevKey); return; }
    confirmAction({
      title: td.backStepSignedConfirm,
      confirmText: tc.buttons.continue,
      destructive: true,
      onConfirm: () => void (async () => {
        await updateStatus(prevKey, {
          client_response: null, client_responded_at: null,
          client_signed_name: null, client_signature: null,
        });
        void logAudit(supabase, job.business_id, 'job.signature_cleared', 'job', job.id, {
          job_title: job.title, signed_name: job.client_signed_name, signed_at: job.client_responded_at,
        });
      })(),
    });
  };

  // ── Schedule prompt ──
  // "Programar" with no date yet would flip the status to scheduled while
  // the job silently has no date — ask for the date first and write both
  // together. Jobs that already carry a date advance directly.
  const [schedSheetOpen, setSchedSheetOpen] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const promptSchedule = () => {
    if (!job) return;
    if (job.scheduled_date) { void updateStatus('scheduled'); return; }
    setSchedDate(todayLocalISO());
    setSchedSheetOpen(true);
  };
  const saveSchedule = async () => {
    if (!schedDate) return;
    await updateStatus('scheduled', { scheduled_date: schedDate });
    setSchedSheetOpen(false);
  };
  // Android's picker is a native dialog (not an RNModal), so it can safely
  // open above the schedule sheet; iOS embeds a spinner inline instead
  // (presenting a second RNModal over one is silently refused on iOS).
  const openAndroidDatePicker = () => {
    DateTimePickerAndroid.open({
      value: parseISODate(schedDate || todayLocalISO()),
      mode: 'date',
      onChange: (e: { type: string }, d?: Date) => {
        if (e.type === 'set' && d) setSchedDate(toISODate(d));
      },
    });
  };

  // ── Sign on site — the client signs on this device ──
  // Same proof fields as the public accept-and-sign link, but written
  // directly (owner is authenticated). queuedUpdate keeps it working
  // offline — job sites without signal are exactly where this gets used.
  const [signSheetOpen, setSignSheetOpen] = useState(false);
  const [onsiteName, setOnsiteName] = useState('');
  const [onsiteSig, setOnsiteSig] = useState<string | null>(null);
  const [onsiteError, setOnsiteError] = useState('');
  const [onsiteSaving, setOnsiteSaving] = useState(false);
  const openSignSheet = () => {
    setOnsiteName(job?.clients ? `${job.clients.first_name} ${job.clients.last_name}`.trim() : '');
    setOnsiteSig(null);
    setOnsiteError('');
    setSignSheetOpen(true);
  };
  const saveOnsiteSignature = async () => {
    if (!job) return;
    const name = onsiteName.trim();
    if (!name || !onsiteSig) { setOnsiteError(full.proposal.missingFields); return; }
    setOnsiteSaving(true);
    const now = new Date().toISOString();
    const update = {
      status: 'accepted', accepted_at: now,
      client_response: 'accepted', client_responded_at: now,
      client_signed_name: name, client_signature: onsiteSig,
    };
    try {
      await queuedUpdate({
        table: 'jobs',
        match: { id: job.id },
        payload: update,
        businessId: job.business_id,
        label: `${t.statuses.accepted}: ${job.title}`,
      });
    } catch {
      setOnsiteSaving(false);
      Alert.alert('', td.statusUpdateError);
      return;
    }
    setJob(prev => (prev ? ({ ...prev, ...update } as Job) : prev));
    void patchCached(`job_${job.id}`, update);
    void logAudit(supabase, job.business_id, 'job.status_changed', 'job', job.id, {
      from: job.status, to: 'accepted', job_title: job.title, signed_name: name, onsite: true,
    });
    setOnsiteSaving(false);
    setSignSheetOpen(false);
  };

  // Email the estimate: open the mail composer pre-filled with the client's
  // address + the public accept-and-sign link, then mark sent (mirrors the
  // invoice's send flow on web).
  const emailProposal = async () => {
    if (!job) return;
    const cl = job.clients;
    // Look the email up fresh at send time — the page may hold client data
    // from before the user just added an email — and fall back to the
    // client's contact people when the client record itself has none.
    let email = '';
    if (job.client_id) {
      const { data: fresh } = await supabase
        .from('clients')
        .select('email, email_office, email_home')
        .eq('id', job.client_id)
        .maybeSingle();
      email = fresh?.email || fresh?.email_office || fresh?.email_home || '';
      if (!email) {
        const { data: contacts } = await supabase
          .from('client_contacts')
          .select('email, is_primary')
          .eq('client_id', job.client_id)
          .not('email', 'is', null)
          .order('is_primary', { ascending: false })
          .limit(1);
        email = contacts?.[0]?.email ?? '';
      }
    }
    if (!email) { Alert.alert('', td.sendNoEmail); return; }
    let token = job.share_token;
    if (!token) {
      token = secureShareToken();
      await supabase.from('jobs').update({ share_token: token }).eq('id', job.id);
      setJob((prev) => (prev ? { ...prev, share_token: token } : prev));
    }
    const webUrl = WEB_APP_URL;
    const url = `${webUrl}/propuesta/${token}`;
    const { subject, body } = renderInvoiceEmail({
      subjectTemplate: null,
      bodyTemplate: null,
      defaultSubject: td.emailSubject,
      defaultBody: td.emailBody,
      vars: {
        number: job.estimate_number ?? '',
        link: url,
        client: cl ? `${cl.first_name} ${cl.last_name}`.trim() : '',
        firstName: cl?.first_name ?? '',
        lastName: cl?.last_name ?? '',
        company: cl?.company ?? '',
        business: business?.name ?? '',
        total: `$${formatNumberGrouped(job.total_amount)}`,
        dueDate: job.expiry_date ?? '',
      },
    });
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const canMail = await Linking.canOpenURL(mailto).catch(() => false);
    if (!canMail) { Alert.alert('', td.shareError); return; }
    openLink(mailto);
    if (job.status === 'proposal') void updateStatus('sent');
  };

  // Generate the estimate PDF on-device and hand it to the native share
  // sheet — same flow as the invoice detail's PDF button, no browser
  // round-trip. Layout mirrors the public /propuesta page.
  const downloadPdf = async () => {
    if (!job || !business) return;
    const tp = full.proposal;
    const itemSum = items.reduce((s, i) => s + i.total, 0);
    // Render the estimate through the invoice theme engine (same look as invoices).
    const biz = business as {
      name: string; logo_url?: string | null; city?: string | null; state?: string | null;
      address?: string | null; postal_code?: string | null; tax_id?: string | null;
      license_number?: string | null; email?: string | null; phone?: string | null; website?: string | null;
    };
    const branding: InvoiceBranding = {
      name: biz.name, logoUrl: biz.logo_url ?? null, city: biz.city ?? null, state: biz.state ?? null,
      address: biz.address ?? null, postalCode: biz.postal_code ?? null, taxId: biz.tax_id ?? null,
      licenseNumber: biz.license_number ?? null, email: biz.email ?? null, phone: biz.phone ?? null, website: biz.website ?? null,
    };
    const docData: InvoiceDocData = {
      invoiceNumber: job.estimate_number ?? '',
      status: 'draft',
      issueDate: job.issue_date ?? '',
      dueDate: job.expiry_date ?? null,
      lineItems: items.map(i => ({ description: i.description, qty: i.quantity, rate: i.unit_price })),
      subtotalAmount: job.subtotal_amount > 0 ? job.subtotal_amount : itemSum,
      taxRate: job.tax_rate ?? 0,
      taxAmount: job.tax_amount ?? 0,
      totalAmount: job.total_amount > 0 ? job.total_amount : itemSum,
      notes: null,
      language: invoiceDefaultLanguage(business.invoice_template, locale),
      clients: job.clients
        ? [{ firstName: job.clients.first_name, lastName: job.clients.last_name, email: null, phoneCell: null, company: job.clients.company ?? null }]
        : [],
      docType: 'estimate',
      estimateDescription: job.description,
      estimateTerms: job.notes,
      estimatePreparedBy: job.created_by ? nameById[job.created_by] ?? null : null,
      estimateSignature: job.client_signature
        ? {
            image: job.client_signature,
            line: tp.signedByLine
              .replace('{{name}}', job.client_signed_name ?? '')
              .replace('{{date}}', job.client_responded_at ? formatDateTimeLong(job.client_responded_at, dateLoc) : ''),
          }
        : null,
    };
    const html = buildInvoiceHtml(buildInvoiceViewModel(resolveConfig(null, business.invoice_template), docData, branding));
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      }
    } catch {
      Alert.alert('', td.shareError);
    }
  };

  // Opens the action sheet for "Enviar cotización" — email it (auto-marks
  // sent) or just mark as sent without sending anything. Link-sharing lives
  // on the header share icon, so it's not duplicated here.
  const sendProposalAction = () => {
    if (!job) return;
    Alert.alert(td.sendAction, td.sendActionMessage, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: td.markOnly,
        onPress: () => updateStatus('sent'),
      },
      {
        text: td.emailAction,
        onPress: () => void emailProposal(),
      },
    ]);
  };

  const updateStatus = async (newStatus: string, extra?: Record<string, string | null>) => {
    if (!job) return;
    const prevStatus = job.status;
    setUpdatingStatus(true);
    const now = new Date().toISOString();
    const update: Record<string, string | null> = { status: newStatus, ...(extra ?? {}) };
    if (newStatus === 'completed') update.completed_date = now.split('T')[0];
    if (newStatus === 'sent') update.sent_at = now;
    if (newStatus === 'accepted') update.accepted_at = now;
    if (newStatus === 'declined') update.declined_at = now;
    if (newStatus === 'cancelled') update.cancelled_at = now;
    // Work-phase step timestamps (migration 074) — drive the stepper times.
    if (newStatus === 'scheduled') update.scheduled_at = now;
    if (newStatus === 'in_progress') update.in_progress_at = now;
    if (newStatus === 'completed') update.completed_at = now;
    if (newStatus === 'invoiced') update.invoiced_at = now;
    // queuedUpdate writes through when online; offline it parks the change in
    // the outbox (drained on reconnect). A real DB rejection (e.g. un-run
    // migration) still throws so we surface it instead of silently reverting.
    const statusLabel = (t.statuses as Record<string, string>)[newStatus] ?? newStatus;
    try {
      await queuedUpdate({
        table: 'jobs',
        match: { id: job.id },
        payload: update,
        businessId: job.business_id,
        label: `${statusLabel}: ${job.title}`,
      });
    } catch {
      setUpdatingStatus(false);
      Alert.alert('', td.statusUpdateError);
      return;
    }
    setJob((prev) => (prev ? ({ ...prev, ...update } as Job) : prev));
    // Keep the cached copy consistent so reopening the job offline shows the
    // new status (not the stale cached one) before it syncs.
    void patchCached(`job_${job.id}`, update);
    void logAudit(supabase, job.business_id, 'job.status_changed', 'job', job.id, {
      from: prevStatus, to: newStatus, job_title: job.title,
    });
    setUpdatingStatus(false);
  };

  const reinstateJob = async () => {
    if (!job) return;
    setUpdatingStatus(true);
    const newStatus = job.estimate_number ? 'proposal' : 'scheduled';
    // Clears the whole client response — decline record AND signed approval —
    // so a reworked estimate can be re-sent and the client responds fresh.
    // An old signature must never stand as proof for edited line items; who
    // signed and when is preserved in the activity log below.
    const update = {
      status: newStatus, cancelled_at: null, declined_at: null,
      client_response: null, client_responded_at: null,
      client_signed_name: null, client_signature: null,
    };
    await supabase
      .from('jobs')
      .update(update)
      .eq('id', job.id);
    if (job.client_signature) {
      void logAudit(supabase, job.business_id, 'job.signature_cleared', 'job', job.id, {
        job_title: job.title, signed_name: job.client_signed_name, signed_at: job.client_responded_at,
      });
    }
    setJob((prev) => (prev ? { ...prev, ...update } : prev));
    setUpdatingStatus(false);
  };

  const generateInvoice = async () => {
    if (!job || !business) return;
    setUpdatingStatus(true);
    const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
    const useStored = job.estimate_number && job.subtotal_amount > 0;
    const subtotal = useStored ? job.subtotal_amount : itemSubtotal;
    // Business default tax (Ajustes → Facturas) when the job carries none.
    const taxRate = useStored ? job.tax_rate : (business?.invoice_tax_rate ?? 0);
    const taxAmount = useStored ? job.tax_amount : subtotal * (taxRate / 100);
    const discount = useStored ? job.discount : 0;
    const total = subtotal + taxAmount - discount;

    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.id);
    const invoiceLang = invoiceDefaultLanguage(business.invoice_template, locale);
    const invNum = nextInvoiceNumber(invoiceLang, business.invoice_start_number, count ?? 0);

    const lineItems = items.map((i) => ({
      description: showItemTypes ? `${ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}: ${i.description}` : i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    }));
    // No items — or (M&L off) only bare $0 items — bill as ONE placeholder line;
    // qty from the mapped custom field (invoice_qty_field).
    const allBare = items.length > 0 && items.every(i => !i.description.trim() && !(i.unit_price > 0));
    if (lineItems.length === 0 || allBare) {
      lineItems.length = 0;
      lineItems.push({
        description: job.title,
        quantity: placeholderQtyFor({ custom_fields: job.custom_fields }, business.invoice_qty_field) ?? 1,
        unit_price: 0,
        total: 0,
      });
    }

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
        // Leave notes empty — the invoice already links to its job; auto-filling
        // "Jobs: <title>" here just printed clutter the user didn't ask for.
        notes: null,
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
    const msg = job?.invoice_id
      ? `${td.deleteJobConfirm}\n\n${td.deleteInvoiceWarning}`
      : td.deleteJobConfirm;
    Alert.alert(td.deleteJobTitle, msg, [
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

  // Autoprice data — MUST run before the early returns below, otherwise the
  // hook count changes once the job loads (Rules of Hooks / render crash).
  useEffect(() => {
    if (!business) return;
    void supabase.from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, tier_rates, match_terms, is_addon, sort_order, active')
      .eq('business_id', business.id).eq('active', true)
      .then(({ data }: { data: PriceSheetRow[] | null }) => setPriceItems((data ?? []).map(rowToPriceSheetItem)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);
  useEffect(() => {
    if (!job?.client_id) { setClientTierId(null); return; }
    void supabase.from('clients').select('price_tier_id').eq('id', job.client_id).single()
      .then(({ data }: { data: { price_tier_id: string | null } | null }) => setClientTierId(data?.price_tier_id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.client_id]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color={c.primary} />
      </SafeAreaView>
    );
  }

  if (!job) {
    // Deleted/missing job — don't show the empty detail layout. Pop a one-hand
    // bottom alert; OK returns the user to where they came from.
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <RNModal visible transparent animationType="fade" onRequestClose={goBack}>
          <Pressable onPress={goBack} className="flex-1 bg-black/40 justify-end">
            <Pressable onPress={() => {}} className="bg-card rounded-t-3xl px-5 pt-6 pb-10">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-ink">{t.notFound}</Text>
                <Pressable onPress={goBack} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                  <X size={22} color={c.faint} />
                </Pressable>
              </View>
              <Pressable
                onPress={goBack}
                className="mt-5 py-3.5 rounded-2xl items-center bg-primary active:opacity-80"
              >
                <Text className="text-base font-semibold text-white">OK</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </RNModal>
      </SafeAreaView>
    );
  }

  const isProposal = !!job.estimate_number;
  // Hide the whole Materials & Labor card for plain jobs when the toggle is
  // off. Proposals always keep it (an estimate is its line items + total).
  const showMaterials = isProposal || showItemTypes;
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
  // before the work-phase timestamp columns existed (migration 074).
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
  const canInvoice = (job.status === 'completed' || job.status === 'accepted') && !job.invoice_id && can.createInvoice(currentRole);
  // Status-pipeline write gate. Managers/owners with jobs.edit can always drive
  // the pipeline; a field worker assigned to THIS job may also advance it
  // (matches the field-home surface). Read-only viewers see the pipeline but
  // none of the action buttons. RLS enforces the same rule server-side.
  const isAssignedToMe = !!authUser && assignments.some(a => a.employees?.user_id === authUser.id);
  const canChangeStatus = can.changeJobStatus(currentRole) || (can.changeJobStatusIfAssigned(currentRole) && isAssignedToMe);
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
    if (job.status === 'posible') return { label: t.statuses.scheduled, onPress: promptSchedule };
    if (job.status === 'proposal') {
      return { label: td.sendAction, onPress: sendProposalAction };
    }
    if (job.status === 'sent') return { label: t.statuses.accepted, onPress: () => updateStatus('accepted') };
    if (job.status === 'accepted') return { label: t.statuses.scheduled, onPress: promptSchedule };
    if (job.status === 'scheduled') return { label: t.statuses.in_progress, onPress: () => updateStatus('in_progress') };
    if (job.status === 'in_progress') return { label: t.statuses.completed, onPress: () => updateStatus('completed') };
    return null;
  })();

  // Cancel — moved off the jobs list (accidental taps) to here, behind a
  // confirm. Only for active, pre-completion statuses.
  const canCancel = canChangeStatus && !isCancelled && ['posible', 'proposal', 'sent', 'accepted', 'scheduled', 'in_progress'].includes(job.status);
  const confirmCancelJob = () => {
    confirmAction({
      // A signed estimate gets the stronger warning: cancelling + reinstating
      // wipes the client's signed approval and restarts the approval flow.
      title: job?.client_signature ? td.cancelSignedConfirm : td.cancelJobConfirm,
      confirmText: td.cancelJobBtn,
      destructive: true,
      onConfirm: () => void updateStatus('cancelled'),
    });
  };

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

  // Undo an accidental "facturado": detach from the invoice, revert to
  // completed, strip its line items, offer to delete a now-empty invoice.
  const unInvoice = () => {
    if (!job?.invoice_id || !business) return;
    const invoiceId = job.invoice_id;
    void (async () => {
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, status, line_items, tax_rate, discount, invoice_number')
        .eq('id', invoiceId)
        .single();
      if (!inv) return;
      const sentOrPaid = ['sent', 'paid', 'overdue'].includes(inv.status);
      Alert.alert('', sentOrPaid ? td.unInvoiceSentWarning : td.unInvoiceConfirm, [
        { text: full.common.buttons.cancel, style: 'cancel' },
        {
          text: td.unInvoiceBtn,
          style: 'destructive',
          onPress: async () => {
            setUnInvoicing(true);
            const { remaining } = await removeJobFromInvoice(supabase, {
              jobId: job.id,
              invoice: { id: inv.id, line_items: inv.line_items, tax_rate: inv.tax_rate, discount: inv.discount },
            });
            void logAudit(supabase, job.business_id, 'job.status_changed', 'job', job.id, {
              from: 'invoiced', to: 'completed', job_title: job.title,
            });
            setJob((prev) => (prev ? { ...prev, status: 'completed', invoice_id: null } : prev));
            setUnInvoicing(false);
            if (remaining === 0) {
              Alert.alert('', td.unInvoiceDeleteEmpty.replace('{{number}}', inv.invoice_number), [
                { text: full.common.buttons.cancel, style: 'cancel' },
                {
                  text: full.common.buttons.delete,
                  style: 'destructive',
                  onPress: async () => { await supabase.from('invoices').delete().eq('id', inv.id); },
                },
              ]);
            }
          },
        },
      ]);
    })();
  };

  // ── Inline job-items editor ─────────────────────────────────────────
  type EditRow = { id: string; item_type: string; description: string; quantity: string; unit_price: string; price_item_id: string | null; original_quantity: number | null };
  const ITEM_TYPES = ['labor', 'material', 'equipment', 'other'];
  const newRow = (): EditRow => ({ id: `${Date.now()}-${Math.random()}`, item_type: 'labor', description: '', quantity: '1', unit_price: '0', price_item_id: null, original_quantity: null });
  const openItemsEdit = () => {
    setEditRows(items.length
      ? items.map(i => ({ id: i.id, item_type: i.item_type, description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), price_item_id: (i as { price_item_id?: string | null }).price_item_id ?? null, original_quantity: (i as { original_quantity?: number | null }).original_quantity ?? null }))
      : [newRow()]);
    setShowPriceVerify(false);
    setItemsEditOpen(true);
  };

  // Autoprice — best-effort text match → state/tier-aware rate (see web).
  const autopriceRows = () => {
    if (!priceItems.length || !job) return;
    const ctxText = `${job.title ?? ''} ${job.description ?? ''} ${job.worker_notes ?? ''} ${job.internal_notes ?? ''} ${Object.values((job.custom_fields ?? {}) as Record<string, unknown>).map(String).join(' ')}`;
    let matched = 0;
    setEditRows(prev => prev.map(r => {
      if (!r.description.trim()) return r;
      // Don't override a line that already has a price.
      if ((parseFloat(r.unit_price) || 0) > 0) return r;
      const matchText = `${r.description} ${ctxText}`;
      const hit = suggestPriceItem(matchText, priceItems);
      if (!hit) return r;
      const addons = matchingAddons(matchText, priceItems);
      const enteredQty = parseFloat(r.quantity);
      const measured = enteredQty > 1 ? enteredQty : (extractQuantity(r.description) ?? (enteredQty || 1));
      const priced = autopriceLine(hit.item, measured, { state: job.job_state, tierId: clientTierId }, addons);
      matched++;
      return { ...r, price_item_id: hit.item.id, quantity: String(priced.quantity), unit_price: String(priced.unitPrice), original_quantity: priced.originalQuantity };
    }));
    if (matched) setShowPriceVerify(true);
  };
  const updateRow = (rid: string, field: keyof EditRow, value: string) =>
    setEditRows(prev => prev.map(r => (r.id === rid ? { ...r, [field]: value } : r)));
  const saveItems = async () => {
    if (!job) return;
    setSavingItems(true);
    const valid = editRows
      .map(r => ({ item_type: r.item_type, description: r.description.trim(), quantity: parseFloat(r.quantity) || 0, unit_price: parseFloat(r.unit_price) || 0, price_item_id: r.price_item_id, original_quantity: r.original_quantity }))
      // Keep a row if it has a description OR a cost — a bare amount + cost
      // (no description) is valid; the invoice falls back to the job title.
      .filter(r => r.description !== '' || r.unit_price > 0);
    await supabase.from('job_items').delete().eq('job_id', job.id);
    if (valid.length) await supabase.from('job_items').insert(valid.map(v => ({ job_id: job.id, ...v })));
    const subtotal = valid.reduce((s, v) => s + v.quantity * v.unit_price, 0);
    const tax = subtotal * ((job.tax_rate ?? 0) / 100);
    const total = subtotal + tax - (job.discount ?? 0);
    await supabase.from('jobs').update({ subtotal_amount: subtotal, tax_amount: tax, total_amount: total }).eq('id', job.id);
    const { data: it } = await supabase.from('job_items').select('*').eq('job_id', job.id).order('created_at');
    setItems((it as JobItem[] | null) ?? []);
    setJob(prev => (prev ? { ...prev, subtotal_amount: subtotal, tax_amount: tax, total_amount: total } : prev));
    setSavingItems(false);
    setItemsEditOpen(false);
  };
  const canEditItems = can.editJobMetadata(currentRole) && !['invoiced', 'cancelled', 'declined'].includes(job?.status ?? '');

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-border-soft"
        >
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <View className="flex-row gap-1">
          {isProposal ? (
            <>
              <Pressable
                onPress={shareProposal}
                hitSlop={8}
                className="p-2 rounded-lg active:bg-primary/10"
              >
                <Send size={18} color={c.primary} />
              </Pressable>
              <Pressable
                onPress={() => void downloadPdf()}
                hitSlop={8}
                className="p-2 rounded-lg active:bg-primary/10"
              >
                <Download size={18} color={c.muted} />
              </Pressable>
            </>
          ) : null}
          {businesses.length > 1 && !job.delegated_to_business_id && can.delegateJob(currentRole) ? (
            <Pressable
              onPress={() => setDelegateOpen(true)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-primary/10"
            >
              <Building2 size={18} color={c.primary} />
            </Pressable>
          ) : null}
          {can.createJob(currentRole) ? (
            <Pressable
              onPress={() =>
                Alert.alert(td.duplicateTooltip, td.duplicateAskTitle, [
                  { text: tc.buttons.cancel, style: 'cancel' },
                  {
                    text: td.duplicateTeamOption,
                    onPress: () => router.push(`/dashboard/trabajos/nuevo?duplicate=${job.id}&copy=team` as never),
                  },
                  {
                    text: td.duplicateFullOption,
                    onPress: () => router.push(`/dashboard/trabajos/nuevo?duplicate=${job.id}` as never),
                  },
                ])
              }
              hitSlop={8}
              className="p-2 rounded-lg active:bg-border-soft"
            >
              <Copy size={18} color={c.muted} />
            </Pressable>
          ) : null}
          {can.editJobMetadata(currentRole) ? (
            <Pressable
              onPress={() => router.push(`/dashboard/trabajos/nuevo?edit=${job.id}` as never)}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-border-soft"
            >
              <Pencil size={18} color={c.muted} />
            </Pressable>
          ) : null}
          {can.deleteJob(currentRole) ? (
            <Pressable
              onPress={confirmDelete}
              hitSlop={8}
              className="p-2 rounded-lg active:bg-red-500/10"
            >
              <Trash2 size={18} color={c.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-6 pt-6 pb-36">
        {/* Title + client + created date */}
        <View className="mb-6">
          {isProposal ? (
            <Text className="text-xs font-mono text-faint mb-1">{job.estimate_number}</Text>
          ) : null}
          <Text className="text-2xl font-bold text-ink">{job.title}</Text>
          {/* Non-proposals show a reference so every job has an ID: imported
             project id, else a stable short code for old/manual jobs. */}
          {!isProposal ? (
            <Text className="text-xs font-mono text-faint mt-0.5">{job.external_ref?.trim() || jobShortCode(job.id)}</Text>
          ) : null}
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
          <Text className="text-[11px] text-faint mt-1.5">
            {td.createdOn.replace('{{date}}', fmtDateTime(job.created_at))}{byUser(job.created_by)}
          </Text>
        </View>

        {/* Cancelled / declined banner */}
        {isCancelled ? (
          <View className="bg-red-500/10 border border-red-100 rounded-2xl p-4 mb-5 flex-row items-start gap-3">
            <AlertTriangle size={18} color={c.danger} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-red-700">
                {job.status === 'cancelled'
                  ? td.cancelledBanner
                  : job.client_response === 'declined' ? td.declinedByClientBanner : td.declinedBanner}
              </Text>
              {job.status === 'cancelled' && job.cancelled_at ? (
                <Text className="text-xs text-red-600 mt-0.5">
                  {td.cancelledOn.replace('{{date}}', fmtDateTime(job.cancelled_at))}
                </Text>
              ) : null}
              {job.status === 'declined' && job.declined_at ? (
                <Text className="text-xs text-red-600 mt-0.5">
                  {td.declinedOn.replace('{{date}}', fmtDateTime(job.declined_at))}
                </Text>
              ) : null}
              {canChangeStatus ? (
                <Pressable
                  onPress={reinstateJob}
                  disabled={updatingStatus}
                  className="self-start mt-2 flex-row items-center gap-1.5 bg-card px-3 py-1.5 rounded-lg border border-red-200 active:bg-red-500/10"
                >
                  <RotateCcw size={12} color={c.danger} />
                  <Text className="text-xs font-semibold text-red-600">{td.reinstate}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Status pipeline */}
        {!isCancelled ? (
          <PipelineStrip pipeline={pipeline} currentIdx={pipelineIdx} />
        ) : null}

        {/* Client approval proof — the signature captured on the public
           accept-and-sign page, kept on the job as record. */}
        {isProposal && job.client_signature ? (
          <View className="bg-card rounded-2xl border border-border-soft p-4 mb-5">
            <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">{td.approvalTitle}</Text>
            <View className="bg-white rounded-xl border border-border-soft p-2 mb-2 self-start">
              <SignatureImage uri={job.client_signature} />
            </View>
            <Text className="text-xs text-muted">
              {td.signedByLine
                .replace('{{name}}', job.client_signed_name ?? '')
                .replace('{{date}}', job.client_responded_at ? fmtDateTime(job.client_responded_at) : '')}
            </Text>
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

          {job.invoice_id && can.seeInvoices(currentRole) ? (
            <Pressable
              onPress={() => router.push(`/dashboard/facturas/${job.invoice_id}?from=job&jobId=${job.id}` as never)}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border active:bg-surface"
            >
              <FileText size={16} color={c.muted} />
              <Text className="text-sm font-semibold text-ink">{td.viewInvoiceBtn}</Text>
            </Pressable>
          ) : null}

          {canChangeStatus && job.status === 'invoiced' && job.invoice_id ? (
            <Pressable
              onPress={unInvoice}
              disabled={unInvoicing}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border active:bg-surface"
            >
              <RotateCcw size={16} color={c.muted} />
              <Text className="text-sm font-semibold text-ink">{td.unInvoiceBtn}</Text>
            </Pressable>
          ) : null}

          {canChangeStatus && (nextStatusAction || prevStatusAction) ? (
            <View className="flex-row gap-2">
              {prevStatusAction ? (
                <Pressable
                  onPress={() => stepBack(prevStatusAction.next)}
                  disabled={updatingStatus}
                  className={`${nextStatusAction ? '' : 'flex-1 '}flex-row items-center justify-center gap-1.5 py-3.5 px-4 rounded-2xl bg-border-soft border border-border active:opacity-80`}
                >
                  <Text className="text-sm font-semibold text-muted">← {prevStatusAction.label}</Text>
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

          {/* Sign on site — hand the device to the client to accept + sign
             an estimate in person. */}
          {canChangeStatus && isProposal && ['proposal', 'sent'].includes(job.status) ? (
            <Pressable
              onPress={openSignSheet}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border active:bg-surface"
            >
              <PenLine size={16} color={c.muted} />
              <Text className="text-sm font-semibold text-ink">{td.signOnSite}</Text>
            </Pressable>
          ) : null}

          {/* Crew share only once the work is actually scheduled — before
             that there's no crew/date to send. */}
          {['scheduled', 'in_progress'].includes(job.status) && can.seeAllJobs(currentRole) ? (
            <Pressable
              onPress={shareJobToCrew}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border active:bg-surface"
            >
              <MessageSquare size={16} color={c.muted} />
              <Text className="text-sm font-semibold text-ink">{td.sendToCrew}</Text>
            </Pressable>
          ) : null}

          {/* Cancel + Archive share one row (side by side) to avoid stacked
             dead space. Both are confirmed / reversible. */}
          {canCancel || (job.status === 'completed' && can.seeAllJobs(currentRole)) ? (
            <View className="flex-row gap-2">
              {canCancel ? (
                <Pressable
                  onPress={confirmCancelJob}
                  disabled={updatingStatus}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border active:bg-red-500/10"
                >
                  <XCircle size={16} color={c.danger} />
                  <Text className="text-sm font-semibold text-red-500">{td.cancelJobBtn}</Text>
                </Pressable>
              ) : null}

              {/* Archive — the exit for completed work that will never be
                 invoiced (internal hours etc). Reversible. */}
              {job.status === 'completed' && can.seeAllJobs(currentRole) ? (
                <Pressable
                  onPress={() => {
                    const archive = !job.archived_at;
                    const doIt = async () => {
                      const archived_at = archive ? new Date().toISOString() : null;
                      await supabase.from('jobs').update({ archived_at }).eq('id', job.id);
                      if (business) void logAudit(supabase, business.id, archive ? 'job.archived' : 'job.unarchived', 'job', job.id, { title: job.title });
                      setJob(prev => (prev ? { ...prev, archived_at } : prev));
                    };
                    if (!archive) { void doIt(); return; }
                    Alert.alert('', full.dashboard.jobs.confirmArchiveBulk.replace('{{count}}', '1'), [
                      { text: tc.buttons.cancel, style: 'cancel' },
                      { text: full.dashboard.jobs.bulkArchive, onPress: () => void doIt() },
                    ]);
                  }}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-border-soft active:bg-border"
                >
                  <Archive size={16} color={c.muted} />
                  <Text className="text-sm font-semibold text-muted">{job.archived_at ? td.unarchiveBtn : td.archiveBtn}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Details card */}
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-5 gap-3">
          <Text className="text-xs font-semibold text-faint uppercase">
            {td.detailsHeading}
          </Text>

          {job.scheduled_date ? (
            <View className="flex-row items-center gap-3">
              <CalendarIcon size={16} color={c.muted} />
              <View className="flex-1">
                <Text className="text-xs text-muted">{td.scheduledDate}</Text>
                <Text className="text-sm text-ink">
                  {fmtDate(job.scheduled_date)}
                  {job.end_date ? ` — ${fmtDate(job.end_date)}` : ''}
                </Text>
                {(job.time_start || job.time_end) ? (
                  <Text className="text-xs text-faint mt-0.5">
                    {formatTime12h(job.time_start)}{job.time_end ? ` — ${formatTime12h(job.time_end)}` : ''}
                  </Text>
                ) : null}
                {(() => {
                  const totalTimeText = formatProjectDuration(
                    { startDate: job.scheduled_date, endDate: job.end_date, estimatedHours: job.estimated_hours },
                    tc.duration,
                  );
                  return totalTimeText ? (
                    <Text className="text-xs text-faint mt-0.5">{t.new.totalTimeLabel}: {totalTimeText}</Text>
                  ) : null;
                })()}
              </View>
            </View>
          ) : null}

          {((job.total_hours ?? 0) > 0 || (job.driver_hours ?? 0) > 0 || (job.driver_names?.length ?? 0) > 0) ? (
            <View className="flex-row items-start gap-3">
              <Clock size={16} color={c.muted} />
              <View className="flex-1">
                {(job.total_hours ?? 0) > 0 ? (
                  <>
                    <Text className="text-xs text-muted">{t.new.totalHoursLabel}</Text>
                    <Text className="text-sm text-ink">{job.total_hours} h</Text>
                  </>
                ) : null}
                {((job.driver_names?.length ?? 0) > 0 || (job.driver_hours ?? 0) > 0) ? (
                  <Text className="text-xs text-faint mt-0.5">
                    {t.new.driverLabel}: {job.driver_names?.length ? job.driver_names.join(', ') : '—'}
                    {(job.driver_hours ?? 0) > 0 ? ` · ${job.driver_hours} h` : ''}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {(job.job_address || job.job_lat != null || job.job_map_link) ? (
            <Pressable
              onPress={() => setLocationModalOpen(true)}
              className="flex-row items-start gap-3 -mx-2 px-2 py-1 rounded-lg active:bg-surface"
            >
              <MapPin size={16} color={c.muted} />
              <View className="flex-1">
                <Text className="text-xs text-muted">{td.location}</Text>
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
              <Text className="text-xs text-muted mb-1">{td.description}</Text>
              <Text className="text-sm text-ink">{job.description}</Text>
            </View>
          ) : null}

          {job.internal_notes ? (
            <View>
              <Text className="text-xs text-muted mb-1">{td.internalNote}</Text>
              <Text className="text-sm text-ink">{job.internal_notes}</Text>
            </View>
          ) : null}

          {job.worker_notes ? (
            <View>
              <Text className="text-xs text-muted mb-1">
                {full.dashboard.jobs.new.workerNoteLabel}
              </Text>
              <Text className="text-sm text-ink">{job.worker_notes}</Text>
            </View>
          ) : null}

          {/* Custom fields assigned to real sections — no "Custom fields"
             heading; they read like regular detail rows, in the saved layout
             order (Ajustes → Trabajos), like the form. */}
          {detailCustoms.some(tpl => customValue(tpl) !== null) ? (
            <View className="gap-3">
              {detailCustoms.map(renderCustomRow)}
            </View>
          ) : null}
        </View>

        {/* Additional details — ONLY custom fields assigned to the
           'additional' section get their own card (form parity). */}
        {additionalCustoms.some(tpl => customValue(tpl) !== null) ? (
          <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-5">
            <Text className="text-xs font-semibold text-faint uppercase mb-2">
              {locale === 'es' ? 'Detalles adicionales' : 'Additional details'}
            </Text>
            <View className="gap-3">
              {additionalCustoms.map(renderCustomRow)}
            </View>
          </View>
        ) : null}

        {/* Workers card — assigned crew with the lead badged (web parity). */}
        {assignments.length > 0 ? (
          <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-5">
            <Text className="text-xs font-semibold text-faint uppercase mb-3">{td.workersHeading}</Text>
            <View className="gap-2.5">
              {assignments.map(a => {
                const name = a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name ?? '—';
                return (
                  <View key={a.id} className="flex-row items-center gap-2">
                    <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center">
                      <Text className="text-primary text-xs font-bold">{name.charAt(0)}</Text>
                    </View>
                    <Text className="text-sm text-ink font-medium">{name}</Text>
                    {a.is_lead ? (
                      <View className="px-2 py-0.5 rounded-full bg-amber-100">
                        <Text className="text-[10px] font-semibold text-amber-700">{t.new.leadBadge}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Items list */}
        {showMaterials ? (
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-faint uppercase">
              {isProposal ? td.itemsHeadingProposal : td.itemsHeadingJob}
            </Text>
            {canEditItems && items.length > 0 ? (
              <Pressable onPress={openItemsEdit} hitSlop={8}>
                <Text className="text-xs font-semibold text-primary">{td.editItemsBtn}</Text>
              </Pressable>
            ) : null}
          </View>

          {items.length === 0 ? (
            <View className="py-2 items-start gap-2">
              <Text className="text-sm text-faint">{td.noItems}</Text>
              {canEditItems ? (
                <Pressable onPress={openItemsEdit} hitSlop={8}>
                  <Text className="text-sm font-semibold text-primary">{td.addItemsBtn}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View>
              {items.map((it, i) => (
                <View
                  key={it.id}
                  className={`flex-row items-start gap-3 py-3 ${
                    i < items.length - 1 ? 'border-b border-border-soft' : ''
                  }`}
                >
                  <View className="flex-1">
                    {showItemTypes ? (
                      <Text className="text-xs text-faint mb-0.5">
                        {ITEM_TYPE_LABELS[it.item_type] ?? it.item_type}
                      </Text>
                    ) : null}
                    <Text className="text-sm text-ink">{it.description}</Text>
                    <Text className="text-xs text-muted mt-0.5">
                      {it.quantity} × {fmt(it.unit_price)}{(it as { original_quantity?: number | null }).original_quantity ? `  ·  ${td.measuredNote.replace('{{qty}}', String((it as { original_quantity?: number | null }).original_quantity))}` : ''}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-ink">{fmt(it.total)}</Text>
                </View>
              ))}

              {isProposal && (job.tax_rate > 0 || job.discount > 0) ? (
                <View className="border-t border-border-soft mt-2 pt-2 gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-muted">{td.tax}</Text>
                    <Text className="text-xs text-ink">{fmt(job.tax_amount)}</Text>
                  </View>
                  {job.discount > 0 ? (
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">{td.discount}</Text>
                      <Text className="text-xs text-ink">−{fmt(job.discount)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View className="border-t border-border-soft mt-3 pt-3 flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-ink">
                  {isProposal ? td.totalEstimated : td.totalEstimated}
                </Text>
                <Text className="text-lg font-bold text-ink">{fmt(total)}</Text>
              </View>
            </View>
          )}
        </View>
        ) : null}

        {/* Photos */}
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <JobPhotosSection
            jobId={job.id}
            businessId={job.business_id}
            canWrite={can.editJobMetadata(currentRole)}
          />
        </View>

        {/* Documents (contracts, permits, signed paperwork) */}
        <View className="mt-5">
          <JobDocumentsSection
            jobId={job.id}
            businessId={job.business_id}
            canWrite={can.editJobMetadata(currentRole)}
          />
        </View>

        {/* Metadata — last edited (created moved to top) */}
        <View className="gap-1 px-1 mt-4">
          <Text className="text-[10px] text-faint">
            {td.lastEditedOn.replace('{{date}}', fmtDateTime(job.updated_at))}{byUser(job.updated_by)}
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

      {/* Job-items editor */}
      <RNModal visible={itemsEditOpen} transparent animationType="slide" onRequestClose={() => setItemsEditOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-card rounded-t-3xl pt-3" style={{ maxHeight: '88%' }}>
            <View className="items-center mb-2"><View className="w-10 h-1 bg-border rounded-full" /></View>
            <View className="flex-row items-center justify-between px-5 pb-3 border-b border-border-soft">
              <Text className="text-lg font-bold text-ink">{isProposal ? td.itemsHeadingProposal : td.itemsHeadingJob}</Text>
              <Pressable onPress={() => setItemsEditOpen(false)} hitSlop={8}><X size={20} color={c.faint} /></Pressable>
            </View>
            <ScrollView contentContainerClassName="px-5 py-4 gap-3" keyboardShouldPersistTaps="handled">
              {editRows.map(r => (
                <View key={r.id} className="bg-surface rounded-2xl p-3 gap-2">
                  <View className="flex-row items-start justify-between gap-2">
                    {showItemTypes ? (
                      <View className="flex-1 flex-row flex-wrap gap-1.5">
                        {ITEM_TYPES.map(tk => {
                          const on = r.item_type === tk;
                          return (
                            <Pressable
                              key={tk}
                              onPress={() => updateRow(r.id, 'item_type', tk)}
                              className={`px-3 py-1.5 rounded-full border ${on ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                            >
                              <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-muted'}`}>
                                {ITEM_TYPE_LABELS[tk] ?? tk}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : <View className="flex-1" />}
                    <Pressable onPress={() => setEditRows(prev => prev.filter(x => x.id !== r.id))} hitSlop={8} className="pt-1">
                      <Trash2 size={16} color={c.danger} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={r.description}
                    onChangeText={v => updateRow(r.id, 'description', v)}
                    placeholder={t.new.colDescription}
                    placeholderTextColor={c.faint}
                    className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink"
                  />
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-[11px] text-faint mb-1">{t.new.colQty}</Text>
                      <TextInput value={r.quantity} onChangeText={v => updateRow(r.id, 'quantity', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[11px] text-faint mb-1">{td.colUnitPriceShort}</Text>
                      <TextInput value={r.unit_price} onChangeText={v => updateRow(r.id, 'unit_price', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink" />
                    </View>
                  </View>
                </View>
              ))}
              <View className="flex-row items-center justify-between">
                <Pressable onPress={() => setEditRows(prev => [...prev, newRow()])} className="py-1">
                  <Text className="text-sm font-semibold text-primary">+ {td.addItemsBtn}</Text>
                </Pressable>
                {priceItems.length > 0 ? (
                  <Pressable onPress={autopriceRows} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg active:bg-primary/5">
                    <DollarSign size={14} color={c.primary} />
                    <Text className="text-sm font-semibold text-primary">{td.autopriceBtn}</Text>
                  </Pressable>
                ) : null}
              </View>
              {showPriceVerify ? (
                <View className="rounded-xl bg-amber-500/10 border border-amber-100 px-3 py-2">
                  <Text className="text-xs text-amber-700">{td.autopriceVerify}</Text>
                </View>
              ) : null}
            </ScrollView>
            <View className="flex-row gap-3 px-5 pt-3 pb-8 border-t border-border-soft">
              <Button variant="secondary" onPress={() => setItemsEditOpen(false)} className="flex-1">{full.common.buttons.cancel}</Button>
              <Button onPress={saveItems} loading={savingItems} className="flex-1">{full.common.buttons.save}</Button>
            </View>
          </View>
        </View>
      </RNModal>

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
          <Pressable onPress={() => {}} className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="flex-row items-center justify-between px-3">
              <Text className="text-base font-semibold text-ink">
                {tw.delegateModalTitle}
              </Text>
              <Pressable onPress={() => setDelegateOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <Text className="text-xs text-muted px-3 mt-1 mb-4">
              {tw.delegateChooseTarget}
            </Text>
            <View className="bg-surface rounded-2xl overflow-hidden">
              {businesses
                .filter((b) => b.id !== job.business_id)
                .map((b, i, arr) => (
                  <Pressable
                    key={b.id}
                    onPress={() => runDelegate(b.id)}
                    disabled={delegating}
                    className={`flex-row items-center gap-3 px-4 py-3.5 ${
                      i < arr.length - 1 ? 'border-b border-border-soft' : ''
                    } active:bg-border-soft`}
                  >
                    <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                      {delegating ? (
                        <ActivityIndicator size="small" color={c.primary} />
                      ) : (
                        <Building2 size={16} color={c.primary} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                        {b.name}
                      </Text>
                      {b.city ? (
                        <Text className="text-xs text-muted">
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
              className="mt-3 items-center py-3.5 rounded-2xl bg-border-soft active:bg-border"
            >
              <Text className="text-sm font-semibold text-ink">
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
            className="bg-card rounded-t-3xl pt-3"
            style={{ maxHeight: '85%' }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border-soft">
              <Text className="text-lg font-bold text-ink">{td.locationModalTitle}</Text>
              <Pressable onPress={() => setLocationModalOpen(false)} hitSlop={8}>
                <X size={20} color={c.faint} />
              </Pressable>
            </View>
            <View className="px-5 py-5 pb-8 gap-4">
              {job.job_address ? (
                <View>
                  <Text className="text-xs text-muted">{td.location}</Text>
                  <Text className="text-base text-ink mt-1">
                    {job.job_address}
                    {job.job_city ? `\n${job.job_city}` : ''}
                    {job.job_state ? `, ${job.job_state}` : ''}
                  </Text>
                </View>
              ) : null}

              {job.job_lat != null && job.job_lng != null ? (
                <View>
                  <Text className="text-xs text-muted">{td.coordinates}</Text>
                  <Text className="text-base text-ink mt-1 font-mono">
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
                className="flex-row items-center justify-center gap-2 border border-border py-3.5 rounded-2xl active:bg-surface"
              >
                <Share2 size={16} color={c.muted} />
                <Text className="text-ink font-semibold text-sm">{td.shareLocation}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Sign on site — hand the device to the client; same proof record as
         the public accept-and-sign link. Backdrop is an absolute Pressable
         FIRST child; the card is a plain sibling on top (see CLAUDE.md —
         wrapping the card inside the backdrop breaks its touch handling). */}
      <RNModal visible={signSheetOpen} transparent animationType="slide" onRequestClose={() => setSignSheetOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable onPress={() => setSignSheetOpen(false)} className="absolute inset-0 bg-black/40" />
          <View className="bg-card rounded-t-3xl pt-3 pb-8">
            <View className="items-center mb-2"><View className="w-10 h-1 bg-border rounded-full" /></View>
            <View className="flex-row items-center justify-between px-5 pb-3 border-b border-border-soft">
              <Text className="text-lg font-bold text-ink">{td.signOnSite}</Text>
              <Pressable onPress={() => setSignSheetOpen(false)} hitSlop={8}><X size={20} color={c.faint} /></Pressable>
            </View>
            <View className="px-5 pt-4 gap-4">
              <Text className="text-sm text-muted">{td.signOnSiteHint}</Text>
              <View>
                <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-1.5">{full.proposal.nameLabel}</Text>
                <TextInput
                  value={onsiteName}
                  onChangeText={setOnsiteName}
                  placeholder={full.proposal.namePlaceholder}
                  placeholderTextColor={c.faint}
                  className="bg-surface border border-border rounded-xl px-3.5 py-3 text-sm text-ink"
                />
              </View>
              <View>
                <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-1.5">{full.proposal.signLabel}</Text>
                <SignaturePad hint={full.proposal.signHint} clearLabel={full.proposal.clearSignature} onChange={setOnsiteSig} />
                <Text className="text-[11px] text-faint mt-2 leading-4">{full.proposal.signDisclaimer}</Text>
              </View>
              {onsiteError ? <Text className="text-sm text-red-600">{onsiteError}</Text> : null}
              <Button onPress={saveOnsiteSignature} loading={onsiteSaving} fullWidth>
                <CheckCircle2 size={16} color="#FFFFFF" />
                <Text className="text-white font-semibold ml-2">{full.proposal.acceptButton}</Text>
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Schedule — asks for the work date so a "scheduled" job never
         silently lacks one. */}
      <RNModal visible={schedSheetOpen} transparent animationType="slide" onRequestClose={() => setSchedSheetOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable onPress={() => setSchedSheetOpen(false)} className="absolute inset-0 bg-black/40" />
          <View className="bg-card rounded-t-3xl pt-3 pb-8">
            <View className="items-center mb-2"><View className="w-10 h-1 bg-border rounded-full" /></View>
            <View className="flex-row items-center justify-between px-5 pb-3 border-b border-border-soft">
              <Text className="text-lg font-bold text-ink">{td.scheduleWork}</Text>
              <Pressable onPress={() => setSchedSheetOpen(false)} hitSlop={8}><X size={20} color={c.faint} /></Pressable>
            </View>
            <View className="px-5 pt-4 gap-4">
              <Text className="text-sm text-muted">{td.schedulePromptHint}</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={parseISODate(schedDate || todayLocalISO())}
                  mode="date"
                  display="spinner"
                  onChange={(_e, d) => { if (d) setSchedDate(toISODate(d)); }}
                  style={{ height: 200, alignSelf: 'stretch' }}
                />
              ) : (
                <Pressable
                  onPress={openAndroidDatePicker}
                  className="flex-row items-center gap-2 border border-border bg-surface rounded-xl px-4 py-3"
                >
                  <CalendarIcon size={16} color={c.muted} />
                  <Text className="text-sm text-ink font-medium">
                    {schedDate ? formatDateLong(schedDate, dateLoc) : ''}
                  </Text>
                </Pressable>
              )}
              <Button onPress={saveSchedule} loading={updatingStatus} fullWidth>
                <Text className="text-white font-semibold">{td.scheduleWork}</Text>
              </Button>
            </View>
          </View>
        </View>
      </RNModal>

      {confirmSheet}
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
  const c = useThemeColors();
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
    <View className="bg-card rounded-2xl border border-border-soft shadow-sm mb-5">
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
                    backgroundColor: isCurrent ? `${s.color}1A` : isPast ? c.borderSoft : c.surface,
                    borderWidth: isCurrent ? 2 : 0,
                    borderColor: isCurrent ? s.color : 'transparent',
                  }}
                >
                  <Icon
                    size={18}
                    color={isCurrent ? s.color : isPast ? c.faint : c.faint}
                  />
                </View>
                <Text
                  className="text-[11px] font-semibold mt-1.5 text-center"
                  style={{ color: isCurrent ? s.color : isPast ? c.muted : c.faint }}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
                {(isPast || isCurrent) && s.stamp?.date ? (
                  <View className="items-center mt-0.5">
                    <Text className="text-[9px] text-faint text-center" numberOfLines={1}>{s.stamp.date}</Text>
                    {s.stamp.time ? (
                      <Text className="text-[9px] text-faint text-center" numberOfLines={1}>{s.stamp.time}</Text>
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
                    backgroundColor: isPast ? c.border : c.borderSoft,
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
