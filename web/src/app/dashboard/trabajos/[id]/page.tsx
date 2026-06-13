'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Calendar, Users, DollarSign,
  FileText, CheckCircle2, Clock, AlertTriangle,
  XCircle, Send, ArrowRight, Trash2, Pencil, Copy,
  Share2, Download, RotateCcw, Building2, Sparkles,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import { delegateJob } from '@amixos/shared/lib/delegation';
import { logAudit } from '@amixos/shared/lib/audit';
import { can } from '@amixos/shared/lib/permissions';
import { formatDateLong, formatDateTimeLong, formatTime12h } from '@amixos/shared/lib/format';
import { formatProjectDuration } from '@amixos/shared/lib/duration';
import { JobPhotosSection } from '@/components/jobs/JobPhotosSection';

interface Job {
  id: string; business_id: string;
  client_id: string | null; invoice_id: string | null;
  title: string; description: string | null; status: string; priority: string;
  job_address: string | null; job_city: string | null; job_state: string | null;
  scheduled_date: string | null; end_date: string | null; estimated_hours: number | null;
  time_start: string | null; time_end: string | null;
  completed_date: string | null; total_amount: number; internal_notes: string | null;
  estimate_number: string | null; notes: string | null;
  issue_date: string | null; expiry_date: string | null;
  subtotal_amount: number; tax_rate: number; tax_amount: number; discount: number;
  sent_at: string | null; accepted_at: string | null; declined_at: string | null;
  share_token: string | null; created_by: string | null; cancelled_at: string | null;
  delegated_to_business_id: string | null; delegated_from_business_id: string | null; delegated_at: string | null;
  created_at: string; updated_at: string;
  clients: { id: string; first_name: string; last_name: string; company: string | null; phone_cell: string | null } | null;
}
interface Assignment {
  id: string; worker_name: string | null;
  is_lead: boolean | null;
  hours_worked: number | null;
  custom_fields: Record<string, unknown> | null;
  employees: { id: string; first_name: string; last_name: string; user_id: string | null } | null;
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
  const { t: full } = useLang();
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

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'invoice') {
      setTimeout(() => setInvoiceModal(true), 500);
    }
  }, []);

  const load = async () => {
    if (!business) return;
    const [{ data: j }, { data: a }, { data: it }] = await Promise.all([
      supabase.from('jobs').select('*, clients(id, first_name, last_name, company, phone_cell)').eq('id', id).single(),
      supabase.from('job_assignments').select('*, employees(id, first_name, last_name, user_id)').eq('job_id', id),
      supabase.from('job_items').select('*').eq('job_id', id).order('created_at'),
    ]);
    if (j) {
      setJob(j as Job);
      if (j.tax_rate > 0) setTaxRate(j.tax_rate);
    }
    setAssignments(a ?? []);
    setItems(it ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, business]);

  const updateStatus = async (newStatus: string) => {
    if (!job || !business) return;
    const prevStatus = job.status;
    setUpdatingStatus(true);
    const update: any = { status: newStatus };
    if (newStatus === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    if (newStatus === 'sent') update.sent_at = new Date().toISOString();
    if (newStatus === 'accepted') update.accepted_at = new Date().toISOString();
    if (newStatus === 'declined') update.declined_at = new Date().toISOString();
    if (newStatus === 'cancelled') update.cancelled_at = new Date().toISOString();
    await supabase.from('jobs').update(update).eq('id', id);
    setJob(prev => prev ? { ...prev, ...update } : prev);
    void logAudit(supabase, business.id, 'job.status_changed', 'job', id, {
      from: prevStatus, to: newStatus, job_title: job.title,
    });
    setUpdatingStatus(false);
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

    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('business_id', business.id);
    const invNum = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const lineItems = items.map(i => ({
      description: `${ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}: ${i.description}`,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    }));

    const { data: invoice, error } = await supabase.from('invoices').insert({
      business_id: business.id,
      client_id: job.client_id,
      invoice_number: invNum,
      status: 'draft',
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
      await supabase.from('jobs').update({ status: 'invoiced', invoice_id: invoice.id }).eq('id', id);
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
      alert(tw.delegateError);
      return;
    }
    const targetBiz = businesses.find(b => b.id === targetBusinessId);
    const switchAndGo = confirm(
      tw.delegateSuccess.replace('{{name}}', targetBiz?.name ?? '') +
        '\n\n' + tw.switchToTarget.replace('{{name}}', targetBiz?.name ?? '') + '?',
    );
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

  // Map pipeline steps to their timestamps
  const stepTimestamp: Record<string, string | null> = {
    proposal: job.created_at,
    sent: job.sent_at,
    accepted: job.accepted_at,
    scheduled: job.scheduled_date,
    in_progress: null,
    completed: job.completed_date,
    invoiced: job.invoice_id ? job.updated_at : null,
  };
  const fmtDate = (d: string | null) => (d ? formatDateLong(d, dateLoc) : null);
  const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
  const hasFinancials = (job.tax_rate > 0 || job.discount > 0) && isProposal;
  const clientName = job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null;
  const clientPhone = job.clients?.phone_cell;
  const isExpired = job.expiry_date && job.status === 'sent' && new Date(job.expiry_date) < new Date();
  const canInvoice = (job.status === 'completed' || job.status === 'accepted') && !job.invoice_id;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/trabajos" className="p-2 rounded-xl hover:bg-gray-100 transition-colors mt-0.5">
            <ArrowLeft size={18} className="text-gray-500"/>
          </Link>
          <div>
            {isProposal && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-gray-400">{job.estimate_number}</span>
                {isExpired && <span className="text-xs text-orange-500 font-medium">{t.expired}</span>}
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
            {clientName && (
              <Link href={`/dashboard/clientes/${job.client_id}`}
                className="text-sm text-primary hover:underline font-medium">
                {clientName}{job.clients?.company ? ` · ${job.clients.company}` : ''}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex gap-2">
            {canInvoice && (
              <Button onClick={() => setInvoiceModal(true)} size="sm">
                <FileText size={14} className="mr-1.5"/> {td.generateInvoiceBtn}
              </Button>
            )}
            {job.invoice_id && (
              <Link href={`/dashboard/facturas/${job.invoice_id}`}>
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
            {businesses.length > 1 && !job.delegated_to_business_id && can.delegateJob(currentRole) && (
              <button
                onClick={() => setDelegateModal(true)}
                className="p-2 rounded-xl text-primary hover:bg-primary/5 transition-colors"
                title={tw.delegateBtn}>
                <Building2 size={16}/>
              </button>
            )}
            {can.createJob(currentRole) && (
              <Link href={`/dashboard/trabajos/nuevo?duplicate=${job.id}`}
                className="p-2 rounded-xl text-gray-500 hover:text-primary hover:bg-primary/5 transition-colors"
                title={td.duplicateTooltip}>
                <Copy size={16}/>
              </Link>
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
                    {(isPast || isCurrent) && fmtDate(stepTimestamp[s.key]) && (
                      <span className="text-[10px] text-gray-400">{fmtDate(stepTimestamp[s.key])}</span>
                    )}
                  </div>
                  {i < pipeline.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 rounded transition-colors ${i < pipelineIdx ? 'bg-gray-300' : 'bg-gray-100'}`}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Next action buttons */}
          <div className="mt-4 pt-4 border-t border-gray-50 flex justify-center gap-3 flex-wrap">
            {/* Lead → schedule */}
            {job.status === 'posible' && (
              <Button onClick={() => updateStatus('scheduled')} loading={updatingStatus} size="sm">
                <Calendar size={14} className="mr-1.5"/> {td.scheduleWork}
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
                  <Calendar size={14} className="mr-1.5"/> {td.scheduleWork}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setInvoiceModal(true)}>
                  <FileText size={14} className="mr-1.5"/> {td.invoiceDirectly}
                </Button>
              </>
            )}

            {/* Work phase actions */}
            {job.status === 'scheduled' && (
              <Button onClick={() => updateStatus('in_progress')} loading={updatingStatus} size="sm">
                {t.actions.startWork}
              </Button>
            )}
            {job.status === 'in_progress' && (
              <Button onClick={() => updateStatus('completed')} loading={updatingStatus} size="sm">
                {t.actions.markCompleted}
              </Button>
            )}
            {job.status === 'completed' && !job.invoice_id && (
              <Button onClick={() => setInvoiceModal(true)} size="sm">
                <FileText size={14} className="mr-1.5"/> {td.generateInvoiceBtn}
              </Button>
            )}

            {/* One-step back — undo an accidental status click */}
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

            {/* Cancel (available in all non-terminal states) */}
            {!['cancelled', 'declined', 'invoiced'].includes(job.status) && (
              <Button variant="secondary" size="sm" onClick={() => updateStatus('cancelled')} loading={updatingStatus}>
                <XCircle size={14} className="mr-1.5"/> {tc.buttons.cancel}
              </Button>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
              {(job.job_address || job.job_city) && (
                <div className="flex items-start gap-2.5">
                  <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">{td.location}</p>
                    {job.job_address && <p className="text-sm font-medium text-gray-900">{job.job_address}</p>}
                    {(job.job_city || job.job_state) && (
                      <p className="text-sm text-gray-600">{[job.job_city, job.job_state].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>
              )}
              {clientPhone && (
                <a href={`tel:${clientPhone}`} className="flex items-center gap-2 text-xs text-primary font-medium hover:underline">
                  {td.callClient}
                </a>
              )}
              {job.description && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">{td.description}</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
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

          {/* Project Leader actuals — visible only when the current user is
             the lead on this job AND crew mode is on. Component handles its
             own visibility check + DB loads. */}
          <ActualsSection
            jobId={job.id}
            businessId={job.business_id}
            jobStatus={job.status}
            crewModeOn={business?.job_crew_mode !== false}
            assignmentFieldOrder={business?.assignment_field_order ?? null}
            userId={user?.id ?? null}
            assignments={assignments}
            onCompleted={() => updateStatus('completed')}
          />
        </div>

        {/* Right — Line items */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {isProposal ? td.itemsHeadingProposal : td.itemsHeadingJob}
              </h2>
              <span className="text-sm font-bold text-gray-900">{fmt(hasFinancials ? job.total_amount : itemSubtotal)}</span>
            </div>

            {items.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <DollarSign size={28} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{td.noItems}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[80px_1fr_60px_80px_80px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-2 border-b border-gray-50">
                  <span>{t.new.colType}</span><span>{t.new.colDescription}</span><span className="text-center">{t.new.colQty}</span><span className="text-right">{td.colUnitPriceShort}</span><span className="text-right">{t.new.colTotal}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map(item => (
                    <div key={item.id} className="grid grid-cols-[80px_1fr_60px_80px_80px] items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                      <span className="text-xs text-gray-400">{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}</span>
                      <span className="text-sm text-gray-900 truncate pr-2">{item.description}</span>
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

            {canInvoice && (
              <div className="px-5 pb-5">
                <Button onClick={() => setInvoiceModal(true)} fullWidth>
                  <FileText size={15} className="mr-2"/> {td.convertToInvoice}
                </Button>
              </div>
            )}
          </div>
        </div>
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

// ─── Project Leader actuals section ──────────────────────────────────────
// Visible only when crew mode is on AND the current user is the lead on this
// job. RLS allows the lead (field role) to update assignments on their job
// via the "lead update job_assignments" policy in migration 033.
function ActualsSection({
  jobId,
  businessId,
  jobStatus,
  crewModeOn,
  assignmentFieldOrder,
  userId,
  assignments,
  onCompleted,
}: {
  jobId: string;
  businessId: string;
  jobStatus: string;
  crewModeOn: boolean;
  assignmentFieldOrder: string[] | null;
  userId: string | null;
  assignments: Assignment[];
  onCompleted: () => void;
}) {
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const tA = full.dashboard.jobs.actuals;
  const tc = full.common;

  const [templates, setTemplates] = useState<AssignmentFieldTemplate[]>([]);
  const [draft, setDraft] = useState<Record<string, { hours: string; custom: Record<string, unknown> }>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const isLead = !!userId && assignments.some(
    (a) => a.is_lead === true && a.employees?.user_id === userId,
  );

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('job_assignment_field_templates')
        .select('*')
        .eq('business_id', businessId)
        .order('sort_order');
      if (cancelled) return;
      setTemplates((data as AssignmentFieldTemplate[] | null) ?? []);
      const initial: typeof draft = {};
      for (const r of assignments) {
        initial[r.id] = {
          hours: r.hours_worked != null ? String(r.hours_worked) : '',
          custom: { ...(r.custom_fields ?? {}) },
        };
      }
      setDraft(initial);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [businessId, jobId, assignments.length]);

  if (!crewModeOn || !loaded || !isLead) return null;

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

  const setHours = (rowId: string, v: string) =>
    setDraft(prev => ({ ...prev, [rowId]: { ...prev[rowId], hours: v } }));
  const setCustom = (rowId: string, key: string, v: unknown) =>
    setDraft(prev => ({
      ...prev,
      [rowId]: { ...prev[rowId], custom: { ...prev[rowId].custom, [key]: v } },
    }));

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
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
            logged_by: userId,
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
      lead_user_id: userId,
      worker_count: assignments.length,
      total_hours: assignments.reduce((s, a) => s + (Number(draft[a.id]?.hours) || 0), 0),
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{tA.heading}</h2>
      <p className="text-xs text-gray-500 mb-4">{tA.subtitle}</p>

      <div className="flex flex-col divide-y divide-gray-50">
        {assignments.map(row => {
          const name = row.employees ? `${row.employees.first_name} ${row.employees.last_name}` : row.worker_name ?? '—';
          const d = draft[row.id] ?? { hours: '', custom: {} };
          return (
            <div key={row.id} className="py-3 first:pt-0">
              <p className="text-sm font-semibold text-gray-900 mb-2">{name}</p>

              <div className="mb-2">
                <label className="text-xs text-gray-500 block mb-1">{tA.hoursWorkedLabel}</label>
                <input
                  type="number" step="0.1" inputMode="decimal"
                  value={d.hours}
                  onChange={e => setHours(row.id, e.target.value)}
                  placeholder={tA.hoursWorkedPlaceholder}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                />
              </div>

              {orderedTemplates.map(tpl => {
                const value = d.custom[tpl.field_key];
                if (tpl.field_type === 'boolean') {
                  // Three states — null/undefined, true, false. Clicking the
                  // active button clears to null so the user can return to
                  // "unanswered" if they clicked by mistake.
                  const yesActive = value === true;
                  const noActive = value === false;
                  return (
                    <div key={tpl.id} className="mb-2">
                      <span className="text-xs text-gray-500 block mb-1.5">{tpl.field_label}</span>
                      <div className="flex gap-2">
                        <button type="button"
                          onClick={() => setCustom(row.id, tpl.field_key, yesActive ? null : true)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                          {tc.states.yes}
                        </button>
                        <button type="button"
                          onClick={() => setCustom(row.id, tpl.field_key, noActive ? null : false)}
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                          {tc.states.no}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={tpl.id} className="mb-2">
                    <label className="text-xs text-gray-500 block mb-1">{tpl.field_label}</label>
                    <input
                      type={tpl.field_type === 'number' ? 'number' : tpl.field_type === 'date' ? 'date' : 'text'}
                      value={value == null ? '' : String(value)}
                      onChange={e =>
                        setCustom(
                          row.id,
                          tpl.field_key,
                          tpl.field_type === 'number'
                            ? e.target.value.trim() === '' ? null : Number(e.target.value)
                            : e.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {msg && (
        <p className={`text-xs mt-2 ${msg.isError ? 'text-red-500' : 'text-emerald-600'}`}>{msg.text}</p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <Button onClick={onSave} loading={saving} fullWidth>{tA.saveBtn}</Button>
        {jobStatus !== 'completed' && jobStatus !== 'invoiced' && (
          <Button onClick={markComplete} loading={saving} variant="secondary" fullWidth>
            <CheckCircle2 size={14} className="mr-1.5"/> {tA.markCompleteBtn}
          </Button>
        )}
      </div>
    </div>
  );
}
