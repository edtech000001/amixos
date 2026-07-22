import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, View, Text, Pressable, ScrollView, Modal as RNModal, Linking, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
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
import { removeJobFromInvoice, moveJobToInvoice, addJobsToInvoice, rebuildInvoiceLineItems, addManualLineItem, removeLineItemAt, updateLineItemAt, autopriceInvoice } from '@amixos/shared/lib/invoicing';
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
  const [addCandidates, setAddCandidates] = useState<{ id: string; title: string; scheduled_date: string | null }[]>([]);
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
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, tier_rates, match_terms, is_addon, sort_order, active')
      .eq('business_id', business.id).eq('active', true)
      .then(({ data }: { data: PriceSheetRow[] | null }) => setPriceItems((data ?? []).map(rowToPriceSheetItem)));
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!invClientId) { setClientTierId(null); return; }
    void supabase.from('clients').select('price_tier_id').eq('id', invClientId).single()
      .then(({ data }: { data: { price_tier_id: string | null } | null }) => setClientTierId(data?.price_tier_id ?? null));
  }, [invClientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const runAutoprice = async () => {
    if (!priceItems.length) return;
    const { matched, alreadyPriced } = await autopriceInvoice(supabase, { invoiceId: id, items: priceItems, tierId: clientTierId, qtyField: business?.invoice_qty_field });
    if (matched) { setShowInvVerify(true); await reloadInvoice(); }
    else Alert.alert('', alreadyPriced > 0 ? full.dashboard.jobs.detail.autopriceAlreadyPriced : full.dashboard.jobs.detail.autopriceNoMatch);
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

  const openAdd = async () => {
    const { data } = await supabase
      .from('jobs').select('id, title, scheduled_date')
      .eq('business_id', business!.id).eq('client_id', invClientId).eq('status', 'completed').is('invoice_id', null);
    setAddCandidates((data ?? []) as { id: string; title: string; scheduled_date: string | null }[]);
    setAddPicked(new Set());
    setAddOpen(true);
  };

  const doAdd = async () => {
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

  const loadPayments = async () => {
    const { data } = await supabase
      .from('invoice_payments')
      .select('id, amount, method, paid_on')
      .eq('invoice_id', id)
      .order('paid_on')
      .order('created_at');
    setPayments(((data ?? []) as { id: string; amount: number; method: string | null; paid_on: string }[])
      .map(r => ({ id: r.id, amount: r.amount, method: r.method, paidOn: r.paid_on })));
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
    setPayOpen(true);
  };

  const openEditPayment = (p: InvoicePaymentRow) => {
    const key = PAY_METHODS.find(k => tInv.payments.methods[k] === p.method);
    setPayEditId(p.id);
    setPayAmount(String(p.amount));
    setPayMethodKey(key ?? (p.method ? 'other' : 'cash'));
    setPayMethodOther(key || !p.method ? '' : p.method);
    setPayDate(p.paidOn);
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
    if (payEditId) {
      const { error } = await supabase.from('invoice_payments')
        .update({ amount, method, paid_on: payDate || new Date().toISOString().slice(0, 10) })
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
      lineItems: raw.line_items ?? [],
      subtotalAmount: raw.subtotal_amount,
      taxRate: raw.tax_rate,
      taxAmount: raw.tax_amount,
      totalAmount: raw.total_amount,
      notes: raw.notes,
      language: raw.language ?? 'es',
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
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

  useEffect(() => {
    if (!business) return;
    void (async () => {
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
        void loadJobs();
        void loadPayments();
      }
      setLoading(false);
    })();
  }, [id, business, locale]);

  const updateStatus = async (status: 'sent' | 'paid' | 'draft' | 'total_loss') => {
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
  const ensureShareToken = async (): Promise<string> => {
    if (shareToken) return shareToken;
    const token = genToken();
    await supabase
      .from('invoices')
      .update({ share_token: token, template_config: invoiceConfigRaw ?? templateConfig })
      .eq('id', id);
    setShareToken(token);
    return token;
  };

  const exportPdf = async () => {
    if (!invoice) return;
    const vm = buildInvoiceViewModel(templateConfig, invoice, branding);
    const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(vm) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    }
  };

  const shareLink = async () => {
    const token = await ensureShareToken();
    const base = process.env.EXPO_PUBLIC_WEB_URL ?? '';
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
    const token = await ensureShareToken();
    const base = process.env.EXPO_PUBLIC_WEB_URL ?? '';
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
          const vm = buildInvoiceViewModel(templateConfig, invoice, branding);
          const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(vm) });
          attachments = [uri];
        }
        const result = await MailComposer.composeAsync({
          recipients: [email],
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
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <InvoiceDetailScreen
        loading={loading}
        invoice={invoice}
        branding={branding}
        templateConfig={templateConfig}
        updating={updating}
        onBack={goBack}
        onUpdateStatus={updateStatus}
        onPrint={invoice ? exportPdf : undefined}
        onShareLink={invoice ? shareLink : undefined}
        onEdit={invoice ? () => router.push(`/dashboard/facturas/nueva?edit=${id}` as never) : undefined}
        onDelete={invoice && canDelete ? confirmDelete : undefined}
        onAutoprice={invoice && invoice.status === 'draft' && priceItems.length > 0 ? runAutoprice : undefined}
        autopriceVerify={showInvVerify}
        onMoveJob={openMove}
        onRemoveJob={removeJob}
        onAddJob={openAdd}
        onRemoveManualItem={removeManual}
        onEditManualItem={editManual}
        onJobPress={(jobId) => setPreviewJobId(jobId)}
        jobBusy={jobBusy}
        onSendInvoice={sendInvoice}
        payments={payments}
        onRecordPayment={openRecordPayment}
        onEditPayment={openEditPayment}
        onDeletePayment={deletePayment}
        onUndoPaid={undoPaid}
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
      <RNModal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable onPress={() => setAddOpen(false)} className="flex-1 bg-black/40 justify-end">
          <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10" onPress={() => {}}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold text-ink">{jobsT.addTitle}</Text>
              <Pressable onPress={() => setAddOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>

            {/* Manual line item */}
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

            {/* Completed jobs */}
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{jobsT.jobsHeading}</Text>
            {addCandidates.length === 0 ? (
              <Text className="text-sm text-faint pb-2">{jobsT.addEmpty}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 280 }}>
                {addCandidates.map(j => {
                  const picked = addPicked.has(j.id);
                  return (
                    <Pressable
                      key={j.id}
                      onPress={() => setAddPicked(prev => { const n = new Set(prev); n.has(j.id) ? n.delete(j.id) : n.add(j.id); return n; })}
                      className={`flex-row items-center gap-3 px-2 py-3 rounded-xl ${picked ? 'bg-primary/10' : ''}`}
                    >
                      <View className={`w-5 h-5 rounded-md border items-center justify-center ${picked ? 'bg-primary border-primary' : 'border-border'}`}>
                        {picked ? <Text className="text-white text-[11px] font-bold">✓</Text> : null}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm text-ink" numberOfLines={1}>{j.title}</Text>
                        {j.scheduled_date ? (
                          <Text className="text-xs text-faint mt-0.5">{formatDateLong(j.scheduled_date, full.dashboard.dateLocale)}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <Pressable onPress={doAdd} disabled={jobBusy} className="mt-4 py-3.5 rounded-2xl bg-primary items-center active:opacity-90">
              <Text className="text-sm font-semibold text-white">{jobsT.addConfirm}</Text>
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

      {confirmSheet}
    </SafeAreaView>
  );
}
