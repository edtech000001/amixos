'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { swrRead, swrWrite } from '@amixos/shared/lib/swrCache';
import { RotateCw, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import { memberNameMap } from '@amixos/shared/lib/memberNames';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
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
import { signedUrl } from '@amixos/shared/lib/storageUrls';
import { INVOICE_PAYMENT_BUCKET, paymentPhotoPath } from '@amixos/shared/lib/invoicePayments';
import { autonameEnabled, autonameJobTitle, detectAutonameType } from '@amixos/shared/lib/autoname';
import { sortInvoiceLinesByDate, setLineItemExcluded, removeJobFromInvoice, moveJobToInvoice, addJobsToInvoice, rebuildInvoiceLineItems, addManualLineItem, removeLineItemAt, updateLineItemAt, linkLineToJob, autopriceInvoice, type AutopriceAmbiguous } from '@amixos/shared/lib/invoicing';
import { applicableRate, rowToPriceSheetItem, type PriceSheetItem, type PriceSheetRow } from '@amixos/shared/lib/priceSheet';
import { JobPreviewSheet } from '@amixos/shared/screens/dashboard/JobPreviewSheet';
import { formatDateLong, formatNumberGrouped } from '@amixos/shared/lib/format';
import { secureShareToken } from '@amixos/shared/lib/shareToken';
import { normalizeImageFile } from '@/lib/imageFile';

const PAY_METHODS = ['cash', 'check', 'card', 'transfer', 'zelle', 'cashapp', 'venmo', 'paypal', 'moneyOrder', 'other'] as const;
type PayMethodKey = (typeof PAY_METHODS)[number];

const genToken = () => secureShareToken();

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
  const { t: full, locale } = useLang();
  const tInv = full.dashboard.invoices;
  const tc = full.common;
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
  // Optional payment photo (e.g. a check picture). `payPhotoFile` = a newly
  // chosen file (pending upload); `payPhotoPath` = the stored path when editing;
  // `payPhotoExistingUrl` = the signed URL to preview it. Viewer = tapped photo.

  // Best-effort Storage cleanup. SQL triggers can no longer delete storage
  // objects (storage.protect_delete), so every point where a payment photo
  // loses its last reference removes the file via the Storage API instead.
  const removePaymentPhotos = (paths: Array<string | null | undefined>) => {
    const clean = paths.filter((p): p is string => !!p);
    if (clean.length) void supabase.storage.from(INVOICE_PAYMENT_BUCKET).remove(clean).then(() => {}, () => {});
  };
  const [payPhotoFile, setPayPhotoFile] = useState<File | null>(null);
  const [payPhotoPath, setPayPhotoPath] = useState<string | null>(null);
  const [payPhotoExistingUrl, setPayPhotoExistingUrl] = useState<string | null>(null);
  // True once an existing photo is removed — otherwise we OMIT photo_path so
  // payments still record where migration 174 hasn't been applied yet.
  const [payPhotoRemoved, setPayPhotoRemoved] = useState(false);
  // Full-screen payment-photo viewer: id + rotation ride along so the rotate
  // button can persist (invoice_payments.photo_rotation, migration 190).
  const [viewPhoto, setViewPhoto] = useState<{ id: string; url: string; rotation: number } | null>(null);
  const [viewZoom, setViewZoom] = useState(false);
  const rotateViewPhoto = async () => {
    if (!viewPhoto) return;
    const next = (viewPhoto.rotation + 90) % 360;
    setViewPhoto({ ...viewPhoto, rotation: next });
    setPayments(prev => prev.map(p => (p.id === viewPhoto.id ? { ...p, photoRotation: next } : p)));
    await supabase.from('invoice_payments').update({ photo_rotation: next }).eq('id', viewPhoto.id);
  };

  // ── Jobs attached to this invoice (Phase 2 management) ──────────────
  const tj = full.dashboard.jobs;
  const itemTypeLabels = {
    labor: tj.new.itemTypeLabor,
    material: tj.new.itemTypeMaterial,
    equipment: tj.new.itemTypeEquipment,
    other: tj.new.itemTypeOther,
  };
  const [attachedJobs, setAttachedJobs] = useState<{ id: string; title: string; status: string; job_state?: string | null; scheduled_date?: string | null }[]>([]);
  const [invClientId, setInvClientId] = useState<string | null>(null);
  // Autoprice: active price-sheet items + the invoice client's tier.
  const [priceItems, setPriceItems] = useState<PriceSheetItem[]>([]);
  const [clientState, setClientState] = useState<string | null>(null);
  // Read-only "prices for this client" sheet (tier + state resolved rates).
  const [pricesOpen, setPricesOpen] = useState(false);
  const [showInvVerify, setShowInvVerify] = useState(false);
  // Autoprice tie picker: lines that matched 2+ prices, + the user's choices.
  const [ambiguous, setAmbiguous] = useState<AutopriceAmbiguous[] | null>(null);
  const [linePicks, setLinePicks] = useState<Record<number, string>>({});
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [moveJobId, setMoveJobId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<{ id: string; invoice_number: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // When set, the job picker is in "link" mode for this line index (associate an
  // imported/manual line with a job) instead of adding new job lines.
  const [linkIndex, setLinkIndex] = useState<number | null>(null);
  const [addCandidates, setAddCandidates] = useState<{ id: string; title: string; externalRef: string | null; scheduled_date: string | null; client_id: string | null; clientName: string }[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [addPicked, setAddPicked] = useState<Set<string>>(new Set());
  const [manualDesc, setManualDesc] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualRate, setManualRate] = useState('');
  // Optional "date performed" for manual lines (YYYY-MM-DD).
  const [manualDate, setManualDate] = useState('');

  // Amount input filter: digits + decimals + one optional leading minus, so a
  // manual line can be a deduction (e.g. "-500" to reduce the total).
  const cleanAmount = (v: string) => v.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '');

  // Edit-a-manual-line state.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editRate, setEditRate] = useState('');
  const [editDate, setEditDate] = useState('');
  // Only MANUAL lines carry their own date — a linked job's date belongs to
  // the job (shown read-only on the line, edited on the job itself).
  const [editIsManual, setEditIsManual] = useState(false);

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
    setEditDate(li.service_date ?? '');
    setEditIsManual(!li.job_id);
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
      serviceDate: editIsManual ? (editDate || null) : undefined,
    });
    setEditIndex(null);
    await reloadInvoice();
    setJobBusy(false);
  };

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from('jobs')
      .select('id, title, status, job_state, scheduled_date')
      .eq('invoice_id', id)
      .order('created_at');
    setAttachedJobs((data ?? []) as { id: string; title: string; status: string; job_state?: string | null; scheduled_date?: string | null }[]);
  }, [id, supabase]);

  // Re-fetch the invoice row (after a job add/remove/move changes totals).

  // Autoname (gated pilot): normalize the linked jobs' titles from their
  // description/repair-type keywords, then keep the stored line-item
  // descriptions (the printed document) in step.
  const runAutoname = async () => {
    if (!invoice || !business) return;
    setJobBusy(true);
    try {
      const jobIds = Array.from(new Set(invoice.lineItems.map(li => li.job_id).filter((x): x is string => !!x)));
      const { data } = jobIds.length
        ? await supabase.from('jobs').select('id, title, description, custom_fields').in('id', jobIds)
        : { data: [] };
      const renames = new Map<string, string>();
      for (const j of (data ?? []) as { id: string; title: string | null; description: string | null; custom_fields: Record<string, unknown> | null }[]) {
        const to = autonameJobTitle(j.title ?? '', detectAutonameType({ title: j.title, description: j.description, customFields: j.custom_fields }), j.description);
        if (to && to !== j.title) renames.set(j.id, to);
      }
      if (renames.size === 0) { void alertMessage({ message: tInv.autonameNone }); return; }
      for (const [jid, to] of Array.from(renames.entries())) await supabase.from('jobs').update({ title: to }).eq('id', jid);
      const { data: invRow } = await supabase.from('invoices').select('line_items').eq('id', id).single();
      const items = ((invRow?.line_items ?? []) as { job_id?: string | null; addon?: boolean }[]).map(it =>
        it.job_id && renames.has(it.job_id) && !it.addon ? { ...it, description: renames.get(it.job_id) } : it);
      await supabase.from('invoices').update({ line_items: items }).eq('id', id);
      void logAudit(supabase, business.id, 'invoice.autoname', 'invoice', id, { invoice_number: invoice.invoiceNumber, renamed: renames.size });
      await reloadInvoice();
      void alertMessage({ message: tInv.autonameDone.replace('{{count}}', String(renames.size)) });
    } finally {
      setJobBusy(false);
    }
  };

  // Eye toggle: temporarily exclude a line — totals + the printed document
  // omit it until re-enabled (e.g. hold back a subcontractor offset line).
  const toggleLineExcluded = async (index: number, excluded: boolean) => {
    setJobBusy(true);
    await setLineItemExcluded(supabase, { invoiceId: id, index, excluded });
    await reloadInvoice();
    setJobBusy(false);
  };

  // Reorder stored lines by date — the printed document follows. First press
  // sorts newest-first; pressing again flips the direction.
  const [sortLinesDir, setSortLinesDir] = useState<'asc' | 'desc' | null>(null);
  const sortLines = async () => {
    const dir = sortLinesDir === 'desc' ? 'asc' : 'desc';
    setJobBusy(true);
    await sortInvoiceLinesByDate(supabase, { invoiceId: id, direction: dir });
    await reloadInvoice();
    setSortLinesDir(dir);
    setJobBusy(false);
  };

  const reloadInvoice = useCallback(async () => {
    const { data } = await supabase.from('invoices')
      .select('*, clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code))')
      .eq('id', id).single();
    if (data) setInvoice(mapInvoice(data as unknown as RawInvoice, []));
    await loadJobs();
  }, [id, supabase, loadJobs]);

  // Load active price-sheet items (for the Autoprice button).
  useEffect(() => {
    if (!business) return;
    void supabase.from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, client_rates, match_terms, is_addon, addon_inline, sort_order, active')
      .eq('business_id', business.id).eq('active', true)
      .then(({ data }: { data: PriceSheetRow[] | null }) => setPriceItems((data ?? []).map(rowToPriceSheetItem)));
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The invoice client's price tier (for tier-aware autopricing).
  useEffect(() => {
    if (!invClientId) { setClientState(null); return; }
    void supabase.from('clients').select('state').eq('id', invClientId).single()
      .then(({ data }: { data: { state: string | null } | null }) => setClientState(data?.state ?? null));
  }, [invClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset every line to unpriced ($0) so Autoprice can re-run clean — e.g. after
  // adding a state-specific price. Autoprice skips already-priced lines, so this
  // is the "clear the units first" step.
  const clearPrices = async () => {
    if (!(await confirm({ message: tInv.jobsSection.clearPricesConfirm, destructive: true }))) return;
    await rebuildInvoiceLineItems(supabase, { invoiceId: id, itemTypeLabels, hideItemTypes: business?.job_item_types_enabled === false, qtyField: business?.invoice_qty_field, force: true });
    await reloadInvoice();
  };

  const runAutoprice = async (picks?: Record<number, string>) => {
    if (!priceItems.length) return;
    const res = await autopriceInvoice(supabase, { invoiceId: id, items: priceItems, clientId: invClientId, qtyField: business?.invoice_qty_field, picks });
    if (res.matched) { setShowInvVerify(true); await reloadInvoice(); }
    // Lines that tied between 2+ prices → let the user pick which one.
    if (res.ambiguous.length) { setAmbiguous(res.ambiguous); setLinePicks({}); return; }
    setAmbiguous(null);
    if (res.matched) return;
    if (res.alreadyPriced > 0) void alertMessage({ message: tj.detail.autopriceAlreadyPriced });
    // Show the exact text we searched so the user can see which word to add a
    // match term for (and it reveals whether the job's description reached us).
    else void alertMessage({ message: `${tj.detail.autopriceNoMatch}\n\n(${priceItems.length} price items loaded)${res.unmatched.length ? `\n${res.unmatched.map(u => `• ${u}`).join('\n')}` : ''}` });
  };

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

  // Load addable jobs (completed + not yet on an invoice). With no search, show
  // this invoice's client only (the common case). When searching, span ALL
  // clients by title so any job is findable — sorted same-client first, then
  // most recent. Capped at 50 to stay light.
  const loadAddCandidates = async (term: string) => {
    let q = supabase
      .from('jobs')
      .select('id, title, external_ref, scheduled_date, client_id, clients(first_name, last_name, company)')
      .eq('business_id', business!.id)
      .eq('status', 'completed')
      .is('invoice_id', null);
    const t = term.trim();
    if (t) {
      // Match the job title OR the imported Project ID (external_ref, e.g.
      // "Proyecto-614e1cef"). Strip chars that would break PostgREST's or-filter.
      const safe = t.replace(/[,()*]/g, ' ').trim();
      q = q.or(`title.ilike.*${safe}*,external_ref.ilike.*${safe}*`);
    } else if (invClientId) q = q.eq('client_id', invClientId);
    const { data } = await q.order('scheduled_date', { ascending: false }).limit(50);
    const rows = ((data ?? []) as { id: string; title: string; external_ref: string | null; scheduled_date: string | null; client_id: string | null; clients: { first_name: string | null; last_name: string | null; company: string | null } | null }[]).map(j => ({
      id: j.id,
      title: j.title,
      externalRef: j.external_ref,
      scheduled_date: j.scheduled_date,
      client_id: j.client_id,
      clientName: (j.clients?.company || `${j.clients?.first_name ?? ''} ${j.clients?.last_name ?? ''}`.trim()) || '',
    }));
    // Same-client first (stable sort keeps the date-desc order within a group).
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

  // Link an imported/manual line (by index) to an existing job — opens the same
  // job picker in single-select "link" mode.
  const openLink = async (index: number) => {
    setLinkIndex(index);
    setAddSearch('');
    await loadAddCandidates('');
    setAddPicked(new Set());
    setAddOpen(true);
  };

  const closeAdd = () => { setAddOpen(false); setLinkIndex(null); setManualDate(''); };

  // Re-query as the search term changes (debounced) while the picker is open.
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
      await addManualLineItem(supabase, { invoiceId: id, description: desc, qty: parseFloat(manualQty) || 1, rate, serviceDate: manualDate || null });
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

  const loadPayments = async () => {
    const { data } = await supabase
      .from('invoice_payments')
      .select('id, amount, method, paid_on, photo_path, photo_rotation')
      .eq('invoice_id', id)
      .order('paid_on')
      .order('created_at');
    const rows = (data ?? []) as { id: string; amount: number; method: string | null; paid_on: string; photo_path: string | null; photo_rotation: number | null }[];
    const signed = await Promise.all(
      rows.map(r => (r.photo_path ? signedUrl(supabase, r.photo_path).catch(() => null) : Promise.resolve(null))),
    );
    setPayments(rows.map((r, i) => ({ id: r.id, amount: r.amount, method: r.method, paidOn: r.paid_on, photoPath: r.photo_path, photoUrl: signed[i], photoRotation: r.photo_rotation ?? 0 })));
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
      // Sync a draft invoice's line items with its jobs' current items first,
      // so amounts reflect items added after the invoice was created.
      await rebuildInvoiceLineItems(supabase, { invoiceId: id, itemTypeLabels, hideItemTypes: business?.job_item_types_enabled === false, qtyField: business?.invoice_qty_field });
      const [{ data }, { data: tpls }] = await Promise.all([
        supabase.from('invoices')
          .select('*, clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(id, first_name, last_name, email, email_office, email_home, phone_cell, company, address, city, state, zip_code))')
          .eq('id', id)
          .single(),
        supabase.from('invoice_field_templates')
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
    setPayPhotoFile(null);
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
    setPayPhotoFile(null);
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
    if (!Number.isFinite(amount) || amount < 0) return;
    setPayBusy(true);
    const method = paymentMethodLabel() || null;
    // Upload a newly-chosen photo; keep the existing path otherwise.
    let photoPath: string | null = payPhotoPath;
    if (payPhotoFile) {
      try {
        const uid = crypto.randomUUID();
        const path = paymentPhotoPath(business.id, uid);
        const { error: upErr } = await supabase.storage.from(INVOICE_PAYMENT_BUCKET).upload(path, payPhotoFile, { upsert: false, contentType: payPhotoFile.type || 'image/jpeg' });
        if (!upErr) photoPath = path;
        else void alertMessage({ message: `No se pudo subir la foto (el pago se guarda sin ella): ${upErr.message}` });
      } catch {
        // The payment still records — but say so, or a broken upload path can
        // silently eat every check photo (exactly what happened pre-190).
        void alertMessage({ message: 'No se pudo subir la foto (el pago se guarda sin ella).' });
      }
    }
    // Only touch photo_path when a photo was added or removed this session, so
    // payments still save where migration 174 isn't applied yet.
    const writePhoto = !!payPhotoFile || payPhotoRemoved;
    if (payEditId) {
      // Previous photo from the ROW (the remove handler nulls payPhotoPath).
      const prevPath = payments.find(pp => pp.id === payEditId)?.photoPath ?? null;
      const { error } = await supabase.from('invoice_payments')
        .update({ amount, method, paid_on: payDate || new Date().toISOString().slice(0, 10), ...(writePhoto ? { photo_path: photoPath } : {}) })
        .eq('id', payEditId);
      if (error) {
        // Row write failed after a successful upload → don't strand the file.
        if (photoPath && photoPath !== prevPath) removePaymentPhotos([photoPath]);
        setPayBusy(false); return;
      }
      if (writePhoto && prevPath && prevPath !== photoPath) removePaymentPhotos([prevPath]);
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
    removePaymentPhotos([delPayment.photoPath]);
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
    removePaymentPhotos(payments.map(p => p.photoPath));
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
    // Payments cascade with the invoice — clear their photos too.
    removePaymentPhotos(payments.map(p => p.photoPath));
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
  // changes an already-SENT invoice.
  //
  // While the invoice is still a DRAFT, (re)capture the CURRENT design every
  // time it's printed/shared/sent — a draft hasn't been delivered, so a stale
  // earlier snapshot (old theme, no logo-invert) must not stick: the emailed
  // PDF has to match what the owner sees now. Once sent, the snapshot is frozen
  // for good so a later restyle can't change a delivered invoice.
  const ensureShareToken = async (): Promise<string> => {
    const isDraft = invoice?.status === 'draft';
    const freezeConfig = isDraft
      ? resolveConfig(null, business?.invoice_template ?? null) // current live design
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
    const ccParam = ccList.length ? `&cc=${encodeURIComponent(ccList.join(','))}` : '';
    const token = await ensureShareToken();
    const url = `${window.location.origin}/factura/${token}`;
    // Delivery mode (Ajustes → Facturas → Email delivery). Default = PDF.
    // The browser's mailto can't carry attachments, so for PDF we open the
    // print/save-as-PDF view alongside the email for the user to attach.
    const delivery = business?.invoice_email_delivery || 'pdf';
    const includeLink = delivery === 'link' || delivery === 'both';
    const includePdf = delivery === 'pdf' || delivery === 'both';
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
        link: includeLink ? url : '',
        client: c ? `${c.firstName} ${c.lastName}`.trim() : '',
        firstName: c?.firstName ?? '',
        lastName: c?.lastName ?? '',
        company: c?.company ?? '',
        business: business?.name ?? '',
        total: `$${invoice.totalAmount.toFixed(2)}`,
        dueDate: invoice.dueDate ?? '',
      },
    });
    // PDF (or both): open the printable view in a new tab so the user can save
    // the PDF and attach it (mailto can't attach files itself).
    if (includePdf) window.open(`/factura/${token}?print=1`, '_blank');
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${ccParam}`;
    await updateStatus('sent');
  };

  const canDelete = can.deleteInvoice(currentRole);
  const canEdit = can.editInvoice(currentRole);

  return (
    <>
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
        onPrint={onPrint}
        onShareLink={onShareLink}
        onEdit={invoice && canEdit ? () => router.push(`/dashboard/facturas/nueva?edit=${id}`) : undefined}
        onDelete={invoice && canDelete ? () => setDeleteOpen(true) : undefined}
        onAutoprice={invoice && canEdit && invoice.status === 'draft' && priceItems.length > 0 ? runAutoprice : undefined}
        onViewPrices={priceItems.some(p => p.active) ? () => setPricesOpen(true) : undefined}
        onAutoname={autonameEnabled(business?.id) && canEdit ? runAutoname : undefined}
        onClearPrices={invoice && canEdit && invoice.status === 'draft' && priceItems.length > 0 ? clearPrices : undefined}
        autopriceVerify={showInvVerify}
        onMoveJob={canEdit ? openMove : undefined}
        onRemoveJob={canEdit ? removeJob : undefined}
        onAddJob={canEdit ? openAdd : undefined}
        onRemoveManualItem={canEdit ? removeManual : undefined}
        onEditManualItem={canEdit ? editManual : undefined}
        onLinkLine={canEdit ? openLink : undefined}
        onToggleLineExcluded={canEdit ? toggleLineExcluded : undefined}
        onSortLines={canEdit ? sortLines : undefined}
        sortLinesDir={sortLinesDir}
        onJobPress={(jobId) => setPreviewJobId(jobId)}
        jobBusy={jobBusy}
        onSendInvoice={canEdit ? sendInvoice : undefined}
        payments={payments}
        onRecordPayment={canEdit ? openRecordPayment : undefined}
        onEditPayment={canEdit ? openEditPayment : undefined}
        onDeletePayment={canEdit ? setDelPayment : undefined}
        onViewPaymentPhoto={(p) => { if (p.photoUrl) { setViewZoom(false); setViewPhoto({ id: p.id, url: p.photoUrl, rotation: p.photoRotation ?? 0 }); } }}
        onUndoPaid={canEdit ? () => setUndoPaidOpen(true) : undefined}
        onClientPress={(clientId) => router.push(`/dashboard/clientes/${clientId}?from=invoice&invoice=${id}`)}
        jobTitles={Object.fromEntries(attachedJobs.map(j => [j.id, j.title]))}
        jobStates={Object.fromEntries(attachedJobs.filter(j => j.job_state).map(j => [j.id, j.job_state as string]))}
        jobDates={Object.fromEntries(attachedJobs.filter(j => j.scheduled_date).map(j => [j.id, j.scheduled_date as string]))}
      />

      <JobPreviewSheet
        supabase={supabase}
        jobId={previewJobId}
        onClose={() => setPreviewJobId(null)}
        onOpenFull={(jid) => { setPreviewJobId(null); router.push(`/dashboard/trabajos/${jid}?from=invoice&invoice=${id}`); }}
      />

      {/* Autoprice tie picker — a line matched 2+ prices; the user picks one. */}
      <Modal open={!!ambiguous} onClose={() => setAmbiguous(null)} title={tj.detail.autopricePickTitle} size="sm">
        {ambiguous ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">{tj.detail.autopricePickSubtitle}</p>
            {ambiguous.map(a => (
              <div key={a.index}>
                <p className="text-sm font-semibold text-ink mb-1.5">{a.description}</p>
                <div className="flex flex-col gap-1.5">
                  {a.options.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setLinePicks(p => ({ ...p, [a.index]: o.id }))}
                      className={`text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        linePicks[a.index] === o.id ? 'bg-primary/10 border-primary text-primary font-semibold' : 'border-border text-ink hover:bg-surface'
                      }`}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => setAmbiguous(null)} fullWidth>{tc.buttons.cancel}</Button>
              <Button onClick={() => { const picks = linePicks; setAmbiguous(null); void runAutoprice(picks); }} disabled={Object.keys(linePicks).length < ambiguous.length} fullWidth>
                {tj.detail.autopricePickApply}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Move-to-another-invoice picker */}
      <Modal open={moveJobId !== null} onClose={() => setMoveJobId(null)} title={tInv.jobsSection.moveTitle} size="sm">
        {moveTargets.length === 0 ? (
          <p className="text-sm text-faint">{tInv.jobsSection.moveEmpty}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {moveTargets.map(inv => (
              <button key={inv.id} onClick={() => doMove(inv.id)} disabled={jobBusy} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-surface text-sm text-ink disabled:opacity-40">
                <span className="font-mono text-muted">{inv.invoice_number}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Add to invoice — manual item + completed jobs */}
      <Modal open={addOpen} onClose={closeAdd} title={linkIndex !== null ? tInv.jobsSection.linkTitle : tInv.jobsSection.addTitle} size="sm">
        <div className="flex flex-col gap-5">
          {/* Manual line item — hidden in link mode (we're associating a line). */}
          {linkIndex === null ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{tInv.jobsSection.manualHeading}</p>
            <div className="flex flex-col gap-2">
              <input
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                placeholder={tInv.jobsSection.manualDescPlaceholder}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
              <div className="flex gap-2">
                <input
                  value={manualQty}
                  inputMode="decimal"
                  onChange={e => setManualQty(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={tj.new.colQty}
                  className="w-20 rounded-xl border border-border bg-card px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                />
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                  <input
                    value={manualRate}
                    inputMode="decimal"
                    onChange={e => setManualRate(cleanAmount(e.target.value))}
                    placeholder={tj.detail.colUnitPriceShort}
                    className="w-full rounded-xl border border-border bg-card pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">{tInv.jobsSection.serviceDateLabel}</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                />
              </div>
            </div>
          </div>
          ) : null}

          {/* Completed jobs — searchable across clients, same client first. */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{tInv.jobsSection.jobsHeading}</p>
            <input
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              placeholder={tInv.jobsSection.addSearchPlaceholder}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            />
            {addCandidates.length === 0 ? (
              <p className="text-sm text-faint">{tInv.jobsSection.addEmpty}</p>
            ) : (
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {addCandidates.map(j => {
                  const picked = addPicked.has(j.id);
                  const otherClient = j.client_id !== invClientId && !!j.clientName;
                  return (
                    <button
                      key={j.id}
                      onClick={() => setAddPicked(prev => {
                        // Link mode: single-select (one job per line). Add mode: toggle.
                        if (linkIndex !== null) return new Set(prev.has(j.id) ? [] : [j.id]);
                        const n = new Set(prev); n.has(j.id) ? n.delete(j.id) : n.add(j.id); return n;
                      })}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left ${picked ? 'bg-primary/10' : 'hover:bg-surface'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${picked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                        {picked ? '✓' : ''}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-ink">{j.title}</span>
                        <span className="block text-xs text-faint truncate">
                          {j.externalRef ? <span className="font-mono">{j.externalRef}</span> : null}
                          {j.externalRef && (otherClient || j.scheduled_date) ? ' · ' : ''}
                          {otherClient ? <span className="text-amber-500 font-medium">{j.clientName}</span> : null}
                          {otherClient && j.scheduled_date ? ' · ' : ''}
                          {j.scheduled_date ? formatDateLong(j.scheduled_date, full.dashboard.dateLocale) : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button onClick={doAdd} loading={jobBusy} fullWidth>{linkIndex !== null ? tInv.jobsSection.linkBtn : tInv.jobsSection.addConfirm}</Button>
        </div>
      </Modal>

      {/* Edit a manual line item */}
      <Modal open={editIndex !== null} onClose={() => setEditIndex(null)} title={tInv.jobsSection.editItemTitle} size="sm">
        <div className="flex flex-col gap-3">
          <input
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder={tInv.jobsSection.manualDescPlaceholder}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              value={editQty}
              inputMode="decimal"
              onChange={e => setEditQty(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={tj.new.colQty}
              className="w-20 rounded-xl border border-border bg-card px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            />
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
              <input
                value={editRate}
                inputMode="decimal"
                onChange={e => setEditRate(cleanAmount(e.target.value))}
                placeholder={tj.detail.colUnitPriceShort}
                className="w-full rounded-xl border border-border bg-card pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
            </div>
          </div>
          {editIsManual ? (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">{tInv.jobsSection.serviceDateLabel}</label>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
            </div>
          ) : null}
          <Button onClick={doEditSave} loading={jobBusy} disabled={!editDesc.trim()} fullWidth>{tc.buttons.save}</Button>
        </div>
      </Modal>

      {/* Record payment — amount defaults to the remaining balance */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={payEditId ? tInv.payments.editTitle : tInv.payments.recordTitle} size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{tInv.payments.amountLabel}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
              <input
                value={payAmount}
                inputMode="decimal"
                onChange={e => setPayAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full rounded-xl border border-border bg-card pl-6 pr-32 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
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
            <label className="text-sm font-medium text-ink">{tInv.payments.methodLabel}</label>
            <select
              value={payMethodKey}
              onChange={e => setPayMethodKey(e.target.value as PayMethodKey)}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
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
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{tInv.payments.dateLabel}</label>
            <input
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
            />
          </div>
          {/* Optional payment photo (e.g. a picture of the check). */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{tInv.payments.photoLabel}</label>
            {payPhotoFile || payPhotoExistingUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={payPhotoFile ? URL.createObjectURL(payPhotoFile) : payPhotoExistingUrl!} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
                <label className="text-sm text-primary font-semibold cursor-pointer hover:underline">
                  {tInv.payments.changePhoto}
                  <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; setPayPhotoFile(f ? await normalizeImageFile(f) : null); }} />
                </label>
                <button type="button" onClick={() => { setPayPhotoFile(null); setPayPhotoPath(null); setPayPhotoExistingUrl(null); setPayPhotoRemoved(true); }} className="text-sm text-red-600 font-semibold hover:underline">
                  {tInv.payments.removePhoto}
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-muted font-medium cursor-pointer hover:bg-border-soft">
                {tInv.payments.addPhoto}
                <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; setPayPhotoFile(f ? await normalizeImageFile(f) : null); }} />
              </label>
            )}
          </div>
          <Button onClick={submitPayment} loading={payBusy} disabled={!(parseFloat(payAmount) >= 0)} fullWidth>
            {payEditId ? tc.buttons.save : tInv.payments.recordBtn}
          </Button>
        </div>
      </Modal>

      {/* Payment photo viewer (lightbox) */}
      {viewPhoto ? (
        <div onClick={() => setViewPhoto(null)} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out">
          {/* Clicking the PHOTO toggles zoom — only the backdrop/X close. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewPhoto.url} alt=""
            onClick={e => { e.stopPropagation(); setViewZoom(z => !z); }}
            className={`max-w-full max-h-full object-contain transition-transform ${viewZoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
            style={{ transform: `rotate(${viewPhoto.rotation}deg) scale(${viewZoom ? 2.2 : 1})` }} />
          <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-3">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); void rotateViewPhoto(); }}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              <RotateCw size={16} /> 90°
            </button>
            <button
              type="button"
              onClick={() => setViewPhoto(null)}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-4 py-2.5 rounded-full"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Delete a recorded payment */}
      <Modal open={delPayment !== null} onClose={() => setDelPayment(null)} title={tInv.payments.title} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{tInv.payments.deleteConfirm}</p>
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
          <p className="text-sm text-muted">{tInv.payments.undoPaidConfirm}</p>
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
            className="text-sm text-muted"
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

      {/* Read-only price list resolved for THIS client (tier > state > base). */}
      <Modal open={pricesOpen} onClose={() => setPricesOpen(false)} title={tInv.clientPrices.title}>
        <div className="flex flex-col gap-4">
          {(() => {
            const items = priceItems.filter(p => p.active);
            const groups = new Map<string, PriceSheetItem[]>();
            for (const it of items) {
              const k = it.category?.trim() || '';
              const arr = groups.get(k);
              if (arr) arr.push(it); else groups.set(k, [it]);
            }
            let anyTier = false;
            const blocks = Array.from(groups.entries()).map(([cat, arr]) => (
              <div key={cat || '__none'}>
                {cat ? <p className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-1.5">{cat}</p> : null}
                <div className="rounded-xl border border-border-soft divide-y divide-border-soft">
                  {arr.map(it => {
                    const rate = applicableRate(it, { clientId: invClientId, state: clientState });
                    const tierHit = !!(invClientId && it.clientRates && Number.isFinite(it.clientRates[invClientId]));
                    if (tierHit) anyTier = true;
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-sm text-ink truncate">{it.isAddon ? '+ ' : ''}{it.name}</span>
                        <span className={`text-sm font-semibold shrink-0 ${tierHit ? 'text-primary' : 'text-ink'}`}>
                          ${formatNumberGrouped(rate)}
                          <span className="text-xs font-normal text-muted">
                            {it.pricingMode === 'per_unit' ? `/${it.unitLabel || 'u'}` : ` (${tInv.clientPrices.flatWord})`}
                          </span>
                          {tierHit ? ' *' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
            return (
              <>
                {blocks}
                {anyTier ? <p className="text-[11px] text-primary">* {tInv.clientPrices.tierNote}</p> : null}
              </>
            );
          })()}
        </div>
      </Modal>
    </>
  );
}
