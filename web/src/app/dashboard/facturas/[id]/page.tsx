'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';
import {
  InvoiceDetailScreen,
  type InvoiceDetail,
} from '@amixos/shared/screens/dashboard/InvoiceDetailScreen';
import type { InvoiceLang } from '@amixos/shared';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import { resolveConfig, type InvoiceBranding } from '@amixos/shared/lib/invoiceTemplate';
import { removeJobFromInvoice, moveJobToInvoice, addJobsToInvoice, rebuildInvoiceLineItems, addManualLineItem, removeLineItemAt, updateLineItemAt } from '@amixos/shared/lib/invoicing';
import { formatDateLong } from '@amixos/shared/lib/format';

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
  first_name: string;
  last_name: string;
  email: string | null;
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
  // ?from=job&job=… → back returns to that job instead of the invoice list.
  const fromJobId = searchParams.get('from') === 'job' ? searchParams.get('job') : null;
  const goBack = () => router.push(fromJobId ? `/dashboard/trabajos/${fromJobId}` : '/dashboard/facturas');
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
    if (!window.confirm(tInv.jobsSection.removeItemConfirm)) return;
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
      .select('*, clients(first_name, last_name, email, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(first_name, last_name, email, phone_cell, company, address, city, state, zip_code))')
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
    if (!window.confirm(sentOrPaid ? tj.detail.unInvoiceSentWarning : tj.detail.unInvoiceConfirm)) return;
    setJobBusy(true);
    const { remaining } = await removeJobFromInvoice(supabase, {
      jobId,
      invoice: { id: inv.id, line_items: inv.line_items as never, tax_rate: inv.tax_rate, discount: inv.discount },
    });
    if (remaining === 0 && window.confirm(tj.detail.unInvoiceDeleteEmpty.replace('{{number}}', inv.invoice_number))) {
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
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
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
          .select('*, clients(first_name, last_name, email, phone_cell, company, address, city, state, zip_code), invoice_clients(clients(first_name, last_name, email, phone_cell, company, address, city, state, zip_code))')
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
      }
      setLoading(false);
    })();
  }, [id, business]);

  const updateStatus = async (status: 'sent' | 'paid') => {
    setUpdating(true);
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    if (business) {
      void logAudit(supabase, business.id, status === 'paid' ? 'invoice.paid' : 'invoice.sent', 'invoice', id, {
        invoice_number: invoice?.invoiceNumber,
      });
    }
    setInvoice(prev => prev ? { ...prev, status } : prev);
    setUpdating(false);
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
      window.alert(tInv.linkCopied);
    } catch {
      window.prompt(tInv.linkCopied, url);
    }
  };

  // Email the invoice: open the mail client pre-filled with the client's
  // address + public link, then mark sent.
  const sendInvoice = async () => {
    if (!invoice) return;
    const email = invoice.clients[0]?.email ?? '';
    if (!email) { window.alert(tInv.sendNoEmail); return; }
    const token = await ensureShareToken();
    const url = `${window.location.origin}/factura/${token}`;
    const subject = tInv.emailSubject.replace('{{number}}', invoice.invoiceNumber);
    const body = tInv.emailBody.replace('{{link}}', url);
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
