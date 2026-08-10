import { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, Share, View, Text, Pressable, ScrollView, Modal as RNModal, Linking, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { X, Camera } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { signedUrl } from '@amixos/shared/lib/storageUrls';
import { INVOICE_PAYMENT_BUCKET, paymentPhotoPath } from '@amixos/shared/lib/invoicePayments';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { WEB_APP_URL } from '@/lib/webUrl';
import { useApp } from '@/lib/AppContext';
import { swrRead, swrWrite } from '@amixos/shared/lib/swrCache';
import { useLang } from '@/lib/i18n/LangProvider';
import { memberNameMap } from '@amixos/shared/lib/memberNames';
import { useThemeColors } from '@/lib/ThemeProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { secureShareToken } from '@amixos/shared/lib/shareToken';
import { useConfirmSheet } from '@/lib/useConfirmSheet';
import {
  InvoiceDetailScreen,
  type InvoiceDetail,
  type InvoicePaymentRow,
} from '@amixos/shared/screens/dashboard/InvoiceDetailScreen';
import { DatePicker, Select } from '@amixos/shared/ui';
import type { InvoiceLang } from '@amixos/shared';
import { logAudit } from '@amixos/shared/lib/audit';
import { renderInvoiceEmail } from '@amixos/shared/lib/invoiceEmail';
import { removeJobFromInvoice, moveJobToInvoice, addJobsToInvoice, rebuildInvoiceLineItems, addManualLineItem, removeLineItemAt, updateLineItemAt, linkLineToJob, autopriceInvoice, type AutopriceAmbiguous } from '@amixos/shared/lib/invoicing';
import { rowToPriceSheetItem, type PriceSheetItem, type PriceSheetRow } from '@amixos/shared/lib/priceSheet';
import { JobPreviewSheet } from '@amixos/shared/screens/dashboard/JobPreviewSheet';
import { formatDateLong, formatNumberGrouped } from '@amixos/shared/lib/format';
import { can } from '@amixos/shared/lib/permissions';
import {
  resolveConfig,
  buildInvoiceViewModel,
  buildInvoiceHtml,
  type InvoiceBranding,
} from '@amixos/shared/lib/invoiceTemplate';

const PAY_METHODS = ['cash', 'check', 'card', 'transfer', 'zelle', 'cashapp', 'venmo', 'paypal', 'moneyOrder', 'other'] as const;
type PayMethodKey = (typeof PAY_METHODS)[number];

const genToken = () => secureShareToken();

// Render the invoice HTML to a PDF whose file name is the invoice number
// (e.g. INV-258643.pdf), so the shared / emailed attachment isn't the random
// temp name expo-print assigns. Falls back to the temp uri if the copy fails.
async function renderInvoicePdf(html: string, invoiceNumber: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  const safe = (invoiceNumber || 'invoice').replace(/[^\w.-]+/g, '_');
  const dest = `${FileSystem.cacheDirectory}${safe}.pdf`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

interface RawClient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_office: string | null;
  email_home: string | null;
  phone_cell: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}
interface RawInvoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  line_items: { description: string; qty: number; rate: number }[];
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  language: InvoiceLang;
  created_at: string;
  updated_at: string | null;
  custom_fields: Record<string, string> | null;
  clients: RawClient | null;
  invoice_clients: { clients: RawClient }[];
}

interface InvoiceFieldTemplate {
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

export default function FacturaDetailRoute() {
  const params = useLocalSearchParams<{ id: string; from?: string; jobId?: string; clientId?: string }>();
  const id = String(params.id);
  const router = useRouter();
  // ?from=job&jobId=… or ?from=client&clientId=… → back returns to that
  // job/client (not the invoice list). We navigate explicitly because
  // facturas/[id] and trabajos/[id] share the same Tabs navigator, where
  // back() can land on the wrong tab.
  const goBack = () => {
    if (params.from === 'job' && params.jobId) {
      router.replace(`/dashboard/trabajos/${params.jobId}` as never);
    } else if (params.from === 'client' && params.clientId) {
      router.replace(`/dashboard/clientes/${params.clientId}` as never);
    } else if (router.canGoBack()) {
      // Pop back to the existing list screen (each section is its own Stack)
      // so the list keeps its scroll position and loaded data — replace()
      // would build a fresh list from scratch, resetting both.
      router.back();
    } else {
      router.replace('/dashboard/facturas' as never);
    }
  };
  const supabase = createSupabaseClient();
  const { business, currentRole } = useApp();
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const tInv = full.dashboard.invoices;
  const tc = full.common;
  const { confirm, confirmSheet } = useConfirmSheet();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  // user_id → display name, for the "created by / edited by" lines
  // (migration 150 stamps created_by/updated_by at the DB level).
  const [nameById, setNameById] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!business) return;
    void memberNameMap(supabase, business.id).then(setNameById);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [invoiceConfigRaw, setInvoiceConfigRaw] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Jobs attached to this invoice (Phase 2 management) ──────────────
  const tj = full.dashboard.jobs;
  const jobsT = tInv.jobsSection;
  const itemTypeLabels = {
    labor: tj.new.itemTypeLabor,
    material: tj.new.itemTypeMaterial,
    equipment: tj.new.itemTypeEquipment,
    other: tj.new.itemTypeOther,
  };
  const [attachedJobs, setAttachedJobs] = useState<{ id: string; title: string }[]>([]);
  const [invClientId, setInvClientId] = useState<string | null>(null);
  const [priceItems, setPriceItems] = useState<PriceSheetItem[]>([]);
  const [clientTierId, setClientTierId] = useState<string | null>(null);
  const [showInvVerify, setShowInvVerify] = useState(false);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [moveJobId, setMoveJobId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<{ id: string; invoice_number: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addCandidates, setAddCandidates] = useState<{ id: string; title: string; externalRef: string | null; scheduled_date: string | null; client_id: string | null; clientName: string }[]>([]);
  const [addSearch, setAddSearch] = useState('');
  // When set, the job picker links this line index to a job (vs adding lines).
  const [linkIndex, setLinkIndex] = useState<number | null>(null);
  const [addPicked, setAddPicked] = useState<Set<string>>(new Set());
  const [manualDesc, setManualDesc] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualRate, setManualRate] = useState('');

  // Amount input filter: digits + decimals + one optional leading minus, so a
  // manual line can be a deduction (e.g. "-500" to reduce the total).
  const cleanAmount = (v: string) => v.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '');
  // The numeric keyboard has no minus key, so a ± button flips the sign.
  const toggleSign = (v: string) => (v.startsWith('-') ? v.slice(1) : v ? `-${v}` : '-');

  // Edit-a-manual-line state.
  const [editOpen, setEditOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editRate, setEditRate] = useState('');

  const editManual = (index: number) => {
    const li = invoice?.lineItems[index];
    if (!li) return;
    setEditIndex(index);
    setEditDesc(li.description ?? '');
    setEditQty(String(li.qty ?? 1));
    setEditRate(li.rate != null ? String(li.rate) : '');
    setEditOpen(true);
  };

  const doEditSave = async () => {
    if (editIndex === null) return;
    const desc = editDesc.trim();
    if (!desc) return;
    setJobBusy(true);
    await updateLineItemAt(supabase, {
      invoiceId: id,
      index: editIndex,
      description: desc,
      qty: parseFloat(editQty) || 1,
      rate: parseFloat(editRate) || 0,
    });
    setEditOpen(false);
    setEditIndex(null);
    await reloadInvoice();
    setJobBusy(false);
  };

  const removeManual = (index: number) => {
    confirm({
      title: jobsT.removeItemConfirm,
      confirmText: jobsT.removeBtn,
      destructive: true,
      onConfirm: () => void (async () => {
        setJobBusy(true);
        await removeLineItemAt(supabase, { invoiceId: id, index });
        await reloadInvoice();
        setJobBusy(false);
      })(),
    });
  };

  const loadJobs = useCallback(async () => {
    const { data } = await supabase.from('jobs').select('id, title').eq('invoice_id', id).order('created_at');
    setAttachedJobs((data ?? []) as { id: string; title: string }[]);
  }, [id, supabase]);

  const fetchInvoiceRow = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, status, line_items, tax_rate, discount, invoice_number, client_id')
      .eq('id', id)
      .single();
    return data as { id: string; status: string; line_items: unknown; tax_rate: number; discount: number; invoice_number: string; client_id: string | null } | null;
  };

  const reloadInvoice = useCallback(async () => {
    const { data } = await supabase.from('invoices')
      .select('*, clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code))')
      .eq('id', id).single();
    if (data) setInvoice(mapInvoice(data as unknown as RawInvoice, []));
    await loadJobs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, supabase, loadJobs]);

  // Autoprice data + handler (parity with web).
  useEffect(() => {
    if (!business) return;
    void supabase.from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, tier_rates, match_terms, is_addon, addon_inline, sort_order, active')
      .eq('business_id', business.id).eq('active', true)
      .then(({ data }: { data: PriceSheetRow[] | null }) => setPriceItems((data ?? []).map(rowToPriceSheetItem)));
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!invClientId) { setClientTierId(null); return; }
    void supabase.from('clients').select('price_tier_id').eq('id', invClientId).single()
      .then(({ data }: { data: { price_tier_id: string | null } | null }) => setClientTierId(data?.price_tier_id ?? null));
  }, [invClientId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Walk the tied lines one at a time (a native picker per line), collecting the
  // chosen price-item ids, then re-run autoprice with those picks.
  const promptAmbiguous = (list: AutopriceAmbiguous[], collected: Record<number, string>) => {
    if (!list.length) { void runAutoprice(collected); return; }
    const [head, ...rest] = list;
    Alert.alert(
      full.dashboard.jobs.detail.autopricePickTitle,
      `${head.description}\n\n${full.dashboard.jobs.detail.autopricePickSubtitle}`,
      [
        ...head.options.map(o => ({ text: o.name, onPress: () => promptAmbiguous(rest, { ...collected, [head.index]: o.id }) })),
        { text: full.common.buttons.cancel, style: 'cancel' as const },
      ],
    );
  };
  // Reset every line to unpriced ($0) so Autoprice can re-run clean — e.g. after
  // adding a state-specific price.
  const clearPrices = () => {
    confirm({
      title: jobsT.clearPricesConfirm,
      confirmText: jobsT.clearPricesBtn,
      destructive: true,
      onConfirm: () => void (async () => {
        await rebuildInvoiceLineItems(supabase, { invoiceId: id, itemTypeLabels, hideItemTypes: business?.job_item_types_enabled === false, qtyField: business?.invoice_qty_field, force: true });
        await reloadInvoice();
      })(),
    });
  };

  const runAutoprice = async (picks?: Record<number, string>) => {
    if (!priceItems.length) return;
    const res = await autopriceInvoice(supabase, { invoiceId: id, items: priceItems, tierId: clientTierId, qtyField: business?.invoice_qty_field, picks });
    if (res.matched) { setShowInvVerify(true); await reloadInvoice(); }
    if (res.ambiguous.length) { promptAmbiguous(res.ambiguous, picks ?? {}); return; }
    if (res.matched) return;
    if (res.alreadyPriced > 0) Alert.alert('', full.dashboard.jobs.detail.autopriceAlreadyPriced);
    // Show the exact text we searched so the user sees which word to add a term for.
    else Alert.alert('', `${full.dashboard.jobs.detail.autopriceNoMatch}\n\n(${priceItems.length} price items loaded)${res.unmatched.length ? `\n${res.unmatched.map(u => `• ${u}`).join('\n')}` : ''}`);
  };

  const removeJob = (jobId: string) => {
    void (async () => {
      const inv = await fetchInvoiceRow();
      if (!inv) return;
      const sentOrPaid = ['sent', 'paid', 'overdue'].includes(inv.status);
      confirm({
        title: sentOrPaid ? tj.detail.unInvoiceSentWarning : tj.detail.unInvoiceConfirm,
        confirmText: jobsT.removeBtn,
        destructive: true,
        onConfirm: () => void (async () => {
          setJobBusy(true);
          const { remaining } = await removeJobFromInvoice(supabase, {
            jobId,
            invoice: { id: inv.id, line_items: inv.line_items as never, tax_rate: inv.tax_rate, discount: inv.discount },
          });
          setJobBusy(false);
          if (remaining === 0) {
            confirm({
              title: tj.detail.unInvoiceDeleteEmpty.replace('{{number}}', inv.invoice_number),
              confirmText: tc.buttons.delete,
              destructive: true,
              onConfirm: () => void (async () => { await supabase.from('invoices').delete().eq('id', inv.id); router.replace('/dashboard/facturas' as never); })(),
              onCancel: () => void reloadInvoice(),
            });
            return;
          }
          await reloadInvoice();
        })(),
      });
    })();
  };

  const openMove = async (jobId: string) => {
    const { data } = await supabase
      .from('invoices').select('id, invoice_number')
      .eq('business_id', business!.id).eq('status', 'draft').eq('client_id', invClientId).neq('id', id);
    setMoveTargets((data ?? []) as { id: string; invoice_number: string }[]);
    setMoveJobId(jobId);
  };

  const doMove = async (targetId: string) => {
    if (!moveJobId) return;
    setJobBusy(true);
    const from = await fetchInvoiceRow();
    const { data: to } = await supabase.from('invoices').select('id, line_items, tax_rate, discount').eq('id', targetId).single();
    if (from && to) {
      const t2 = to as { id: string; line_items: unknown; tax_rate: number; discount: number };
      await moveJobToInvoice(supabase, {
        jobId: moveJobId,
        from: { id: from.id, line_items: from.line_items as never, tax_rate: from.tax_rate, discount: from.discount },
        to: { id: t2.id, line_items: t2.line_items as never, tax_rate: t2.tax_rate, discount: t2.discount },
      });
    }
    setMoveJobId(null);
    await reloadInvoice();
    setJobBusy(false);
  };

  // Addable jobs (completed + not yet invoiced). No search → this client only;
  // searching spans ALL clients by title, sorted same-client first. Capped 50.
  const loadAddCandidates = async (term: string) => {
    let q = supabase
      .from('jobs').select('id, title, external_ref, scheduled_date, client_id, clients(first_name, last_name, company)')
      .eq('business_id', business!.id).eq('status', 'completed').is('invoice_id', null);
    const t = term.trim();
    if (t) {
      // Match the job title OR the imported Project ID (external_ref).
      const safe = t.replace(/[,()*]/g, ' ').trim();
      q = q.or(`title.ilike.*${safe}*,external_ref.ilike.*${safe}*`);
    } else if (invClientId) q = q.eq('client_id', invClientId);
    const { data } = await q.order('scheduled_date', { ascending: false }).limit(50);
    // Supabase types the embedded relation as an array on mobile — normalize.
    const rows = ((data ?? []) as any[]).map(j => {
      const cl = Array.isArray(j.clients) ? j.clients[0] : j.clients;
      return {
        id: j.id as string,
        title: j.title as string,
        externalRef: (j.external_ref ?? null) as string | null,
        scheduled_date: (j.scheduled_date ?? null) as string | null,
        client_id: (j.client_id ?? null) as string | null,
        clientName: (cl?.company || `${cl?.first_name ?? ''} ${cl?.last_name ?? ''}`.trim()) || '',
      };
    });
    rows.sort((a, b) => (a.client_id === invClientId ? 0 : 1) - (b.client_id === invClientId ? 0 : 1));
    setAddCandidates(rows);
  };

  const openAdd = async () => {
    setLinkIndex(null);
    setAddSearch('');
    await loadAddCandidates('');
    setAddPicked(new Set());
    setAddOpen(true);
  };

  // Link an imported/manual line (by index) to an existing job.
  const openLink = async (index: number) => {
    setLinkIndex(index);
    setAddSearch('');
    await loadAddCandidates('');
    setAddPicked(new Set());
    setAddOpen(true);
  };

  const closeAdd = () => { setAddOpen(false); setLinkIndex(null); };

  useEffect(() => {
    if (!addOpen) return;
    const h = setTimeout(() => { void loadAddCandidates(addSearch); }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSearch, addOpen]);

  const doAdd = async () => {
    // Link mode: associate the chosen job with the target line, don't add lines.
    if (linkIndex !== null) {
      const jobId = Array.from(addPicked)[0];
      if (!jobId) { closeAdd(); return; }
      setJobBusy(true);
      await linkLineToJob(supabase, { invoiceId: id, index: linkIndex, jobId });
      closeAdd();
      await reloadInvoice();
      setJobBusy(false);
      return;
    }
    const desc = manualDesc.trim();
    const rate = parseFloat(manualRate) || 0;
    const hasManual = !!desc && rate !== 0;
    if (!hasManual && addPicked.size === 0) { setAddOpen(false); return; }
    setJobBusy(true);
    // Manual line first, so the subsequent job fetch already includes it.
    if (hasManual) {
      await addManualLineItem(supabase, { invoiceId: id, description: desc, qty: parseFloat(manualQty) || 1, rate });
    }
    if (addPicked.size > 0) {
      const inv = await fetchInvoiceRow();
      if (inv) {
        await addJobsToInvoice(supabase, {
          invoice: { id: inv.id, client_id: inv.client_id, line_items: inv.line_items as never, tax_rate: inv.tax_rate, discount: inv.discount },
          jobIds: Array.from(addPicked),
          itemTypeLabels,
          hideItemTypes: business?.job_item_types_enabled === false,
          qtyField: business?.invoice_qty_field,
        });
      }
    }
    setManualDesc(''); setManualQty('1'); setManualRate('');
    setAddOpen(false);
    await reloadInvoice();
    setJobBusy(false);
  };
  const [updating, setUpdating] = useState(false);

  // Payment ledger (invoice_payments): "Mark paid" opens a bottom sheet
  // recording amount + method + date; partial amounts keep status 'sent'.
  const [payments, setPayments] = useState<InvoicePaymentRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethodKey, setPayMethodKey] = useState<PayMethodKey>('cash');
  const [payMethodOther, setPayMethodOther] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  // Set → the payment sheet edits this row instead of inserting a new one.
  const [payEditId, setPayEditId] = useState<string | null>(null);
  // Optional payment photo (e.g. a check picture). `payPhotoUri` = a newly
  // picked local image (pending upload); `payPhotoPath` = the stored path when
  // editing a payment that already has one. Viewer holds the tapped photo url.
  const [payPhotoUri, setPayPhotoUri] = useState<string | null>(null);
  const [payPhotoPath, setPayPhotoPath] = useState<string | null>(null);
  const [payPhotoExistingUrl, setPayPhotoExistingUrl] = useState<string | null>(null);
  // True once the user removes an existing photo — lets submit write photo_path:
  // null. Otherwise we OMIT photo_path entirely so payments still record on DBs
  // where migration 174 (the photo column) hasn't been run yet.
  const [payPhotoRemoved, setPayPhotoRemoved] = useState(false);
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null);

  const loadPayments = async () => {
    const { data } = await supabase
      .from('invoice_payments')
      .select('id, amount, method, paid_on, photo_path')
      .eq('invoice_id', id)
      .order('paid_on')
      .order('created_at');
    const rows = (data ?? []) as { id: string; amount: number; method: string | null; paid_on: string; photo_path: string | null }[];
    // Sign each photo path for display (short-lived URLs).
    const signed = await Promise.all(
      rows.map(r => (r.photo_path ? signedUrl(supabase, r.photo_path).catch(() => null) : Promise.resolve(null))),
    );
    setPayments(rows.map((r, i) => ({ id: r.id, amount: r.amount, method: r.method, paidOn: r.paid_on, photoPath: r.photo_path, photoUrl: signed[i] })));
  };

  const pickPaymentPhoto = async () => {
    // Camera first (it's usually a physical check); fall back to the library.
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.granted) {
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!r.canceled && r.assets[0]) setPayPhotoUri(r.assets[0].uri);
      return;
    }
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (!r.canceled && r.assets[0]) setPayPhotoUri(r.assets[0].uri);
  };

  const openRecordPayment = () => {
    if (!invoice) return;
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, invoice.totalAmount - paid);
    setPayEditId(null);
    setPayAmount(remaining > 0 ? String(Math.round(remaining * 100) / 100) : '');
    setPayMethodKey('cash');
    setPayMethodOther('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayPhotoUri(null);
    setPayPhotoPath(null);
    setPayPhotoExistingUrl(null);
    setPayPhotoRemoved(false);
    setPayOpen(true);
  };

  const openEditPayment = (p: InvoicePaymentRow) => {
    const key = PAY_METHODS.find(k => tInv.payments.methods[k] === p.method);
    setPayEditId(p.id);
    setPayAmount(String(p.amount));
    setPayMethodKey(key ?? (p.method ? 'other' : 'cash'));
    setPayMethodOther(key || !p.method ? '' : p.method);
    setPayDate(p.paidOn);
    setPayPhotoUri(null);
    setPayPhotoPath(p.photoPath ?? null);
    setPayPhotoExistingUrl(p.photoUrl ?? null);
    setPayPhotoRemoved(false);
    setPayOpen(true);
  };

  /** Sync invoice status/summary after the ledger changed (edit path — can
   *  flip either direction: newly covered → paid, no longer covered → sent). */
  const syncInvoiceToPayments = async (rows: InvoicePaymentRow[]) => {
    if (!invoice) return;
    const paid = rows.reduce((sum, p) => sum + p.amount, 0);
    const fullyPaid = paid >= invoice.totalAmount - 0.005;
    const methods = Array.from(new Set(rows.map(p => p.method).filter(Boolean))) as string[];
    if (fullyPaid && invoice.status !== 'paid') {
      await supabase.from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: methods.join(', ') || null })
        .eq('id', id);
      setInvoice(prev => (prev ? { ...prev, status: 'paid' } : prev));
    } else if (!fullyPaid && invoice.status === 'paid') {
      await supabase.from('invoices')
        .update({ status: 'sent', paid_at: null, payment_method: methods.join(', ') || null })
        .eq('id', id);
      setInvoice(prev => (prev ? { ...prev, status: 'sent' } : prev));
    } else {
      await supabase.from('invoices').update({ payment_method: methods.join(', ') || null }).eq('id', id);
    }
  };

  const submitPayment = async () => {
    if (!business || !invoice) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;
    setPayBusy(true);
    const method = (payMethodKey === 'other' ? payMethodOther.trim() : tInv.payments.methods[payMethodKey]) || null;
    // Upload a newly-picked photo (keep the existing path when editing untouched).
    let photoPath: string | null = payPhotoPath;
    if (payPhotoUri) {
      try {
        const uid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const path = paymentPhotoPath(business.id, uid);
        const blob = await (await fetch(payPhotoUri)).blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const { error: upErr } = await supabase.storage.from(INVOICE_PAYMENT_BUCKET).upload(path, arrayBuffer, { upsert: false, contentType: 'image/jpeg' });
        if (!upErr) photoPath = path;
      } catch { /* keep going without the photo */ }
    }
    // Only touch photo_path when a photo was added or removed this session, so
    // payments still save where migration 174 isn't applied yet.
    const writePhoto = !!payPhotoUri || payPhotoRemoved;
    if (payEditId) {
      const { error } = await supabase.from('invoice_payments')
        .update({ amount, method, paid_on: payDate || new Date().toISOString().slice(0, 10), ...(writePhoto ? { photo_path: photoPath } : {}) })
        .eq('id', payEditId);
      if (error) { setPayBusy(false); return; }
      await syncInvoiceToPayments(payments.map(p => (p.id === payEditId ? { ...p, amount, method, paidOn: payDate } : p)));
      void logAudit(supabase, business.id, 'invoice.payment_edited', 'invoice', id, {
        invoice_number: invoice.invoiceNumber, amount, method,
      });
      await loadPayments();
      setPayOpen(false);
      setPayEditId(null);
      setPayBusy(false);
      return;
    }
    const { error } = await supabase.from('invoice_payments').insert({
      business_id: business.id,
      invoice_id: id,
      amount,
      method,
      paid_on: payDate || new Date().toISOString().slice(0, 10),
      ...(writePhoto ? { photo_path: photoPath } : {}),
    });
    if (error) { setPayBusy(false); return; }
    const next = [...payments, { id: 'tmp', amount, method, paidOn: payDate }];
    const paid = next.reduce((sum, p) => sum + p.amount, 0);
    // Half-cent tolerance absorbs float drift on split payments.
    const fullyPaid = paid >= invoice.totalAmount - 0.005;
    if (fullyPaid) {
      const methods = Array.from(new Set(next.map(p => p.method).filter(Boolean))) as string[];
      await supabase.from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: methods.join(', ') || null })
        .eq('id', id);
      setInvoice(prev => (prev ? { ...prev, status: 'paid' } : prev));
    }
    void logAudit(supabase, business.id, 'invoice.payment', 'invoice', id, {
      invoice_number: invoice.invoiceNumber, amount, method, paid_in_full: fullyPaid,
    });
    await loadPayments();
    setPayOpen(false);
    setPayBusy(false);
  };

  // Paid → sent: undoing "paid" means the recorded payments were a mistake,
  // so they're removed too (a single wrong partial has its own row delete).
  const undoPaid = () => {
    confirm({
      title: tInv.payments.undoPaid,
      body: tInv.payments.undoPaidConfirm,
      confirmText: tInv.payments.undoPaid,
      destructive: true,
      onConfirm: async () => {
        if (!business || !invoice) return;
        await supabase.from('invoice_payments').delete().eq('invoice_id', id);
        await supabase.from('invoices')
          .update({ status: 'sent', paid_at: null, payment_method: null })
          .eq('id', id);
        setInvoice(prev => (prev ? { ...prev, status: 'sent' } : prev));
        void logAudit(supabase, business.id, 'invoice.unpaid', 'invoice', id, {
          invoice_number: invoice.invoiceNumber,
        });
        setPayments([]);
      },
    });
  };

  const deletePayment = (p: InvoicePaymentRow) => {
    confirm({
      title: tInv.payments.deleteConfirm,
      confirmText: tc.buttons.delete,
      destructive: true,
      onConfirm: async () => {
        if (!business || !invoice) return;
        await supabase.from('invoice_payments').delete().eq('id', p.id);
        const rest = payments.filter(x => x.id !== p.id);
        const paid = rest.reduce((sum, x) => sum + x.amount, 0);
        const methods = Array.from(new Set(rest.map(x => x.method).filter(Boolean))) as string[];
        if (invoice.status === 'paid' && paid < invoice.totalAmount - 0.005) {
          // No longer covered — drop back to 'sent' so the balance is visible.
          await supabase.from('invoices')
            .update({ status: 'sent', paid_at: null, payment_method: methods.join(', ') || null })
            .eq('id', id);
          setInvoice(prev => (prev ? { ...prev, status: 'sent' } : prev));
        } else {
          await supabase.from('invoices').update({ payment_method: methods.join(', ') || null }).eq('id', id);
        }
        void logAudit(supabase, business.id, 'invoice.payment_deleted', 'invoice', id, {
          invoice_number: invoice.invoiceNumber, amount: p.amount, method: p.method,
        });
        await loadPayments();
      },
    });
  };

  const mapInvoice = (raw: RawInvoice, tpls: InvoiceFieldTemplate[]): InvoiceDetail => {
    const clientList: RawClient[] = raw.invoice_clients?.length
      ? raw.invoice_clients.map(ic => ic.clients)
      : raw.clients
        ? [raw.clients]
        : [];
    // Resolve custom fields into ordered, label-mapped, non-empty entries.
    const cf = raw.custom_fields ?? {};
    const customFields = tpls
      .map(tpl => {
        const v = cf[tpl.field_key];
        if (v == null || v === '') return null;
        const value = tpl.field_type === 'boolean'
          ? (v === 'true' ? tc.states.yes : tc.states.no)
          : tpl.field_type === 'number'
            ? formatNumberGrouped(v as string)
            : v;
        return { key: tpl.field_key, label: tpl.field_label, value };
      })
      .filter((e): e is { key: string; label: string; value: string } => e !== null);
    return {
      id: raw.id,
      invoiceNumber: raw.invoice_number,
      status: raw.status,
      issueDate: raw.issue_date,
      dueDate: raw.due_date,
      sentAt: (raw as { sent_at?: string | null }).sent_at ?? null,
      paidAt: (raw as { paid_at?: string | null }).paid_at ?? null,
      paymentMethod: (raw as { payment_method?: string | null }).payment_method ?? null,
      lineItems: raw.line_items ?? [],
      subtotalAmount: raw.subtotal_amount,
      taxRate: raw.tax_rate,
      taxAmount: raw.tax_amount,
      totalAmount: raw.total_amount,
      notes: raw.notes,
      internalNotes: (raw as { internal_notes?: string | null }).internal_notes ?? null,
      language: raw.language ?? 'es',
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      createdBy: (raw as { created_by?: string | null }).created_by ?? null,
      updatedBy: (raw as { updated_by?: string | null }).updated_by ?? null,
      customFields,
      clients: clientList.map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email_office ?? c.email_home ?? c.email,
        phoneCell: c.phone_cell,
        company: c.company,
        address: c.address,
        city: c.city,
        state: c.state,
        zip: c.zip_code,
      })),
    };
  };

  // True once any snapshot (cached or live) painted.
  const hasDataRef = useRef(false);
  useEffect(() => {
    if (!business) return;
    void (async () => {
      // Cache-first: paint the last snapshot BEFORE the line-item rebuild
      // below — that's a WRITE round trip that used to block first paint.
      if (!hasDataRef.current) {
        const cached = await swrRead<{ invoice: NonNullable<typeof invoice>; shareToken: string | null; invClientId: string | null }>(`invoice_detail_${id}`);
        if (cached?.data && !hasDataRef.current) {
          hasDataRef.current = true;
          setInvoice(cached.data.invoice);
          setShareToken(cached.data.shareToken);
          setInvClientId(cached.data.invClientId);
          setLoading(false);
        }
      }
      // Sync a draft invoice's line items with its jobs' current items first.
      await rebuildInvoiceLineItems(supabase, { invoiceId: id, itemTypeLabels, hideItemTypes: business?.job_item_types_enabled === false, qtyField: business?.invoice_qty_field });
      const [{ data }, { data: tpls }] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            '*, clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code))',
          )
          .eq('id', id)
          .single(),
        supabase
          .from('invoice_field_templates')
          .select('field_key, field_label, field_label_es, field_label_en, field_type')
          .eq('business_id', business.id)
          .order('sort_order'),
      ]);
      const templateList = localizeTemplates((tpls ?? []) as InvoiceFieldTemplate[], locale);
      if (data) {
        setInvoice(mapInvoice(data as unknown as RawInvoice, templateList));
        const raw = data as unknown as { share_token: string | null; template_config: Record<string, unknown> | null; client_id: string | null };
        setShareToken(raw.share_token ?? null);
        setInvoiceConfigRaw(raw.template_config ?? null);
        setInvClientId(raw.client_id ?? null);
        hasDataRef.current = true;
        // Persist for the next instant open (mapped snapshot; signed photo
        // URLs are NOT cached — payments re-sign on load).
        void swrWrite(`invoice_detail_${id}`, {
          invoice: mapInvoice(data as unknown as RawInvoice, templateList),
          shareToken: raw.share_token ?? null,
          invClientId: raw.client_id ?? null,
        });
        void loadJobs();
        void loadPayments();
      }
      setLoading(false);
    })();
  }, [id, business, locale]);

  const updateStatus = async (status: 'sent' | 'paid' | 'draft' | 'total_loss') => {
    // Write-off (→ total_loss) and reinstate (total_loss → sent) are a
    // deletion-class action, gated on deleteInvoice; ordinary sent/paid/draft
    // transitions need editInvoice. The shared screen renders these buttons by
    // invoice.status (not prop presence), so the permission split lives here.
    const writeOffPath = status === 'total_loss' || invoice?.status === 'total_loss';
    if (writeOffPath ? !can.deleteInvoice(currentRole) : !can.editInvoice(currentRole)) return;
    setUpdating(true);
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'draft') update.sent_at = null; // undo "mark as sent"
    await supabase.from('invoices').update(update).eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, status === 'paid' ? 'invoice.paid' : status === 'sent' ? 'invoice.sent' : 'invoice.unsent', 'invoice', id, {
        invoice_number: invoice?.invoiceNumber,
      });
    }
    setInvoice(prev => (prev ? { ...prev, status } : prev));
    setUpdating(false);
  };

  const confirmDelete = () => {
    if (!invoice || !business) return;
    confirm({
      title: tInv.deleteTitle,
      body: tInv.deleteConfirm
        .replace('{{number}}', invoice.invoiceNumber)
        .replace(/<\/?strong>/g, ''),
      confirmText: tc.buttons.delete,
      destructive: true,
      onConfirm: () => void (async () => {
        void logAudit(supabase, business.id, 'invoice.deleted', 'invoice', id, {
          invoice_number: invoice.invoiceNumber,
          total_amount: invoice.totalAmount,
          status: invoice.status,
        });
        // Detach related jobs AND revert them to "completed" (otherwise
        // they'd be stuck in the "invoiced" step with no invoice).
        await supabase.from('jobs').update({ status: 'completed', invoice_id: null, invoiced_at: null }).eq('invoice_id', id);
        await supabase.from('invoice_clients').delete().eq('invoice_id', id);
        const { error } = await supabase.from('invoices').delete().eq('id', id);
        if (error) {
          Alert.alert('', tInv.errorDelete);
          return;
        }
        router.replace('/dashboard/facturas' as never);
      })(),
    });
  };

  const branding: InvoiceBranding = {
    name: business?.name ?? '',
    logoUrl: business?.logo_url ?? null,
    city: business?.city ?? null,
    state: business?.state ?? null,
    address: business?.address ?? null,
    postalCode: business?.postal_code ?? null,
    taxId: business?.tax_id ?? null,
    licenseNumber: business?.license_number ?? null,
    email: business?.email ?? null,
    phone: business?.phone ?? null,
    website: business?.website ?? null,
  };
  const templateConfig = resolveConfig(invoiceConfigRaw, business?.invoice_template ?? null);

  // Generate (once) + persist the public share token, freezing the resolved
  // config onto the invoice so restyling the default never changes a shared one.
  // While the invoice is a DRAFT, (re)capture the CURRENT design on every
  // print/share/send so the emailed PDF matches what the owner sees now — a
  // draft hasn't been delivered, so a stale earlier snapshot must not stick.
  // Once sent, the snapshot is frozen so a later restyle can't change it.
  const ensureShareToken = async (): Promise<string> => {
    const isDraft = invoice?.status === 'draft';
    const freezeConfig = isDraft
      ? resolveConfig(null, business?.invoice_template ?? null)
      : (invoiceConfigRaw ?? templateConfig);
    if (shareToken) {
      if (isDraft) {
        await supabase.from('invoices').update({ template_config: freezeConfig }).eq('id', id);
        setInvoiceConfigRaw(freezeConfig as Record<string, unknown>);
      }
      return shareToken;
    }
    const token = genToken();
    await supabase
      .from('invoices')
      .update({ share_token: token, template_config: freezeConfig })
      .eq('id', id);
    setInvoiceConfigRaw(freezeConfig as Record<string, unknown>);
    setShareToken(token);
    return token;
  };

  // PDF config matches web print semantics: a DRAFT renders with the CURRENT
  // business design (web re-captures on every print); a sent/paid invoice
  // keeps its frozen snapshot so restyling never changes a delivered document.
  const pdfConfig = () =>
    invoice?.status === 'draft'
      ? resolveConfig(null, business?.invoice_template ?? null)
      : templateConfig;

  const exportPdf = async () => {
    if (!invoice) return;
    const vm = buildInvoiceViewModel(pdfConfig(), invoice, branding);
    const uri = await renderInvoicePdf(buildInvoiceHtml(vm), invoice.invoiceNumber);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    }
  };

  const shareLink = async () => {
    const token = await ensureShareToken();
    const base = WEB_APP_URL;
    const url = `${base}/factura/${token}`;
    await Share.share({ message: url, url });
  };

  // Email the invoice: open the mail composer pre-filled with the client's
  // address, subject/body, AND the invoice PDF attached, then mark sent.
  // Falls back to a mailto link (body only — mailto can't carry attachments)
  // when the native mail composer isn't available.
  const sendInvoice = async () => {
    if (!invoice) return;
    const email = invoice.clients[0]?.email ?? '';
    if (!email) { Alert.alert('', tInv.sendNoEmail); return; }
    // Auto-CC the client's contacts flagged "CC on invoices" (deduped, and
    // never the To address itself).
    const clientId = invoice.clients[0]?.id ?? null;
    let ccList: string[] = [];
    if (clientId) {
      const { data: ccRows } = await supabase
        .from('client_contacts')
        .select('email')
        .eq('client_id', clientId)
        .eq('cc_on_invoices', true)
        .not('email', 'is', null);
      ccList = Array.from(new Set(
        ((ccRows ?? []) as { email: string | null }[])
          .map(r => (r.email ?? '').trim())
          .filter(e => e && e.toLowerCase() !== email.toLowerCase()),
      ));
    }
    const token = await ensureShareToken();
    const base = WEB_APP_URL;
    const url = `${base}/factura/${token}`;
    // Delivery mode (Ajustes → Facturas → Email delivery). Default = attach PDF.
    const delivery = business?.invoice_email_delivery || 'pdf';
    const includeLink = delivery === 'link' || delivery === 'both';
    const includePdf = delivery === 'pdf' || delivery === 'both';
    // Business's custom templates (Ajustes → Facturas → Email) win; blank
    // falls back to the localized default. {{tokens}} substituted here.
    const cl = invoice.clients[0];
    const { subject, body } = renderInvoiceEmail({
      subjectTemplate: business?.invoice_email_subject,
      bodyTemplate: business?.invoice_email_body,
      defaultSubject: tInv.emailSubject,
      defaultBody: tInv.emailBody,
      vars: {
        number: invoice.invoiceNumber,
        link: includeLink ? url : '',
        client: cl ? `${cl.firstName} ${cl.lastName}`.trim() : '',
        firstName: cl?.firstName ?? '',
        lastName: cl?.lastName ?? '',
        company: cl?.company ?? '',
        business: business?.name ?? '',
        total: `$${invoice.totalAmount.toFixed(2)}`,
        dueDate: invoice.dueDate ?? '',
      },
    });

    // Preferred path: native mail composer with the PDF attached.
    // Lazily require expo-mail-composer so a dev client that doesn't have the
    // native module compiled in doesn't crash this screen at import time — it
    // just falls back to the mailto link below until the app is rebuilt.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let MailComposer: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      MailComposer = require('expo-mail-composer');
    } catch {
      MailComposer = null;
    }
    let composerAvailable = false;
    if (MailComposer) {
      try {
        composerAvailable = await MailComposer.isAvailableAsync();
      } catch {
        composerAvailable = false;
      }
    }
    if (MailComposer && composerAvailable) {
      try {
        // Attach the invoice PDF only when the delivery mode includes it (same
        // renderer as the "Export PDF" action). Link-only skips PDF generation.
        let attachments: string[] = [];
        if (includePdf) {
          const vm = buildInvoiceViewModel(pdfConfig(), invoice, branding);
          const uri = await renderInvoicePdf(buildInvoiceHtml(vm), invoice.invoiceNumber);
          attachments = [uri];
        }
        const result = await MailComposer.composeAsync({
          recipients: [email],
          ...(ccList.length ? { ccRecipients: ccList } : {}),
          subject,
          body,
          attachments,
        });
        // Cancelled → don't flip status (nothing was sent).
        if (result.status !== MailComposer.MailComposerStatus?.CANCELLED) {
          await updateStatus('sent');
        }
        return;
      } catch {
        // Fall through to the mailto fallback below.
      }
    }

    // Fallback: mailto link (body carries the public link; no attachment).
    const ccParam = ccList.length ? `&cc=${encodeURIComponent(ccList.join(','))}` : '';
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${ccParam}`;
    try {
      await Linking.openURL(mailto);
      // Only mark sent when a mail composer actually opened — previously a
      // device with no mail app flipped the status with nothing sent.
      await updateStatus('sent');
    } catch {
      Alert.alert('', full.dashboard.settings.support.noMailApp.replace('{{email}}', email));
    }
  };

  const canDelete = can.deleteInvoice(currentRole);
  const canEdit = can.editInvoice(currentRole);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <InvoiceDetailScreen
        loading={loading}
        invoice={invoice && {
          ...invoice,
          createdByName: invoice.createdBy ? nameById[invoice.createdBy] ?? null : null,
          updatedByName: invoice.updatedBy ? nameById[invoice.updatedBy] ?? null : null,
        }}
        branding={branding}
        templateConfig={templateConfig}
        canEdit={canEdit}
        canWriteOff={canDelete}
        updating={updating}
        onBack={goBack}
        onUpdateStatus={updateStatus}
        onPrint={invoice ? exportPdf : undefined}
        onShareLink={invoice ? shareLink : undefined}
        onEdit={invoice && canEdit ? () => router.replace(`/dashboard/facturas/nueva?edit=${id}` as never) : undefined}
        onDelete={invoice && canDelete ? confirmDelete : undefined}
        onAutoprice={invoice && canEdit && invoice.status === 'draft' && priceItems.length > 0 ? runAutoprice : undefined}
        onClearPrices={invoice && canEdit && invoice.status === 'draft' && priceItems.length > 0 ? clearPrices : undefined}
        autopriceVerify={showInvVerify}
        onMoveJob={canEdit ? openMove : undefined}
        onRemoveJob={canEdit ? removeJob : undefined}
        onAddJob={canEdit ? openAdd : undefined}
        onRemoveManualItem={canEdit ? removeManual : undefined}
        onEditManualItem={canEdit ? editManual : undefined}
        onLinkLine={canEdit ? openLink : undefined}
        onJobPress={(jobId) => setPreviewJobId(jobId)}
        jobBusy={jobBusy}
        onSendInvoice={canEdit ? sendInvoice : undefined}
        payments={payments}
        onRecordPayment={canEdit ? openRecordPayment : undefined}
        onEditPayment={canEdit ? openEditPayment : undefined}
        onDeletePayment={canEdit ? deletePayment : undefined}
        onViewPaymentPhoto={setViewPhotoUrl}
        onUndoPaid={canEdit ? undoPaid : undefined}
        onClientPress={(clientId) => router.push(`/dashboard/clientes/${clientId}?from=invoice&invoice=${id}` as never)}
        jobTitles={Object.fromEntries(attachedJobs.map(j => [j.id, j.title]))}
      />

      <JobPreviewSheet
        supabase={supabase}
        jobId={previewJobId}
        onClose={() => setPreviewJobId(null)}
        onOpenFull={(jid) => { setPreviewJobId(null); router.push(`/dashboard/trabajos/${jid}?from=invoice&invoice=${id}` as never); }}
      />

      {/* Move-to-another-invoice picker */}
      <RNModal visible={moveJobId !== null} transparent animationType="fade" onRequestClose={() => setMoveJobId(null)}>
        <Pressable onPress={() => setMoveJobId(null)} className="flex-1 bg-black/40 justify-end">
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10" onPress={() => {}}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-ink">{jobsT.moveTitle}</Text>
              <Pressable onPress={() => setMoveJobId(null)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            {moveTargets.length === 0 ? (
              <Text className="text-sm text-faint pb-4">{jobsT.moveEmpty}</Text>
            ) : (
              moveTargets.map(inv => (
                <Pressable key={inv.id} onPress={() => doMove(inv.id)} disabled={jobBusy} className="py-3 border-b border-border-soft">
                  <Text className="text-sm font-mono text-ink">{inv.invoice_number}</Text>
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Add-completed-jobs picker */}
      <RNModal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable onPress={closeAdd} className="flex-1 bg-black/40 justify-end">
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10" onPress={() => {}}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-ink">{linkIndex !== null ? jobsT.linkTitle : jobsT.addTitle}</Text>
              <Pressable onPress={closeAdd} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>

            {/* Manual line item — hidden in link mode (associating a line). */}
            {linkIndex === null ? (<>
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{jobsT.manualHeading}</Text>
            <TextInput
              value={manualDesc}
              onChangeText={setManualDesc}
              placeholder={jobsT.manualDescPlaceholder}
              placeholderTextColor={c.faint}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink mb-2"
            />
            <View className="flex-row gap-2 mb-4">
              <TextInput
                value={manualQty}
                onChangeText={v => setManualQty(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder={tj.new.colQty}
                placeholderTextColor={c.faint}
                className="w-20 bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-center text-ink"
              />
              <Pressable
                onPress={() => setManualRate(toggleSign(manualRate))}
                className={`w-11 items-center justify-center rounded-xl border active:opacity-80 ${
                  manualRate.startsWith('-') ? 'bg-primary border-primary' : 'bg-card border-border'
                }`}
              >
                <Text className={`text-base font-bold ${manualRate.startsWith('-') ? 'text-white' : 'text-muted'}`}>±</Text>
              </Pressable>
              <View className="flex-1 relative justify-center">
                <Text className="absolute left-3 z-10 text-faint">$</Text>
                <TextInput
                  value={manualRate}
                  onChangeText={v => setManualRate(cleanAmount(v))}
                  keyboardType="decimal-pad"
                  placeholder={tj.detail.colUnitPriceShort}
                  placeholderTextColor={c.faint}
                  className="bg-card border border-border rounded-xl pl-6 pr-3 py-2.5 text-sm text-ink"
                />
              </View>
            </View>
            </>) : null}

            {/* Completed jobs — searchable across clients, same client first. */}
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{jobsT.jobsHeading}</Text>
            <TextInput
              value={addSearch}
              onChangeText={setAddSearch}
              placeholder={jobsT.addSearchPlaceholder}
              placeholderTextColor={c.faint}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink mb-2"
            />
            {addCandidates.length === 0 ? (
              <Text className="text-sm text-faint pb-2">{jobsT.addEmpty}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }}>
                {addCandidates.map(j => {
                  const picked = addPicked.has(j.id);
                  const otherClient = j.client_id !== invClientId && !!j.clientName;
                  return (
                    <Pressable
                      key={j.id}
                      onPress={() => setAddPicked(prev => {
                        if (linkIndex !== null) return new Set(prev.has(j.id) ? [] : [j.id]);
                        const n = new Set(prev); n.has(j.id) ? n.delete(j.id) : n.add(j.id); return n;
                      })}
                      className={`flex-row items-center gap-3 px-2 py-3 rounded-xl ${picked ? 'bg-primary/10' : ''}`}
                    >
                      <View className={`w-5 h-5 rounded-md border items-center justify-center ${picked ? 'bg-primary border-primary' : 'border-border'}`}>
                        {picked ? <Text className="text-white text-[11px] font-bold">✓</Text> : null}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm text-ink" numberOfLines={1}>{j.title}</Text>
                        <Text className="text-xs text-faint mt-0.5" numberOfLines={1}>
                          {j.externalRef ? <Text className="font-mono">{j.externalRef}</Text> : null}
                          {j.externalRef && (otherClient || j.scheduled_date) ? ' · ' : ''}
                          {otherClient ? <Text className="text-amber-500 font-medium">{j.clientName}</Text> : null}
                          {otherClient && j.scheduled_date ? ' · ' : ''}
                          {j.scheduled_date ? formatDateLong(j.scheduled_date, full.dashboard.dateLocale) : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable onPress={doAdd} disabled={jobBusy} className="mt-4 py-3.5 rounded-2xl bg-primary items-center active:opacity-90">
              <Text className="text-sm font-semibold text-white">{linkIndex !== null ? jobsT.linkBtn : jobsT.addConfirm}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Edit a manual line item */}
      <RNModal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable onPress={() => setEditOpen(false)} className="flex-1 bg-black/40 justify-end">
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10" onPress={() => {}}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-ink">{jobsT.editItemTitle}</Text>
              <Pressable onPress={() => setEditOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <TextInput
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder={jobsT.manualDescPlaceholder}
              placeholderTextColor={c.faint}
              className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink mb-2"
            />
            <View className="flex-row gap-2 mb-4">
              <TextInput
                value={editQty}
                onChangeText={v => setEditQty(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder={tj.new.colQty}
                placeholderTextColor={c.faint}
                className="w-20 bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-center text-ink"
              />
              <Pressable
                onPress={() => setEditRate(toggleSign(editRate))}
                className={`w-11 items-center justify-center rounded-xl border active:opacity-80 ${
                  editRate.startsWith('-') ? 'bg-primary border-primary' : 'bg-card border-border'
                }`}
              >
                <Text className={`text-base font-bold ${editRate.startsWith('-') ? 'text-white' : 'text-muted'}`}>±</Text>
              </Pressable>
              <View className="flex-1 relative justify-center">
                <Text className="absolute left-3 z-10 text-faint">$</Text>
                <TextInput
                  value={editRate}
                  onChangeText={v => setEditRate(cleanAmount(v))}
                  keyboardType="decimal-pad"
                  placeholder={tj.detail.colUnitPriceShort}
                  placeholderTextColor={c.faint}
                  className="bg-card border border-border rounded-xl pl-6 pr-3 py-2.5 text-sm text-ink"
                />
              </View>
            </View>
            <Pressable onPress={doEditSave} disabled={jobBusy || !editDesc.trim()} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
              <Text className="text-sm font-semibold text-white">{tc.buttons.save}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Record payment — amount defaults to the remaining balance */}
      <RNModal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable onPress={() => setPayOpen(false)} className="flex-1 bg-black/40 justify-end">
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10" onPress={() => {}}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-ink">{payEditId ? tInv.payments.editTitle : tInv.payments.recordTitle}</Text>
              <Pressable onPress={() => setPayOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>

            <Text className="text-sm font-semibold text-ink mb-1.5">{tInv.payments.amountLabel}</Text>
            <View className="relative justify-center mb-1">
              <Text className="absolute left-3 z-10 text-faint">$</Text>
              <TextInput
                value={payAmount}
                onChangeText={v => setPayAmount(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholderTextColor={c.faint}
                className="bg-card border border-border rounded-xl pl-6 pr-32 py-2.5 text-sm text-ink"
              />
              <Pressable
                onPress={() => {
                  if (!invoice) return;
                  const remaining = Math.max(0, invoice.totalAmount - payments.filter(p => p.id !== payEditId).reduce((sum, p) => sum + p.amount, 0));
                  setPayAmount(String(Math.round(remaining * 100) / 100));
                }}
                className="absolute right-2 rounded-full bg-indigo-500/10 px-2.5 py-1 active:bg-indigo-100"
              >
                <Text className="text-xs font-semibold text-indigo-600">{tInv.payments.fullAmountBtn}</Text>
              </Pressable>
            </View>
            {invoice && parseFloat(payAmount) > 0 && parseFloat(payAmount) >= (invoice.totalAmount - payments.filter(p => p.id !== payEditId).reduce((sum, p) => sum + p.amount, 0)) - 0.005 ? (
              <Text className="text-xs text-emerald-600 mb-2">{tInv.payments.paidInFullHint}</Text>
            ) : <View className="mb-2" />}

            <View className="mb-3">
              <Select
                label={tInv.payments.methodLabel}
                value={payMethodKey}
                onValueChange={v => setPayMethodKey(v as PayMethodKey)}
                options={PAY_METHODS.map(k => ({ value: k, label: tInv.payments.methods[k] }))}
              />
            </View>
            {payMethodKey === 'other' ? (
              <TextInput
                value={payMethodOther}
                onChangeText={setPayMethodOther}
                placeholder={tInv.payments.otherPlaceholder}
                placeholderTextColor={c.faint}
                className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-ink mb-3"
              />
            ) : null}

            <DatePicker label={tInv.payments.dateLabel} value={payDate} onChange={setPayDate} />

            {/* Optional payment photo (e.g. a picture of the check). */}
            <View className="mt-3">
              <Text className="text-sm font-semibold text-ink mb-1.5">{tInv.payments.photoLabel}</Text>
              {payPhotoUri || payPhotoExistingUrl ? (
                <View className="flex-row items-center gap-3">
                  <Image source={{ uri: payPhotoUri ?? payPhotoExistingUrl ?? '' }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                  <Pressable onPress={pickPaymentPhoto} className="active:opacity-60"><Text className="text-sm text-primary font-semibold">{tInv.payments.changePhoto}</Text></Pressable>
                  <Pressable onPress={() => { setPayPhotoUri(null); setPayPhotoPath(null); setPayPhotoExistingUrl(null); setPayPhotoRemoved(true); }} className="active:opacity-60"><Text className="text-sm text-red-600 font-semibold">{tInv.payments.removePhoto}</Text></Pressable>
                </View>
              ) : (
                <Pressable onPress={pickPaymentPhoto} className="flex-row items-center gap-2 bg-border-soft rounded-xl py-2.5 px-3 active:opacity-80">
                  <Camera size={18} color={c.muted} />
                  <Text className="text-sm text-muted font-medium">{tInv.payments.addPhoto}</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={submitPayment}
              disabled={payBusy || !parseFloat(payAmount)}
              className="mt-4 py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50"
            >
              <Text className="text-sm font-semibold text-white">{payEditId ? tc.buttons.save : tInv.payments.recordBtn}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Payment photo viewer */}
      <RNModal visible={!!viewPhotoUrl} transparent animationType="fade" onRequestClose={() => setViewPhotoUrl(null)}>
        <Pressable onPress={() => setViewPhotoUrl(null)} className="flex-1 bg-black/90 items-center justify-center p-4">
          {viewPhotoUrl ? <Image source={{ uri: viewPhotoUrl }} resizeMode="contain" style={{ width: '100%', height: '80%' }} /> : null}
        </Pressable>
      </RNModal>

      {confirmSheet}
    </SafeAreaView>
  );
}
