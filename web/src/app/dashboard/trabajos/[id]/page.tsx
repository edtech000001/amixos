'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Calendar, Users, DollarSign,
  FileText, CheckCircle2, Clock, AlertTriangle,
  XCircle, Send, ArrowRight, Trash2, Pencil, Copy,
  Share2, Download, RotateCcw, Building2, Sparkles,
  MessageSquare, Navigation, Archive } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { delegateJob } from '@amixos/shared/lib/delegation';
import { jobShortCode } from '@amixos/shared/lib/jobRef';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import { logAudit } from '@amixos/shared/lib/audit';
import { parseJobLayout, fieldsInSection, type JobLayoutSection } from '@amixos/shared/lib/jobSections';
import { invoiceDefaultLanguage, nextInvoiceNumber } from '@amixos/shared/lib/invoiceTemplate';
import { removeJobFromInvoice, placeholderQtyFor } from '@amixos/shared/lib/invoicing';
import { can } from '@amixos/shared/lib/permissions';
import { rowToPriceSheetItem, autopriceLine, suggestPriceItem, matchingAddons, extractQuantity, type PriceSheetItem, type PriceSheetRow } from '@amixos/shared/lib/priceSheet';
import { formatDateLong, formatDateTimeLong, formatTime12h, formatStamp, formatNumberGrouped } from '@amixos/shared/lib/format';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { JobPhotosSection } from '@/components/jobs/JobPhotosSection';

interface Job {
  id: string; business_id: string;
  client_id: string | null; invoice_id: string | null;
  title: string; description: string | null; status: string; priority: string;
  job_address: string | null; job_city: string | null; job_state: string | null;
  job_map_link: string | null; job_lat: number | null; job_lng: number | null;
  scheduled_date: string | null; end_date: string | null; estimated_hours: number | null;
  time_start: string | null; time_end: string | null;
  completed_date: string | null; total_amount: number; internal_notes: string | null;
  worker_notes: string | null;
  archived_at: string | null;
  total_hours: number | null; driver_hours: number | null; driver_names: string[] | null;
  estimate_number: string | null; external_ref: string | null; notes: string | null;
  issue_date: string | null; expiry_date: string | null;
  subtotal_amount: number; tax_rate: number; tax_amount: number; discount: number;
  sent_at: string | null; accepted_at: string | null; declined_at: string | null;
  scheduled_at: string | null; in_progress_at: string | null; completed_at: string | null; invoiced_at: string | null;
  share_token: string | null; created_by: string | null; cancelled_at: string | null;
  delegated_to_business_id: string | null; delegated_from_business_id: string | null; delegated_at: string | null;
  created_at: string; updated_at: string;
  custom_fields: Record<string, string> | null;
  clients: { id: string; first_name: string; last_name: string; company: string | null; phone_cell: string | null } | null;
}
interface JobFieldTemplate {
  id: string; field_key: string; field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}
interface Assignment {
  id: string; worker_name: string | null;
  is_lead: boolean | null;
  hours_worked: number | null;
  custom_fields: Record<string, unknown> | null;
  employees: { id: string; first_name: string; last_name: string; user_id: string | null } | null;
}
interface JobItem {
  id: string; item_type: string; description: string; quantity: number; unit_price: number; total: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function TrabajoDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const supabase = createSupabaseClient();
  const { business, user, businesses, setActiveBusiness, currentRole } = useApp();
  // Labor/Material/Equipment/Other categories on job line items — hidden when
  // the business turns them off (billed flat / by qty × rate instead).
  const showItemTypes = business?.job_item_types_enabled !== false;
  const { t: full, locale } = useLang();
  const t = full.dashboard.jobs;
  const td = t.detail;
  const tc = full.common;
  const dateLoc = full.dashboard.dateLocale;

  const PROPOSAL_PIPELINE = [
    { key: 'proposal',    label: t.statuses.proposal,    icon: Clock,         color: 'text-gray-600',    bg: 'bg-gray-100' },
    { key: 'sent',        label: t.statuses.sent,        icon: Send,          color: 'text-blue-600',    bg: 'bg-blue-100' },
    { key: 'accepted',    label: t.statuses.accepted,    icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { key: 'scheduled',   label: t.statuses.scheduled,   icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-100' },
    { key: 'in_progress', label: t.statuses.in_progress, icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-100' },
    { key: 'completed',   label: t.statuses.completed,   icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { key: 'invoiced',    label: t.statuses.invoiced,    icon: FileText,      color: 'text-purple-600',  bg: 'bg-purple-100' },
  ];

  const WORK_PIPELINE = [
    { key: 'scheduled',   label: t.statuses.scheduled,   icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-100' },
    { key: 'in_progress', label: t.statuses.in_progress, icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-100' },
    { key: 'completed',   label: t.statuses.completed,   icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { key: 'invoiced',    label: t.statuses.invoiced,    icon: FileText,      color: 'text-purple-600',  bg: 'bg-purple-100' },
  ];

  const ITEM_TYPE_LABELS: Record<string, string> = {
    labor: t.new.itemTypeLabor,
    material: t.new.itemTypeMaterial,
    equipment: t.new.itemTypeEquipment,
    other: t.new.itemTypeOther,
  };

  const [job, setJob] = useState<Job | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [items, setItems] = useState<JobItem[]>([]);
  const [priceItems, setPriceItems] = useState<PriceSheetItem[]>([]);
  const [clientTierId, setClientTierId] = useState<string | null>(null);
  const [showPriceVerify, setShowPriceVerify] = useState(false);
  const [templates, setTemplates] = useState<JobFieldTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delegateModal, setDelegateModal] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const tw = full.dashboard.workspaces;

  // Custom fields follow the saved layout (Ajustes → Trabajos): fields
  // assigned to real sections render INSIDE the Details card in layout order;
  // only 'additional' fields get their own card — mirrors the job form.
  const customLayout = useMemo(
    () => parseJobLayout(business?.job_field_layout, templates.map(tpl => `custom:${tpl.id}`)),
    [business?.job_field_layout, templates],
  );
  const customsFor = (secs: JobLayoutSection[]) =>
    secs
      .flatMap(sec => fieldsInSection(customLayout, sec))
      .map(k => templates.find(tpl => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is JobFieldTemplate => !!tpl);
  const detailCustoms = customsFor(['general', 'location', 'schedule', 'workers', 'notes']);
  const additionalCustoms = customsFor(['additional']);
  const customValue = (tpl: JobFieldTemplate): string | null => {
    const raw = job?.custom_fields?.[tpl.field_key];
    if (raw === undefined || raw === null || raw === '') return null;
    return tpl.field_type === 'boolean' ? (raw === 'true' ? (dateLoc === 'es' ? 'Sí' : 'Yes') : 'No')
      : tpl.field_type === 'number' ? formatNumberGrouped(raw)
      : tpl.field_type === 'date' ? formatDateLong(raw, dateLoc)
      : raw;
  };
  // Stacked label-over-value, matching the other Details rows.
  const renderCustomRow = (tpl: JobFieldTemplate) => {
    const value = customValue(tpl);
    if (value === null) return null;
    return (
      <div key={tpl.id}>
        <p className="text-xs text-gray-400 mb-1">{tpl.field_label}</p>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{value}</p>
      </div>
    );
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'invoice') {
      setTimeout(() => setInvoiceModal(true), 500);
    }
  }, []);

  const load = async () => {
    if (!business) return;
    void supabase.from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, tier_rates, match_terms, is_addon, sort_order, active')
      .eq('business_id', business.id).eq('active', true)
      .then(({ data }: { data: PriceSheetRow[] | null }) => setPriceItems((data ?? []).map(rowToPriceSheetItem)));
    const [{ data: j }, { data: a }, { data: it }, { data: tpl }] = await Promise.all([
      supabase.from('jobs').select('*, clients(id, first_name, last_name, company, phone_cell)').eq('id', id).single(),
      supabase.from('job_assignments').select('*, employees(id, first_name, last_name, user_id)').eq('job_id', id),
      supabase.from('job_items').select('*').eq('job_id', id).order('created_at'),
      supabase.from('job_field_templates').select('id, field_key, field_label, field_label_es, field_label_en, field_type').eq('business_id', business.id).order('sort_order'),
    ]);
    setTemplates(localizeTemplates((tpl ?? []) as JobFieldTemplate[], locale));
    if (j) {
      setJob(j as Job);
      if (j.client_id) {
        void supabase.from('clients').select('price_tier_id').eq('id', j.client_id).single()
          .then(({ data }: { data: { price_tier_id: string | null } | null }) => setClientTierId(data?.price_tier_id ?? null));
      } else setClientTierId(null);
      // Tax: the job's own rate (from a proposal) wins; otherwise the
      // business default (Ajustes → Facturas). Editable in the modal.
      if (j.tax_rate > 0) setTaxRate(j.tax_rate);
      else if ((business?.invoice_tax_rate ?? 0) > 0) setTaxRate(business!.invoice_tax_rate);
    } else {
      // Deleted / not found — clear so we show the not-found state instead of a
      // previously-loaded job.
      setJob(null);
    }
    setAssignments(a ?? []);
    setItems(it ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, business, locale]);

  const updateStatus = async (newStatus: string) => {
    if (!job || !business) return;
    const prevStatus = job.status;
    setUpdatingStatus(true);
    const now = new Date().toISOString();
    const update: any = { status: newStatus };
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
    // Surface failures instead of silently reverting — e.g. a missing column
    // (un-run migration) makes Postgres reject the whole UPDATE, which used to
    // look like "status didn't save" once the page reloaded.
    const { error } = await supabase.from('jobs').update(update).eq('id', id);
    if (error) {
      setUpdatingStatus(false);
      void alertMessage({ message: td.statusUpdateError, destructive: true });
      return;
    }
    setJob(prev => prev ? { ...prev, ...update } : prev);
    void logAudit(supabase, business.id, 'job.status_changed', 'job', id, {
      from: prevStatus, to: newStatus, job_title: job.title,
    });
    setUpdatingStatus(false);
  };

  // ── Inline job-items editor (labor / material / equipment / other) ──
  // The items card edits in place — rows sync from the loaded items; a Save
  // bar appears only when there are unsaved changes.
  type EditRow = { id: string; item_type: string; description: string; quantity: string; unit_price: string; price_item_id: string | null; original_quantity: number | null };
  const ITEM_TYPES = ['labor', 'material', 'equipment', 'other'];
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [itemsDirty, setItemsDirty] = useState(false);
  const newRow = (): EditRow => ({ id: `${Date.now()}-${Math.random()}`, item_type: 'labor', description: '', quantity: '1', unit_price: '0', price_item_id: null, original_quantity: null });
  // Re-seed the editable rows whenever the saved items change (initial load +
  // after a save), clearing the dirty flag.
  useEffect(() => {
    setEditRows(items.map(i => ({ id: i.id, item_type: i.item_type, description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), price_item_id: (i as { price_item_id?: string | null }).price_item_id ?? null, original_quantity: (i as { original_quantity?: number | null }).original_quantity ?? null })));
    setItemsDirty(false);
  }, [items]);
  const updateRow = (rid: string, field: keyof EditRow, value: string) => {
    setEditRows(prev => prev.map(r => (r.id === rid ? { ...r, [field]: value } : r)));
    setItemsDirty(true);
  };
  const addRow = () => { setEditRows(prev => [...prev, newRow()]); setItemsDirty(true); };
  const removeRow = (rid: string) => { setEditRows(prev => prev.filter(r => r.id !== rid)); setItemsDirty(true); };
  const discardItems = () => {
    setEditRows(items.map(i => ({ id: i.id, item_type: i.item_type, description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), price_item_id: (i as { price_item_id?: string | null }).price_item_id ?? null, original_quantity: (i as { original_quantity?: number | null }).original_quantity ?? null })));
    setItemsDirty(false);
  };
  const saveItems = async () => {
    if (!job || !business) return;
    setSavingItems(true);
    const valid = editRows
      .map(r => ({ item_type: r.item_type, description: r.description.trim(), quantity: parseFloat(r.quantity) || 0, unit_price: parseFloat(r.unit_price) || 0, price_item_id: r.price_item_id, original_quantity: r.original_quantity }))
      // Keep a row if it has a description OR a cost — a bare amount + cost
      // (no description) is valid; the invoice falls back to the job title.
      .filter(r => r.description !== '' || r.unit_price > 0);
    await supabase.from('job_items').delete().eq('job_id', id);
    if (valid.length) await supabase.from('job_items').insert(valid.map(v => ({ job_id: id, ...v })));
    const subtotal = valid.reduce((s, v) => s + v.quantity * v.unit_price, 0);
    const tax = subtotal * ((job.tax_rate ?? 0) / 100);
    const total = subtotal + tax - (job.discount ?? 0);
    await supabase.from('jobs').update({ subtotal_amount: subtotal, tax_amount: tax, total_amount: total }).eq('id', id);
    const { data: it } = await supabase.from('job_items').select('*').eq('job_id', id).order('created_at');
    setItems((it ?? []) as JobItem[]); // triggers the re-seed effect (clears dirty)
    setJob(prev => (prev ? { ...prev, subtotal_amount: subtotal, tax_amount: tax, total_amount: total } : prev));
    setSavingItems(false);
  };
  const canEditItems = can.editJobMetadata(currentRole) && !['invoiced', 'cancelled', 'declined'].includes(job?.status ?? '');
  const editSubtotal = editRows.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0), 0);

  // Autoprice — best-effort: for each row, match a price item from its text
  // (+ job context) and apply the state/tier-aware rate. Rows with no match
  // are left untouched. NOT reliable → banner tells the user to verify.
  const jobContext = job ? `${job.title ?? ''} ${job.description ?? ''} ${job.worker_notes ?? ''} ${Object.values((job.custom_fields ?? {}) as Record<string, unknown>).map(String).join(' ')}` : '';
  const autopriceRows = () => {
    if (!priceItems.length) return;
    let matched = 0;
    setEditRows(prev => prev.map(r => {
      if (!r.description.trim()) return r;
      // Don't override a line that already has a price.
      if ((parseFloat(r.unit_price) || 0) > 0) return r;
      const matchText = `${r.description} ${jobContext}`;
      const hit = suggestPriceItem(matchText, priceItems);
      if (!hit) return r;
      const addons = matchingAddons(matchText, priceItems);
      const enteredQty = parseFloat(r.quantity);
      const measured = enteredQty > 1 ? enteredQty : (extractQuantity(r.description) ?? (enteredQty || 1));
      const priced = autopriceLine(hit.item, measured, { state: job?.job_state, tierId: clientTierId }, addons);
      matched++;
      return { ...r, price_item_id: hit.item.id, quantity: String(priced.quantity), unit_price: String(priced.unitPrice), original_quantity: priced.originalQuantity };
    }));
    if (matched) { setItemsDirty(true); setShowPriceVerify(true); }
  };

  const [unInvoicing, setUnInvoicing] = useState(false);
  // Undo an accidental "facturado": detach the job from its invoice, revert to
  // completed, strip its line items, and offer to delete a now-empty invoice.
  const unInvoice = async () => {
    if (!job?.invoice_id || !business) return;
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, status, line_items, tax_rate, discount, invoice_number')
      .eq('id', job.invoice_id)
      .single();
    if (!inv) return;
    const sentOrPaid = ['sent', 'paid', 'overdue'].includes(inv.status);
    if (!(await confirm({ message: sentOrPaid ? td.unInvoiceSentWarning : td.unInvoiceConfirm, destructive: true }))) return;
    setUnInvoicing(true);
    const { remaining } = await removeJobFromInvoice(supabase, {
      jobId: job.id,
      invoice: { id: inv.id, line_items: inv.line_items, tax_rate: inv.tax_rate, discount: inv.discount },
    });
    if (remaining === 0 && (await confirm({ message: td.unInvoiceDeleteEmpty.replace('{{number}}', inv.invoice_number), destructive: true }))) {
      await supabase.from('invoices').delete().eq('id', inv.id);
    }
    void logAudit(supabase, business.id, 'job.status_changed', 'job', id, {
      from: 'invoiced', to: 'completed', job_title: job.title,
    });
    setJob(prev => (prev ? { ...prev, status: 'completed', invoice_id: null } : prev));
    setUnInvoicing(false);
  };

  const generateInvoice = async () => {
    if (!job || !business) return;
    setInvoicing(true);

    const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
    // Use stored financial fields if available (from proposal), otherwise compute from items
    const useStoredFinancials = job.estimate_number && job.subtotal_amount > 0;
    const invoiceSubtotal = useStoredFinancials ? job.subtotal_amount : itemSubtotal;
    const invoiceTaxRate = useStoredFinancials ? job.tax_rate : taxRate;
    const invoiceTaxAmt = useStoredFinancials ? job.tax_amount : invoiceSubtotal * (taxRate / 100);
    const invoiceDiscount = useStoredFinancials ? job.discount : 0;
    const invoiceTotal = invoiceSubtotal + invoiceTaxAmt - invoiceDiscount;

    const invoiceLang = invoiceDefaultLanguage(business.invoice_template);
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('business_id', business.id);
    const invNum = nextInvoiceNumber(invoiceLang, business.invoice_start_number, count ?? 0);

    const lineItems = items.map(i => {
      const desc = i.description.trim();
      return {
        // qty/rate is the canonical invoice line-item shape (document + PDF).
        description: desc
          ? (business?.job_item_types_enabled === false ? desc : `${ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}: ${desc}`)
          : job.title,
        qty: i.quantity,
        rate: i.unit_price,
        job_id: id, // tag so the job can later be moved/removed from this invoice
      };
    });
    // No items — or (with M&L off) only bare $0 items — bill as ONE placeholder
    // line (job title) at the mapped quantity custom field (invoice_qty_field).
    const allBare = items.length > 0 && items.every(i => !i.description.trim() && !(i.unit_price > 0));
    if (lineItems.length === 0 || allBare) {
      lineItems.length = 0;
      lineItems.push({
        description: job.title,
        qty: placeholderQtyFor({ custom_fields: job.custom_fields }, business.invoice_qty_field) ?? 1,
        rate: 0,
        job_id: id,
      });
    }

    const { data: invoice, error } = await supabase.from('invoices').insert({
      business_id: business.id,
      client_id: job.client_id,
      invoice_number: invNum,
      status: 'draft',
      language: invoiceLang,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      line_items: lineItems,
      subtotal_amount: invoiceSubtotal,
      tax_rate: invoiceTaxRate,
      tax_amount: invoiceTaxAmt,
      discount: invoiceDiscount,
      total_amount: invoiceTotal,
      notes: job.estimate_number ? `${t.statuses.proposal}: ${job.estimate_number} — ${job.title}` : `${full.dashboard.sidebar.trabajos}: ${job.title}`,
    }).select().single();

    if (!error && invoice) {
      await supabase.from('jobs').update({ status: 'invoiced', invoice_id: invoice.id, invoiced_at: new Date().toISOString() }).eq('id', id);
      void logAudit(supabase, business.id, 'invoice.created', 'invoice', invoice.id, {
        invoice_number: invNum,
        total_amount: invoiceTotal,
        from_job_id: id,
      });
      setInvoicing(false);
      window.location.href = `/dashboard/facturas/${invoice.id}`;
    } else {
      setInvoicing(false);
    }
  };

  const runDelegate = async (targetBusinessId: string) => {
    if (!job) return;
    setDelegating(true);
    const result = await delegateJob(supabase, job.id, targetBusinessId);
    setDelegating(false);
    setDelegateModal(false);
    if (!result.ok) {
      void alertMessage({ message: tw.delegateError, destructive: true });
      return;
    }
    const targetBiz = businesses.find(b => b.id === targetBusinessId);
    const switchAndGo = await confirm({
      message: tw.delegateSuccess.replace('{{name}}', targetBiz?.name ?? '') +
        '\n\n' + tw.switchToTarget.replace('{{name}}', targetBiz?.name ?? '') + '?',
    });
    if (switchAndGo && targetBiz) {
      setActiveBusiness(targetBusinessId);
      window.location.href = `/dashboard/trabajos/${result.newJobId}`;
    } else {
      // Stay on the source-side view; reload to pick up the new delegated_to_business_id badge
      await load();
    }
  };

  const deleteJob = async () => {
    if (!job || !business) return;
    setDeleting(true);
    // Audit first — once the row is gone we can still reference it by id.
    void logAudit(supabase, business.id, 'job.deleted', 'job', id, {
      job_title: job.title, estimate_number: job.estimate_number,
    });
    // Delete related records first, then the job
    await supabase.from('job_items').delete().eq('job_id', id);
    await supabase.from('job_assignments').delete().eq('job_id', id);
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (!error) {
      window.location.href = '/dashboard/trabajos';
    }
    setDeleting(false);
  };

  const reinstateJob = async () => {
    setUpdatingStatus(true);
    const newStatus = job?.estimate_number ? 'proposal' : 'scheduled';
    await supabase.from('jobs').update({ status: newStatus, cancelled_at: null }).eq('id', id);
    setJob(prev => prev ? { ...prev, status: newStatus, cancelled_at: null } : prev);
    setUpdatingStatus(false);
  };

  const [sharecopied, setShareCopied] = useState(false);
  const shareProposal = async () => {
    if (!job) return;
    let token = job.share_token;
    if (!token) {
      token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      await supabase.from('jobs').update({ share_token: token }).eq('id', id);
      setJob(prev => prev ? { ...prev, share_token: token } : prev);
    }
    const url = `${window.location.origin}/propuesta/${token}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // Build a maps link for the job. Prefers the original pasted link (the user's
  // exact pin), then coordinates, then the address. Returns '' if no location.
  const buildMapsUrl = () => {
    if (!job) return '';
    if (job.job_map_link?.trim()) return job.job_map_link.trim();
    if (job.job_lat != null && job.job_lng != null) {
      return `https://maps.google.com/?q=${job.job_lat},${job.job_lng}`;
    }
    const addr = [job.job_address, job.job_city, job.job_state].filter(Boolean).join(' ');
    return addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : '';
  };

  // Share via the Web Share API when available (mobile browsers), otherwise
  // copy to clipboard and flash a "copied" hint keyed by `key`.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dupMenuOpen, setDupMenuOpen] = useState(false);
  const shareText = async (text: string, key: string) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text }); } catch { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const shareLocation = () => shareText(buildMapsUrl(), 'loc');

  // Share a crew-ready summary: maps pin link, job name, client, scheduled date.
  const shareJobToCrew = () => {
    if (!job) return;
    const cn = job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null;
    const lines = [
      buildMapsUrl(),
      job.title,
      cn ? `${td.crewTextClient}: ${cn}` : '',
      job.scheduled_date ? `${td.crewTextDate}: ${formatDateLong(job.scheduled_date, dateLoc)}` : '',
    ].filter(Boolean);
    // Blank line between fields so the map-link preview doesn't glue to the text.
    shareText(lines.join('\n\n'), 'crew');
  };

  const openPrintView = async () => {
    if (!job) return;
    let token = job.share_token;
    if (!token) {
      token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      await supabase.from('jobs').update({ share_token: token }).eq('id', id);
      setJob(prev => prev ? { ...prev, share_token: token } : prev);
    }
    window.open(`/propuesta/${token}?print=1`, '_blank');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );
  if (!job) return <div className="p-6 text-gray-400">{t.notFound}</div>;

  const isProposal = !!job.estimate_number;
  // Hide the whole Materials & Labor column for plain jobs when the toggle is
  // off. Proposals always keep it (an estimate is its line items + total).
  const showMaterials = isProposal || showItemTypes;
  const disabled = business?.job_pipeline_disabled ?? {};
  // 'posible' (lead) jobs get a posible→scheduled→… pipeline so the stepper
  // highlights their stage; other work jobs keep the standard pipeline.
  const POSIBLE_STEP = { key: 'posible', label: t.statuses.posible, icon: Sparkles, color: 'text-teal-600', bg: 'bg-teal-100' };
  const fullPipeline = isProposal
    ? PROPOSAL_PIPELINE
    : job.status === 'posible'
      ? [POSIBLE_STEP, ...WORK_PIPELINE]
      : WORK_PIPELINE;
  const pipeline = fullPipeline.filter(s => !disabled[s.key]);
  const pipelineIdx = pipeline.findIndex(s => s.key === job.status);
  // Back one step in the visible pipeline. Hidden at index 0, once invoiced,
  // and during cancellation. Lets the user undo an accidental click.
  const prevStep =
    pipelineIdx > 0 && job.status !== 'invoiced' && job.status !== 'cancelled' && job.status !== 'declined'
      ? pipeline[pipelineIdx - 1]
      : null;

  // When each pipeline step was reached (migration 074). Falls back to the older
  // columns for jobs that moved through a step before the timestamp existed.
  const stepTimestamp: Record<string, string | null> = {
    proposal: job.created_at,
    posible: job.created_at,
    sent: job.sent_at,
    accepted: job.accepted_at,
    scheduled: job.scheduled_at,
    in_progress: job.in_progress_at,
    completed: job.completed_at ?? job.completed_date,
    invoiced: job.invoiced_at ?? (job.invoice_id ? job.updated_at : null),
  };
  const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
  const hasFinancials = (job.tax_rate > 0 || job.discount > 0) && isProposal;
  const clientName = job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null;
  const isExpired = job.expiry_date && job.status === 'sent' && new Date(job.expiry_date) < new Date();
  const canInvoice = (job.status === 'completed' || job.status === 'accepted') && !job.invoice_id && can.createInvoice(currentRole);

  // Back target — return to the invoice when this job was opened from one
  // (?from=invoice&invoice=<id>), otherwise the jobs list.
  const backSearch = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const backHref =
    backSearch?.get('from') === 'invoice' && backSearch.get('invoice')
      ? `/dashboard/facturas/${backSearch.get('invoice')}`
      : backSearch?.get('from') === 'nomina'
        ? `/dashboard/reportes/nomina${backSearch.get('worker') ? `?worker=${backSearch.get('worker')}` : ''}`
        : '/dashboard/trabajos';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Link href={backHref} className="p-2 rounded-xl hover:bg-gray-100 transition-colors mt-0.5">
            <ArrowLeft size={18} className="text-gray-500"/>
          </Link>
          <div>
            {isProposal && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-gray-400">{job.estimate_number}</span>
                {isExpired && <span className="text-xs text-orange-500 font-medium">{t.expired}</span>}
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">
              {job.title}
              {/* Every non-proposal job shows a reference: imported project id,
                 else a stable short code so old/manual jobs still have an ID.
                 Proposals show their estimate number above instead. */}
              {!isProposal ? (
                <span className="ml-2 align-middle text-xs font-mono font-normal text-gray-400">{job.external_ref?.trim() || jobShortCode(job.id)}</span>
              ) : job.external_ref ? (
                <span className="ml-2 align-middle text-xs font-mono font-normal text-gray-400">{job.external_ref}</span>
              ) : null}
            </h1>
            {clientName && (
              <Link href={`/dashboard/clientes/${job.client_id}?from=job&job=${job.id}`}
                className="text-sm text-primary hover:underline font-medium">
                {clientName}{job.clients?.company ? ` · ${job.clients.company}` : ''}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex gap-2">
            {/* Generate-invoice lives in the pipeline action row below; no
               duplicate here. */}
            {job.invoice_id && can.seeInvoices(currentRole) && (
              <Link href={`/dashboard/facturas/${job.invoice_id}?from=job&job=${job.id}`}>
                <Button variant="secondary" size="sm">
                  <FileText size={14} className="mr-1.5"/> {td.viewInvoiceBtn} <ArrowRight size={13} className="ml-1"/>
                </Button>
              </Link>
            )}
            {isProposal && (
              <>
                <button onClick={shareProposal}
                  className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors relative"
                  title={td.shareTooltip}>
                  <Share2 size={16}/>
                  {sharecopied && (
                    <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded whitespace-nowrap">
                      {td.shareCopied}
                    </span>
                  )}
                </button>
                <button onClick={openPrintView}
                  className="p-2 rounded-xl text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                  title={td.printTooltip}>
                  <Download size={16}/>
                </button>
              </>
            )}
            {job.status !== 'cancelled' && job.status !== 'declined' && can.seeAllJobs(currentRole) && (
              <button onClick={shareJobToCrew}
                className="p-2 rounded-xl text-gray-500 hover:text-primary hover:bg-primary/5 transition-colors relative"
                title={td.sendToCrew}>
                <MessageSquare size={16}/>
                {copiedKey === 'crew' && (
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded whitespace-nowrap">
                    {td.shareCopied}
                  </span>
                )}
              </button>
            )}
            {businesses.length > 1 && !job.delegated_to_business_id && can.delegateJob(currentRole) && (
              <button
                onClick={() => setDelegateModal(true)}
                className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
                title={tw.delegateBtn}>
                <Building2 size={16}/>
              </button>
            )}
            {can.createJob(currentRole) && (
              <div className="relative">
                <button type="button" onClick={() => setDupMenuOpen(o => !o)}
                  className="p-2 rounded-xl text-gray-500 hover:text-primary hover:bg-primary/5 transition-colors"
                  title={td.duplicateTooltip}>
                  <Copy size={16}/>
                </button>
                {dupMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDupMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white rounded-xl border border-gray-100 shadow-lg py-1">
                      <p className="px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{td.duplicateAskTitle}</p>
                      <Link href={`/dashboard/trabajos/nuevo?duplicate=${job.id}`}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        {td.duplicateFullOption}
                      </Link>
                      <Link href={`/dashboard/trabajos/nuevo?duplicate=${job.id}&copy=team`}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        {td.duplicateTeamOption}
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )}
            {can.editJobMetadata(currentRole) && (
              <Link href={`/dashboard/trabajos/nuevo?edit=${job.id}`}
                className="p-2 rounded-xl text-gray-500 hover:text-primary hover:bg-primary/5 transition-colors"
                title={td.editTooltip}>
                <Pencil size={16}/>
              </Link>
            )}
            {can.deleteJob(currentRole) && (
              <button
                onClick={() => setDeleteModal(true)}
                className="p-2 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                title={td.deleteTooltip}
              >
                <Trash2 size={16}/>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={11}/>
            <span>{td.createdOn.replace('{{date}}', formatDateTimeLong(job.created_at, dateLoc))}</span>
          </div>
        </div>
      </div>

      {/* Status pipeline */}
      {job.status !== 'cancelled' && job.status !== 'declined' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between">
            {pipeline.map((s, i) => {
              const Icon = s.icon;
              const isPast = i < pipelineIdx;
              const isCurrent = i === pipelineIdx;
              const isFuture = i > pipelineIdx;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center gap-1.5 flex-1 transition-all ${
                    isFuture ? 'opacity-40' : ''
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isCurrent ? `${s.bg} ring-2 ring-offset-2 ring-current ${s.color}` :
                      isPast ? 'bg-gray-100' : 'bg-gray-50'
                    }`}>
                      <Icon size={18} className={isCurrent ? s.color : isPast ? 'text-gray-400' : 'text-gray-300'}/>
                    </div>
                    <span className={`text-xs font-semibold ${isCurrent ? s.color : isPast ? 'text-gray-400' : 'text-gray-300'}`}>
                      {s.label}
                    </span>
                    {(isPast || isCurrent) && stepTimestamp[s.key] ? (() => {
                      const { date, time } = formatStamp(stepTimestamp[s.key], dateLoc);
                      return (
                        <span className="text-[10px] text-gray-400 text-center leading-tight">
                          {date}{time ? <><br />{time}</> : null}
                        </span>
                      );
                    })() : null}
                  </div>
                  {i < pipeline.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 rounded transition-colors ${i < pipelineIdx ? 'bg-gray-300' : 'bg-gray-100'}`}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Next action buttons — back on the LEFT, forward (→) on the RIGHT
             so the pipeline reads left→right (matches mobile). Cancel sits on
             its own row below, away from the advance buttons. */}
          <div className="mt-4 pt-4 border-t border-gray-50 flex flex-col items-center gap-3">
            <div className="flex justify-center gap-3 flex-wrap">
              {/* One-step back — left */}
              {prevStep && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateStatus(prevStep.key)}
                  loading={updatingStatus}
                >
                  ← {prevStep.label}
                </Button>
              )}

              {/* Lead → schedule */}
              {job.status === 'posible' && (
                <Button onClick={() => updateStatus('scheduled')} loading={updatingStatus} size="sm">
                  {td.scheduleWork} <ArrowRight size={14} className="ml-1.5"/>
                </Button>
              )}
              {/* Proposal phase actions */}
              {job.status === 'proposal' && (
                <Button onClick={() => updateStatus('sent')} loading={updatingStatus} size="sm">
                  <Send size={14} className="mr-1.5"/> {t.actions.markSent}
                </Button>
              )}
              {job.status === 'sent' && !isExpired && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => updateStatus('declined')} loading={updatingStatus}>
                    <XCircle size={14} className="mr-1.5"/> {t.actions.markDeclined}
                  </Button>
                  <Button size="sm" onClick={() => updateStatus('accepted')} loading={updatingStatus}>
                    <CheckCircle2 size={14} className="mr-1.5"/> {t.actions.markAccepted}
                  </Button>
                </>
              )}
              {job.status === 'accepted' && (
                <>
                  <Button size="sm" onClick={() => updateStatus('scheduled')} loading={updatingStatus}>
                    {td.scheduleWork} <ArrowRight size={14} className="ml-1.5"/>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setInvoiceModal(true)}>
                    <FileText size={14} className="mr-1.5"/> {td.invoiceDirectly}
                  </Button>
                </>
              )}

              {/* Work phase actions */}
              {job.status === 'scheduled' && (
                <Button onClick={() => updateStatus('in_progress')} loading={updatingStatus} size="sm">
                  {t.actions.startWork} <ArrowRight size={14} className="ml-1.5"/>
                </Button>
              )}
              {job.status === 'in_progress' && (
                <Button onClick={() => updateStatus('completed')} loading={updatingStatus} size="sm">
                  {t.actions.markCompleted} <ArrowRight size={14} className="ml-1.5"/>
                </Button>
              )}
              {job.status === 'completed' && !job.invoice_id && (
                <Button onClick={() => setInvoiceModal(true)} size="sm">
                  <FileText size={14} className="mr-1.5"/> {td.generateInvoiceBtn}
                </Button>
              )}
            </div>

            {/* Cancel + Archive share one row (side by side) to avoid stacked
               dead space. Both are confirmed / reversible. */}
            {(!['cancelled', 'declined', 'invoiced'].includes(job.status) ||
              (job.status === 'completed' && can.seeAllJobs(currentRole))) && (
              <div className="flex justify-center gap-3 flex-wrap">
                {!['cancelled', 'declined', 'invoiced'].includes(job.status) && (
                  <Button variant="secondary" size="sm" loading={updatingStatus}
                    onClick={() => { void confirm({ message: td.cancelJobConfirm, destructive: true }).then(ok => { if (ok) void updateStatus('cancelled'); }); }}>
                    <XCircle size={14} className="mr-1.5"/> {td.cancelJobBtn}
                  </Button>
                )}
                {job.status === 'completed' && can.seeAllJobs(currentRole) && (
                  <Button variant="secondary" size="sm" onClick={async () => {
                    const archive = !job.archived_at;
                    if (archive && !(await confirm({ message: full.dashboard.jobs.confirmArchiveBulk.replace('{{count}}', '1') }))) return;
                    const archived_at = archive ? new Date().toISOString() : null;
                    await supabase.from('jobs').update({ archived_at }).eq('id', id);
                    if (business) void logAudit(supabase, business.id, archive ? 'job.archived' : 'job.unarchived', 'job', id, { title: job.title });
                    setJob(prev => prev ? { ...prev, archived_at } : prev);
                  }}>
                    <Archive size={14} className="mr-1.5"/> {job.archived_at ? td.unarchiveBtn : td.archiveBtn}
                  </Button>
                )}
              </div>
            )}

            {/* Un-invoice — undo an accidental "facturado". */}
            {job.status === 'invoiced' && job.invoice_id && (
              <>
                <Button variant="secondary" size="sm" onClick={() => { window.location.href = `/dashboard/facturas/${job.invoice_id}?from=job&job=${job.id}`; }}>
                  <FileText size={14} className="mr-1.5"/> {td.viewInvoiceBtn}
                </Button>
                <Button variant="secondary" size="sm" onClick={unInvoice} loading={unInvoicing}>
                  <RotateCcw size={14} className="mr-1.5"/> {td.unInvoiceBtn}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delegated banner */}
      {job.delegated_to_business_id && (() => {
        const target = businesses.find(b => b.id === job.delegated_to_business_id);
        return (
          <div className="rounded-2xl p-4 mb-5 border bg-primary/5 border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 size={16} className="text-primary"/>
              <div>
                <p className="text-sm font-semibold text-primary">
                  {tw.delegatedBadge.replace('{{name}}', target?.name ?? '—')}
                </p>
                {job.delegated_at && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDateTimeLong(job.delegated_at, dateLoc)}
                  </p>
                )}
              </div>
            </div>
            {target && (
              <Button variant="secondary" size="sm" onClick={() => {
                setActiveBusiness(target.id);
                window.location.href = '/dashboard/trabajos';
              }}>
                {tw.switchToTarget.replace('{{name}}', target.name)}
              </Button>
            )}
          </div>
        );
      })()}

      {/* Cancelled / Declined banner */}
      {(job.status === 'cancelled' || job.status === 'declined') && (
        <div className={`rounded-2xl p-4 mb-5 border flex items-center justify-between ${
          job.status === 'cancelled' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-100'
        }`}>
          <div>
            <p className={`text-sm font-semibold ${job.status === 'cancelled' ? 'text-gray-500' : 'text-red-600'}`}>
              {job.status === 'cancelled' ? td.cancelledBanner : td.declinedBanner}
            </p>
            {job.status === 'cancelled' && job.cancelled_at && (
              <p className="text-xs text-gray-400 mt-0.5">
                {td.cancelledOn.replace('{{date}}', formatDateTimeLong(job.cancelled_at, dateLoc))}
              </p>
            )}
          </div>
          {job.status === 'cancelled' && (
            <Button variant="secondary" size="sm" onClick={reinstateJob} loading={updatingStatus}>
              <RotateCcw size={14} className="mr-1.5"/> {td.reinstate}
            </Button>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${showMaterials ? 'md:grid-cols-3' : ''} gap-5`}>
        {/* Left column */}
        <div className="flex flex-col gap-4">

          {/* Proposal details card */}
          {isProposal && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{td.proposalHeading}</h2>
              <div className="flex flex-col gap-2.5">
                {job.issue_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={14} className="text-gray-400 shrink-0"/>
                    <div>
                      <p className="text-xs text-gray-400">{td.issuedAt}</p>
                      <p className="font-medium text-gray-900">
                        {formatDateLong(job.issue_date, dateLoc)}
                      </p>
                    </div>
                  </div>
                )}
                {job.expiry_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={14} className={`shrink-0 ${isExpired ? 'text-orange-400' : 'text-gray-400'}`}/>
                    <div>
                      <p className="text-xs text-gray-400">{td.validUntil}</p>
                      <p className={`font-medium ${isExpired ? 'text-orange-600' : 'text-gray-900'}`}>
                        {formatDateLong(job.expiry_date, dateLoc)}
                        {isExpired && ` ${t.expired}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{td.detailsHeading}</h2>
            <div className="flex flex-col gap-3">
              {job.scheduled_date && (() => {
                const totalTimeText = formatProjectDuration(
                  {
                    startDate: job.scheduled_date,
                    endDate: job.end_date,
                    estimatedHours: job.estimated_hours,
                    timeStart: job.time_start,
                    timeEnd: job.time_end,
                  },
                  full.common.duration,
                );
                return (
                  <div className="flex items-start gap-2.5">
                    <Calendar size={15} className="text-gray-400 mt-0.5 shrink-0"/>
                    <div>
                      <p className="text-xs text-gray-400">{td.scheduledDate}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDateLong(job.scheduled_date, dateLoc)}
                        {job.end_date ? ` — ${formatDateLong(job.end_date, dateLoc)}` : ''}
                      </p>
                      {(job.time_start || job.time_end) && (
                        <p className="text-xs text-gray-400">
                          {formatTime12h(job.time_start)}{job.time_end ? ` — ${formatTime12h(job.time_end)}` : ''}
                        </p>
                      )}
                      {totalTimeText && (
                        <p className="text-xs text-gray-400">{t.new.totalTimeLabel}: {totalTimeText}</p>
                      )}
                    </div>
                  </div>
                );
              })()}
              {((job.total_hours ?? 0) > 0 || (job.driver_hours ?? 0) > 0 || (job.driver_names?.length ?? 0) > 0) && (
                <div className="flex items-start gap-2.5">
                  <Clock size={15} className="text-gray-400 mt-0.5 shrink-0"/>
                  <div>
                    {(job.total_hours ?? 0) > 0 ? (
                      <>
                        <p className="text-xs text-gray-400">{t.new.totalHoursLabel}</p>
                        <p className="text-sm font-medium text-gray-900">{job.total_hours} h</p>
                      </>
                    ) : null}
                    {((job.driver_names?.length ?? 0) > 0 || (job.driver_hours ?? 0) > 0) ? (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.new.driverLabel}: {job.driver_names?.length ? job.driver_names.join(', ') : '—'}
                        {(job.driver_hours ?? 0) > 0 ? ` · ${job.driver_hours} h` : ''}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
              {(job.job_address || job.job_city || job.job_lat != null || job.job_map_link) && (
                <div className="flex items-start gap-2.5">
                  <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">{td.location}</p>
                    {job.job_address && <p className="text-sm font-medium text-gray-900">{job.job_address}</p>}
                    {(job.job_city || job.job_state) && (
                      <p className="text-sm text-gray-600">{[job.job_city, job.job_state].filter(Boolean).join(', ')}</p>
                    )}
                    {job.job_lat != null && job.job_lng != null && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{job.job_lat}, {job.job_lng}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <a href={buildMapsUrl()} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                        <Navigation size={12}/> {td.openInMaps}
                      </a>
                      <button onClick={shareLocation}
                        className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                        <Share2 size={12}/> {copiedKey === 'loc' ? td.shareCopied : td.shareLocation}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {job.description && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">{td.description}</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
              {/* Custom fields assigned to real sections — in the saved
                 layout order (Ajustes → Trabajos), like the form. */}
              {detailCustoms.map(renderCustomRow)}
            </div>
          </div>

          {/* Client-facing notes */}
          {job.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{td.clientNote}</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Internal notes */}
          {job.internal_notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">{td.internalNote}</h2>
              <p className="text-xs text-amber-800 whitespace-pre-wrap">{job.internal_notes}</p>
            </div>
          )}

          {/* Crew notes — visible to workers (mobile parity) */}
          {job.worker_notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.new.workerNoteLabel}</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{job.worker_notes}</p>
            </div>
          )}

          {/* Additional details — ONLY custom fields assigned to the
             'additional' section get their own card (form parity). */}
          {additionalCustoms.some(tpl => customValue(tpl) !== null) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {dateLoc === 'es' ? 'Detalles adicionales' : 'Additional details'}
              </h2>
              <div className="flex flex-col gap-2.5">
                {additionalCustoms.map(renderCustomRow)}
              </div>
            </div>
          )}

          {/* Workers card */}
          {assignments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{td.workersHeading}</h2>
              <div className="flex flex-col gap-2">
                {assignments.map(a => {
                  const name = a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name ?? '—';
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-xs font-bold">{name.charAt(0)}</span>
                      </div>
                      <span className="text-sm text-gray-900 font-medium">{name}</span>
                      {a.is_lead && (
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                          {full.dashboard.jobs.new.leadBadge}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right — Line items */}
        {showMaterials && (
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">
                {isProposal ? td.itemsHeadingProposal : td.itemsHeadingJob}
              </h2>
              <span className="text-sm font-bold text-gray-900">
                {fmt(canEditItems ? editSubtotal : hasFinancials ? job.total_amount : itemSubtotal)}
              </span>
            </div>

            {canEditItems ? (
              /* Inline editor — rows are editable in place; Save appears only when dirty. */
              <div className="p-5 flex flex-col gap-2">
                <div className={`grid ${showItemTypes ? 'grid-cols-[96px_1fr_52px_84px_22px]' : 'grid-cols-[1fr_52px_84px_22px]'} gap-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-0.5`}>
                  {showItemTypes ? <span>{t.new.colType}</span> : null}<span>{t.new.colDescription}</span><span className="text-center">{t.new.colQty}</span><span className="text-right">{td.colUnitPriceShort}</span><span/>
                </div>
                {editRows.map(r => (
                  <div key={r.id} className={`grid ${showItemTypes ? 'grid-cols-[96px_1fr_52px_84px_22px]' : 'grid-cols-[1fr_52px_84px_22px]'} gap-2 items-center`}>
                    {showItemTypes ? (
                    <select value={r.item_type} onChange={e => updateRow(r.id, 'item_type', e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                      {ITEM_TYPES.map(k => <option key={k} value={k}>{ITEM_TYPE_LABELS[k] ?? k}</option>)}
                    </select>
                    ) : null}
                    <input value={r.description} onChange={e => updateRow(r.id, 'description', e.target.value)} placeholder={t.new.colDescription}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"/>
                    <input value={r.quantity} inputMode="decimal" onChange={e => updateRow(r.id, 'quantity', e.target.value.replace(/[^0-9.]/g, ''))}
                      className="rounded-lg border border-gray-200 bg-white px-1.5 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"/>
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input value={r.unit_price} inputMode="decimal" onChange={e => updateRow(r.id, 'unit_price', e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full rounded-lg border border-gray-200 bg-white pl-4 pr-1.5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"/>
                    </div>
                    <button onClick={() => removeRow(r.id)} className="text-gray-300 hover:text-red-500" aria-label="Remove"><XCircle size={16}/></button>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-1">
                  <button onClick={addRow} className="text-sm font-semibold text-primary hover:underline">+ {td.addItemsBtn}</button>
                  {priceItems.length > 0 ? (
                    <button onClick={autopriceRows} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg">
                      <DollarSign size={14} /> {td.autopriceBtn}
                    </button>
                  ) : null}
                </div>
                {showPriceVerify ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">{td.autopriceVerify}</div>
                ) : null}
                {itemsDirty ? (
                  <div className="flex justify-end gap-2 pt-3 mt-1 border-t border-gray-100">
                    <Button variant="secondary" size="sm" onClick={discardItems}>{tc.buttons.cancel}</Button>
                    <Button size="sm" onClick={saveItems} loading={savingItems}>{tc.buttons.save}</Button>
                  </div>
                ) : null}
              </div>
            ) : items.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <DollarSign size={28} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{td.noItems}</p>
              </div>
            ) : (
              <>
                <div className={`grid ${showItemTypes ? 'grid-cols-[80px_1fr_60px_80px_80px]' : 'grid-cols-[1fr_60px_80px_80px]'} text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-2 border-b border-gray-50`}>
                  {showItemTypes ? <span>{t.new.colType}</span> : null}<span>{t.new.colDescription}</span><span className="text-center">{t.new.colQty}</span><span className="text-right">{td.colUnitPriceShort}</span><span className="text-right">{t.new.colTotal}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map(item => (
                    <div key={item.id} className={`grid ${showItemTypes ? 'grid-cols-[80px_1fr_60px_80px_80px]' : 'grid-cols-[1fr_60px_80px_80px]'} items-center px-5 py-3 hover:bg-gray-50 transition-colors`}>
                      {showItemTypes ? <span className="text-xs text-gray-400">{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}</span> : null}
                      <span className="text-sm text-gray-900 truncate pr-2">
                        {item.description}
                        {(item as { original_quantity?: number | null }).original_quantity ? <span className="text-xs text-gray-400"> · {td.measuredNote.replace('{{qty}}', String((item as { original_quantity?: number | null }).original_quantity))}</span> : null}
                      </span>
                      <span className="text-sm text-center text-gray-600">{item.quantity}</span>
                      <span className="text-sm text-right text-gray-600">${item.unit_price.toFixed(2)}</span>
                      <span className="text-sm text-right font-semibold text-gray-900">${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
                  {hasFinancials ? (
                    <div className="w-52 flex flex-col gap-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t.new.subtotal}</span>
                        <span>{fmt(job.subtotal_amount)}</span>
                      </div>
                      {job.tax_rate > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{td.tax.replace('{{rate}}', String(job.tax_rate))}</span>
                          <span>{fmt(job.tax_amount)}</span>
                        </div>
                      )}
                      {job.discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{td.discount}</span>
                          <span className="text-emerald-600">-{fmt(job.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                        <span>{t.new.total}</span>
                        <span className="text-primary">{fmt(job.total_amount)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center w-full">
                      <span className="text-sm text-gray-500">{td.totalEstimated}</span>
                      <span className="text-base font-bold text-gray-900">{fmt(itemSubtotal)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
        )}
      </div>

      {/* Photos */}
      <div className="mt-5">
        <JobPhotosSection
          jobId={job.id}
          businessId={job.business_id}
          canWrite={can.editJobMetadata(currentRole)}
        />
      </div>

      {/* Last edited — bottom of the page, mirrors the mobile layout */}
      {job.updated_at && job.updated_at !== job.created_at ? (
        <p className="mt-5 px-1 text-xs text-gray-400">
          {td.lastEditedOn.replace('{{date}}', formatDateTimeLong(job.updated_at, dateLoc))}
        </p>
      ) : null}

      {/* Generate Invoice Modal */}
      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title={td.genInvoiceTitle} size="sm">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-2">{td.summary}</p>
            <p className="text-sm font-semibold text-gray-900 mb-1">{job.title}</p>
            {job.estimate_number && <p className="text-xs text-gray-400 mb-1">{job.estimate_number}</p>}
            {clientName && <p className="text-xs text-gray-500">{td.clientPrefix.replace('{{name}}', clientName)}</p>}
            <p className="text-xs text-gray-500">
              {(items.length === 1 ? td.itemsCountSingle : td.itemsCountPlural).replace('{{count}}', String(items.length))}
            </p>
          </div>

          {!hasFinancials && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.new.taxPercent}</label>
              <input type="number" min="0" max="30" step="0.5" value={taxRate || ''}
                placeholder="0"
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"/>
            </div>
          )}

          <div className="bg-primary/5 rounded-xl p-4 space-y-1">
            {hasFinancials ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t.new.subtotal}</span>
                  <span className="font-medium">{fmt(job.subtotal_amount)}</span>
                </div>
                {job.tax_rate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{td.tax.replace('{{rate}}', String(job.tax_rate))}</span>
                    <span className="font-medium">{fmt(job.tax_amount)}</span>
                  </div>
                )}
                {job.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{td.discount}</span>
                    <span className="font-medium text-emerald-600">-{fmt(job.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-primary/10">
                  <span>{t.new.total}</span>
                  <span className="text-primary">{fmt(job.total_amount)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t.new.subtotal}</span>
                  <span className="font-medium">{fmt(itemSubtotal)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{td.tax.replace('{{rate}}', String(taxRate))}</span>
                    <span className="font-medium">{fmt(itemSubtotal * taxRate / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-primary/10">
                  <span>{t.new.total}</span>
                  <span className="text-primary">{fmt(itemSubtotal * (1 + taxRate / 100))}</span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-gray-400" dangerouslySetInnerHTML={{ __html: td.draftStatusNote }} />

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setInvoiceModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={generateInvoice} loading={invoicing} fullWidth>
              {td.createInvoiceBtn}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delegate Modal */}
      <Modal open={delegateModal} onClose={() => setDelegateModal(false)} title={tw.delegateModalTitle} size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">{tw.delegateChooseTarget}</p>
          <div className="flex flex-col gap-2">
            {businesses
              .filter(b => b.id !== job.business_id)
              .map(b => (
                <button
                  key={b.id}
                  onClick={() => runDelegate(b.id)}
                  disabled={delegating}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-primary"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                    {b.city && (
                      <p className="text-xs text-gray-500 truncate">
                        {b.city}{b.state ? `, ${b.state}` : ''}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={16} className="text-gray-300 shrink-0"/>
                </button>
              ))}
          </div>
          <div className="flex">
            <Button variant="secondary" onClick={() => setDelegateModal(false)} fullWidth>{tc.buttons.cancel}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title={td.deleteJobTitle} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">{td.deleteJobConfirm}</p>
          {job.invoice_id && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {td.deleteInvoiceWarning}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <button
              onClick={deleteJob}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleting ? td.deleting : td.deleteBtn}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
