'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import {
  InvoiceDetailScreen,
  type InvoiceDetail,
  type InvoicePaymentRow,
} from '@amixos/shared/screens/dashboard/InvoiceDetailScreen';
import type { InvoiceLang } from '@amixos/shared';
import { logAudit } from '@amixos/shared/lib/audit';
import { renderInvoiceEmail } from '@amixos/shared/lib/invoiceEmail';
import { can } from '@amixos/shared/lib/permissions';
import { resolveConfig, type InvoiceBranding } from '@amixos/shared/lib/invoiceTemplate';
import { removeJobFromInvoice, moveJobToInvoice, addJobsToInvoice, rebuildInvoiceLineItems, addManualLineItem, removeLineItemAt, updateLineItemAt } from '@amixos/shared/lib/invoicing';
import { formatDateLong, formatNumberGrouped } from '@amixos/shared/lib/format';

const PAY_METHODS = ['cash', 'check', 'card', 'transfer', 'zelle', 'cashapp', 'venmo', 'paypal', 'moneyOrder', 'other'] as const;
type PayMethodKey = (typeof PAY_METHODS)[number];

const genToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

// Escape user-controlled text before it goes into an innerHTML template, so a
// value like an invoice number can't inject markup. The surrounding template
// (translation string with static <strong>) stays trusted.
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

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

export default function FacturaDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?from=job&job=… or ?from=client&client=… → back returns to that job/client
  // instead of the invoice list.
  const fromParam = searchParams.get('from');
  const fromJobId = fromParam === 'job' ? searchParams.get('job') : null;
  const fromClientId = fromParam === 'client' ? searchParams.get('client') : null;
  const goBack = () => router.push(
    fromJobId ? `/dashboard/trabajos/${fromJobId}`
      : fromClientId ? `/dashboard/clientes/${fromClientId}`
      : '/dashboard/facturas',
  );
  const supabase = createSupabaseClient();
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const tInv = full.dashboard.invoices;
  const tc = full.common;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [invoiceConfigRaw, setInvoiceConfigRaw] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Payment ledger (invoice_payments): "Mark paid" opens a dialog recording
  // amount + method + date; partial amounts keep status 'sent' with a balance.
  const [payments, setPayments] = useState<InvoicePaymentRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethodKey, setPayMethodKey] = useState<PayMethodKey>('cash');
  const [payMethodOther, setPayMethodOther] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [delPayment, setDelPayment] = useState<InvoicePaymentRow | null>(null);
  // Set → the payment sheet edits this row instead of inserting a new one.
  const [payEditId, setPayEditId] = useState<string | null>(null);
  const [undoPaidOpen, setUndoPaidOpen] = useState(false);

  // ── Jobs attached to this invoice (Phase 2 management) ──────────────
  const tj = full.dashboard.jobs;
  const itemTypeLabels = {
    labor: tj.new.itemTypeLabor,
    material: tj.new.itemTypeMaterial,
    equipment: tj.new.itemTypeEquipment,
    other: tj.new.itemTypeOther,
  };
  const [attachedJobs, setAttachedJobs] = useState<{ id: string; title: string; status: string }[]>([]);
  const [invClientId, setInvClientId] = useState<string | null>(null);
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

  // Edit-a-manual-line state.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editRate, setEditRate] = useState('');

  const removeManual = async (index: number) => {
    if (!(await confirm({ message: tInv.jobsSection.removeItemConfirm, destructive: true }))) return;
    setJobBusy(true);
    await removeLineItemAt(supabase, { invoiceId: id, index });
    await reloadInvoice();
    setJobBusy(false);
  };

  const editManual = (index: number) => {
    const li = invoice?.lineItems[index];
    if (!li) return;
    setEditIndex(index);
    setEditDesc(li.description ?? '');
    setEditQty(String(li.qty ?? 1));
    setEditRate(li.rate != null ? String(li.rate) : '');
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
    setEditIndex(null);
    await reloadInvoice();
    setJobBusy(false);
  };

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, status')
      .eq('invoice_id', id)
      .order('created_at');
    setAttachedJobs((data ?? []) as { id: string; title: string; status: string }[]);
  }, [id, supabase]);

  // Re-fetch the invoice row (after a job add/remove/move changes totals).
  const reloadInvoice = useCallback(async () => {
    const { data } = await supabase.from('invoices')
      .select('*, clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code))')
      .eq('id', id).single();
    if (data) setInvoice(mapInvoice(data as unknown as RawInvoice, []));
    await loadJobs();
  }, [id, supabase, loadJobs]);

  const fetchInvoiceRow = async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, status, line_items, tax_rate, discount, invoice_number, client_id')
      .eq('id', id)
      .single();
    return data as { id: string; status: string; line_items: unknown; tax_rate: number; discount: number; invoice_number: string; client_id: string | null } | null;
  };

  const removeJob = async (jobId: string) => {
    const inv = await fetchInvoiceRow();
    if (!inv) return;
    const sentOrPaid = ['sent', 'paid', 'overdue'].includes(inv.status);
    if (!(await confirm({ message: sentOrPaid ? tj.detail.unInvoiceSentWarning : tj.detail.unInvoiceConfirm, destructive: true }))) return;
    setJobBusy(true);
    const { remaining } = await removeJobFromInvoice(supabase, {
      jobId,
      invoice: { id: inv.id, line_items: inv.line_items as never, tax_rate: inv.tax_rate, discount: inv.discount },
    });
    if (remaining === 0 && (await confirm({ message: tj.detail.unInvoiceDeleteEmpty.replace('{{number}}', inv.invoice_number), destructive: true }))) {
      await supabase.from('invoices').delete().eq('id', inv.id);
      setJobBusy(false);
      router.push('/dashboard/facturas');
      return;
    }
    await reloadInvoice();
    setJobBusy(false);
  };

  const openMove = async (jobId: string) => {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('business_id', business!.id)
      .eq('status', 'draft')
      .eq('client_id', invClientId)
      .neq('id', id);
    setMoveTargets((data ?? []) as { id: string; invoice_number: string }[]);
    setMoveJobId(jobId);
  };

  const doMove = async (targetId: string) => {
    if (!moveJobId) return;
    setJobBusy(true);
    const [from, to] = await Promise.all([
      fetchInvoiceRow(),
      supabase.from('invoices').select('id, line_items, tax_rate, discount').eq('id', targetId).single().then(r => r.data),
    ]);
    if (from && to) {
      await moveJobToInvoice(supabase, {
        jobId: moveJobId,
        from: { id: from.id, line_items: from.line_items as never, tax_rate: from.tax_rate, discount: from.discount },
        to: { id: (to as { id: string }).id, line_items: (to as { line_items: unknown }).line_items as never, tax_rate: (to as { tax_rate: number }).tax_rate, discount: (to as { discount: number }).discount },
      });
    }
    setMoveJobId(null);
    await reloadInvoice();
    setJobBusy(false);
  };

  const openAdd = async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, scheduled_date')
      .eq('business_id', business!.id)
      .eq('client_id', invClientId)
      .eq('status', 'completed')
      .is('invoice_id', null);
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
        });
      }
    }
    setManualDesc(''); setManualQty('1'); setManualRate('');
    setAddOpen(false);
    await reloadInvoice();
    setJobBusy(false);
  };

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
      // Sync a draft invoice's line items with its jobs' current items first,
      // so amounts reflect items added after the invoice was created.
      await rebuildInvoiceLineItems(supabase, { invoiceId: id, itemTypeLabels, hideItemTypes: business?.job_item_types_enabled === false });
      const [{ data }, { data: tpls }] = await Promise.all([
        supabase.from('invoices')
          .select('*, clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code))')
          .eq('id', id)
          .single(),
        supabase.from('invoice_field_templates')
          .select('field_key, field_label, field_type')
          .eq('business_id', business.id)
          .order('sort_order'),
      ]);
      const templateList = (tpls ?? []) as InvoiceFieldTemplate[];
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
  }, [id, business]);

  const updateStatus = async (status: 'sent' | 'paid' | 'draft') => {
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
    setInvoice(prev => prev ? { ...prev, status } : prev);
    setUpdating(false);
  };

  const paymentMethodLabel = () =>
    payMethodKey === 'other' ? payMethodOther.trim() : tInv.payments.methods[payMethodKey];

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
      setInvoice(prev => prev ? { ...prev, status: 'paid' } : prev);
    } else if (!fullyPaid && invoice.status === 'paid') {
      await supabase.from('invoices')
        .update({ status: 'sent', paid_at: null, payment_method: methods.join(', ') || null })
        .eq('id', id);
      setInvoice(prev => prev ? { ...prev, status: 'sent' } : prev);
    } else {
      await supabase.from('invoices').update({ payment_method: methods.join(', ') || null }).eq('id', id);
    }
  };

  const submitPayment = async () => {
    if (!business || !invoice) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;
    setPayBusy(true);
    const method = paymentMethodLabel() || null;
    if (payEditId) {
      const { error } = await supabase.from('invoice_payments')
        .update({ amount, method, paid_on: payDate || new Date().toISOString().slice(0, 10) })
        .eq('id', payEditId);
      if (error) { setPayBusy(false); return; }
      await syncInvoiceToPayments(payments.map(p => p.id === payEditId ? { ...p, amount, method, paidOn: payDate } : p));
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
      setInvoice(prev => prev ? { ...prev, status: 'paid' } : prev);
    }
    void logAudit(supabase, business.id, 'invoice.payment', 'invoice', id, {
      invoice_number: invoice.invoiceNumber, amount, method, paid_in_full: fullyPaid,
    });
    await loadPayments();
    setPayOpen(false);
    setPayBusy(false);
  };

  const doDeletePayment = async () => {
    if (!business || !invoice || !delPayment) return;
    setPayBusy(true);
    await supabase.from('invoice_payments').delete().eq('id', delPayment.id);
    const rest = payments.filter(p => p.id !== delPayment.id);
    const paid = rest.reduce((sum, p) => sum + p.amount, 0);
    const methods = Array.from(new Set(rest.map(p => p.method).filter(Boolean))) as string[];
    if (invoice.status === 'paid' && paid < invoice.totalAmount - 0.005) {
      // No longer covered — drop back to 'sent' so the balance is visible.
      await supabase.from('invoices')
        .update({ status: 'sent', paid_at: null, payment_method: methods.join(', ') || null })
        .eq('id', id);
      setInvoice(prev => prev ? { ...prev, status: 'sent' } : prev);
    } else {
      await supabase.from('invoices').update({ payment_method: methods.join(', ') || null }).eq('id', id);
    }
    void logAudit(supabase, business.id, 'invoice.payment_deleted', 'invoice', id, {
      invoice_number: invoice.invoiceNumber, amount: delPayment.amount, method: delPayment.method,
    });
    await loadPayments();
    setDelPayment(null);
    setPayBusy(false);
  };

  // Paid → sent: undoing "paid" means the recorded payments were a mistake,
  // so they're removed too (a single wrong partial has its own row delete).
  const undoPaid = async () => {
    if (!business || !invoice) return;
    setPayBusy(true);
    await supabase.from('invoice_payments').delete().eq('invoice_id', id);
    await supabase.from('invoices')
      .update({ status: 'sent', paid_at: null, payment_method: null })
      .eq('id', id);
    setInvoice(prev => prev ? { ...prev, status: 'sent' } : prev);
    void logAudit(supabase, business.id, 'invoice.unpaid', 'invoice', id, {
      invoice_number: invoice.invoiceNumber,
    });
    setPayments([]);
    setUndoPaidOpen(false);
    setPayBusy(false);
  };

  const deleteInvoice = async () => {
    if (!business || !invoice) return;
    setDeleting(true);
    setDeleteError('');
    void logAudit(supabase, business.id, 'invoice.deleted', 'invoice', id, {
      invoice_number: invoice.invoiceNumber,
      total_amount: invoice.totalAmount,
      status: invoice.status,
    });
    // Detach related jobs first (so the invoice can be deleted) AND revert them
    // to "completed" — otherwise they'd be stranded in the "invoiced" step with
    // no invoice. They reappear in the active list and can be re-invoiced.
    await supabase.from('jobs').update({ status: 'completed', invoice_id: null, invoiced_at: null }).eq('invoice_id', id);
    await supabase.from('invoice_clients').delete().eq('invoice_id', id);
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      setDeleteError(tInv.errorDelete);
      setDeleting(false);
      return;
    }
    router.push('/dashboard/facturas');
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
  // template config onto the invoice so restyling the default later never
  // changes an already-shared invoice. Returns the token.
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

  const onPrint = async () => {
    const token = await ensureShareToken();
    window.open(`/factura/${token}?print=1`, '_blank');
  };
  const onShareLink = async () => {
    const token = await ensureShareToken();
    const url = `${window.location.origin}/factura/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      void alertMessage({ message: tInv.linkCopied });
    } catch {
      window.prompt(tInv.linkCopied, url);
    }
  };

  // Email the invoice: open the mail client pre-filled with the client's
  // address + public link, then mark sent.
  const sendInvoice = async () => {
    if (!invoice) return;
    const email = invoice.clients[0]?.email ?? '';
    if (!email) { void alertMessage({ message: tInv.sendNoEmail, destructive: true }); return; }
    const token = await ensureShareToken();
    const url = `${window.location.origin}/factura/${token}`;
    // Business's custom templates (Ajustes → Facturas → Email) win; blank
    // falls back to the localized default. {{tokens}} substituted here.
    const c = invoice.clients[0];
    const { subject, body } = renderInvoiceEmail({
      subjectTemplate: business?.invoice_email_subject,
      bodyTemplate: business?.invoice_email_body,
      defaultSubject: tInv.emailSubject,
      defaultBody: tInv.emailBody,
      vars: {
        number: invoice.invoiceNumber,
        link: url,
        client: c ? `${c.firstName} ${c.lastName}`.trim() : '',
        firstName: c?.firstName ?? '',
        lastName: c?.lastName ?? '',
        company: c?.company ?? '',
        business: business?.name ?? '',
        total: `$${invoice.totalAmount.toFixed(2)}`,
        dueDate: invoice.dueDate ?? '',
      },
    });
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await updateStatus('sent');
  };

  const canDelete = can.deleteInvoice(currentRole);

  return (
    <>
      <InvoiceDetailScreen
        loading={loading}
        invoice={invoice}
        branding={branding}
        templateConfig={templateConfig}
        updating={updating}
        onBack={goBack}
        onUpdateStatus={updateStatus}
        onPrint={onPrint}
        onShareLink={onShareLink}
        onEdit={invoice ? () => router.push(`/dashboard/facturas/nueva?edit=${id}`) : undefined}
        onDelete={invoice && canDelete ? () => setDeleteOpen(true) : undefined}
        onMoveJob={openMove}
        onRemoveJob={removeJob}
        onAddJob={openAdd}
        onRemoveManualItem={removeManual}
        onEditManualItem={editManual}
        onJobPress={(jobId) => router.push(`/dashboard/trabajos/${jobId}?from=invoice&invoice=${id}`)}
        jobBusy={jobBusy}
        onSendInvoice={sendInvoice}
        payments={payments}
        onRecordPayment={openRecordPayment}
        onEditPayment={openEditPayment}
        onDeletePayment={setDelPayment}
        onUndoPaid={() => setUndoPaidOpen(true)}
        onClientPress={(clientId) => router.push(`/dashboard/clientes/${clientId}?from=invoice&invoice=${id}`)}
        jobTitles={Object.fromEntries(attachedJobs.map(j => [j.id, j.title]))}
      />

      {/* Move-to-another-invoice picker */}
      <Modal open={moveJobId !== null} onClose={() => setMoveJobId(null)} title={tInv.jobsSection.moveTitle} size="sm">
        {moveTargets.length === 0 ? (
          <p className="text-sm text-gray-400">{tInv.jobsSection.moveEmpty}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {moveTargets.map(inv => (
              <button key={inv.id} onClick={() => doMove(inv.id)} disabled={jobBusy} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 text-sm text-gray-800 disabled:opacity-40">
                <span className="font-mono text-gray-500">{inv.invoice_number}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Add to invoice — manual item + completed jobs */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={tInv.jobsSection.addTitle} size="sm">
        <div className="flex flex-col gap-5">
          {/* Manual line item */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{tInv.jobsSection.manualHeading}</p>
            <div className="flex flex-col gap-2">
              <input
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                placeholder={tInv.jobsSection.manualDescPlaceholder}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
              <div className="flex gap-2">
                <input
                  value={manualQty}
                  inputMode="decimal"
                  onChange={e => setManualQty(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={tj.new.colQty}
                  className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                />
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    value={manualRate}
                    inputMode="decimal"
                    onChange={e => setManualRate(cleanAmount(e.target.value))}
                    placeholder={tj.detail.colUnitPriceShort}
                    className="w-full rounded-xl border border-gray-200 bg-white pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Completed jobs */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{tInv.jobsSection.jobsHeading}</p>
            {addCandidates.length === 0 ? (
              <p className="text-sm text-gray-400">{tInv.jobsSection.addEmpty}</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {addCandidates.map(j => {
                  const picked = addPicked.has(j.id);
                  return (
                    <button
                      key={j.id}
                      onClick={() => setAddPicked(prev => { const n = new Set(prev); n.has(j.id) ? n.delete(j.id) : n.add(j.id); return n; })}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left ${picked ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${picked ? 'bg-primary border-primary text-white' : 'border-gray-300'}`}>
                        {picked ? '✓' : ''}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-gray-800">{j.title}</span>
                        {j.scheduled_date ? (
                          <span className="block text-xs text-gray-400">{formatDateLong(j.scheduled_date, full.dashboard.dateLocale)}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button onClick={doAdd} loading={jobBusy} fullWidth>{tInv.jobsSection.addConfirm}</Button>
        </div>
      </Modal>

      {/* Edit a manual line item */}
      <Modal open={editIndex !== null} onClose={() => setEditIndex(null)} title={tInv.jobsSection.editItemTitle} size="sm">
        <div className="flex flex-col gap-3">
          <input
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder={tInv.jobsSection.manualDescPlaceholder}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              value={editQty}
              inputMode="decimal"
              onChange={e => setEditQty(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={tj.new.colQty}
              className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            />
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                value={editRate}
                inputMode="decimal"
                onChange={e => setEditRate(cleanAmount(e.target.value))}
                placeholder={tj.detail.colUnitPriceShort}
                className="w-full rounded-xl border border-gray-200 bg-white pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
            </div>
          </div>
          <Button onClick={doEditSave} loading={jobBusy} disabled={!editDesc.trim()} fullWidth>{tc.buttons.save}</Button>
        </div>
      </Modal>

      {/* Record payment — amount defaults to the remaining balance */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={payEditId ? tInv.payments.editTitle : tInv.payments.recordTitle} size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{tInv.payments.amountLabel}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                value={payAmount}
                inputMode="decimal"
                onChange={e => setPayAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full rounded-xl border border-gray-200 bg-white pl-6 pr-32 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => {
                  if (!invoice) return;
                  const remaining = Math.max(0, invoice.totalAmount - payments.filter(p => p.id !== payEditId).reduce((sum, p) => sum + p.amount, 0));
                  setPayAmount(String(Math.round(remaining * 100) / 100));
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 text-xs font-semibold transition"
              >
                {tInv.payments.fullAmountBtn}
              </button>
            </div>
            {invoice && parseFloat(payAmount) >= (invoice.totalAmount - payments.filter(p => p.id !== payEditId).reduce((sum, p) => sum + p.amount, 0)) - 0.005 && parseFloat(payAmount) > 0 ? (
              <p className="text-xs text-emerald-600">{tInv.payments.paidInFullHint}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{tInv.payments.methodLabel}</label>
            <select
              value={payMethodKey}
              onChange={e => setPayMethodKey(e.target.value as PayMethodKey)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            >
              {PAY_METHODS.map(k => (
                <option key={k} value={k}>{tInv.payments.methods[k]}</option>
              ))}
            </select>
            {payMethodKey === 'other' ? (
              <input
                value={payMethodOther}
                onChange={e => setPayMethodOther(e.target.value)}
                placeholder={tInv.payments.otherPlaceholder}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{tInv.payments.dateLabel}</label>
            <input
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            />
          </div>
          <Button onClick={submitPayment} loading={payBusy} disabled={!parseFloat(payAmount)} fullWidth>
            {payEditId ? tc.buttons.save : tInv.payments.recordBtn}
          </Button>
        </div>
      </Modal>

      {/* Delete a recorded payment */}
      <Modal open={delPayment !== null} onClose={() => setDelPayment(null)} title={tInv.payments.title} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">{tInv.payments.deleteConfirm}</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDelPayment(null)} fullWidth>
              {tc.buttons.cancel}
            </Button>
            <button
              onClick={doDeletePayment}
              disabled={payBusy}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {tc.buttons.delete}
            </button>
          </div>
        </div>
      </Modal>

      {/* Undo paid — reverts to sent and clears recorded payments */}
      <Modal open={undoPaidOpen} onClose={() => setUndoPaidOpen(false)} title={tInv.payments.undoPaid} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">{tInv.payments.undoPaidConfirm}</p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setUndoPaidOpen(false)} fullWidth>
              {tc.buttons.cancel}
            </Button>
            <button
              onClick={undoPaid}
              disabled={payBusy}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {tInv.payments.undoPaid}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={tInv.deleteTitle} size="sm">
        <div className="flex flex-col gap-4">
          <p
            className="text-sm text-gray-600"
            dangerouslySetInnerHTML={{
              __html: tInv.deleteConfirm.replace('{{number}}', escapeHtml(invoice?.invoiceNumber ?? '')),
            }}
          />
          {deleteError ? <p className="text-sm text-red-500">{deleteError}</p> : null}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} fullWidth>
              {tc.buttons.cancel}
            </Button>
            <button
              onClick={deleteInvoice}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleting ? tInv.deleting : tc.buttons.delete}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
