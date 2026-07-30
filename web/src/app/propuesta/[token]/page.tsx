'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignaturePad } from '@/components/SignaturePad';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { formatDateTimeLong } from '@amixos/shared/lib/format';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
import { resolveConfig, buildInvoiceViewModel, invoiceDefaultLanguage, type InvoiceBranding, type InvoiceDocData } from '@amixos/shared/lib/invoiceTemplate';

interface ProposalData {
  id: string;
  title: string;
  description: string | null;
  estimate_number: string | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  scheduled_date: string | null;
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  notes: string | null;
  client_response: 'accepted' | 'declined' | null;
  client_responded_at: string | null;
  client_signed_name: string | null;
  client_signature: string | null;
  created_by_name: string | null;
  clients: {
    first_name: string; last_name: string; company: string | null;
    email: string | null; phone_cell: string | null;
    address: string | null; city: string | null; state: string | null; zip_code: string | null;
  } | null;
  businesses: {
    name: string; logo_url: string | null; city: string | null; state: string | null;
    address: string | null; postal_code: string | null; tax_id: string | null;
    license_number: string | null; email: string | null; phone: string | null;
    website: string | null; invoice_template: unknown;
  } | null;
}

interface JobItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export default function PublicProposalPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const { t: full, locale } = useLang();
  const t = full.proposal;
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get('print') === '1';

  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Client accept & sign / decline (writes through respond_shared_proposal RPC)
  const [signName, setSignName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [respondErr, setRespondErr] = useState<string | null>(null);

  const submitResponse = async (action: 'accepted' | 'declined') => {
    if (!proposal) return;
    if (action === 'accepted' && (!signName.trim() || !signature)) {
      setRespondErr(t.missingFields);
      return;
    }
    if (action === 'declined' && !window.confirm(t.declineConfirm)) return;
    setSubmitting(true);
    setRespondErr(null);
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.rpc('respond_shared_proposal', {
      p_token: token,
      p_action: action,
      p_name: action === 'accepted' ? signName.trim() : null,
      p_signature: action === 'accepted' ? signature : null,
    });
    const res = data as { ok: boolean; error?: string; status?: string } | null;
    if (error || !res?.ok) {
      setRespondErr(res?.error === 'expired' ? t.expiredNotice : t.respondError);
      setSubmitting(false);
      return;
    }
    setProposal(prev => prev ? {
      ...prev,
      status: res.status!,
      client_response: action,
      client_responded_at: new Date().toISOString(),
      client_signed_name: action === 'accepted' ? signName.trim() : prev.client_signed_name,
      client_signature: action === 'accepted' ? signature : prev.client_signature,
    } : prev);
    setSubmitting(false);
  };

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseClient();
      // Token-gated RPC (061): anon has no direct read on jobs/job_items —
      // the function returns only the proposal matching this token, as
      // { job: {…, clients, businesses}, items: [...] }.
      const { data } = await supabase.rpc('get_shared_proposal', { p_token: token });

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const payload = data as { job: ProposalData; items: JobItem[] };
      setProposal(payload.job);
      setItems(payload.items ?? []);
      setLoading(false);
    };
    load();
  }, [token]);

  useEffect(() => {
    if (!loading && proposal && autoPrint) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, proposal, autoPrint]);

  // Name the tab (and the "Save as PDF" default filename) after the estimate #.
  useEffect(() => {
    const num = (proposal?.estimate_number ?? '').trim();
    if (!num) return;
    const prev = document.title;
    document.title = num;
    return () => { document.title = prev; };
  }, [proposal]);

  // Build the themed estimate document (same engine as invoices). Estimate mode
  // sets the title to "Estimate", treats the expiry as "valid until", and shows
  // the description / terms / approval-signature blocks.
  const vm = useMemo(() => {
    if (!proposal) return null;
    const biz = proposal.businesses;
    const client = proposal.clients;
    const itemSum = items.reduce((s, i) => s + i.total, 0);
    const accepted = ['accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'].includes(proposal.status);
    const branding: InvoiceBranding = {
      name: biz?.name ?? t.defaultBizName,
      logoUrl: biz?.logo_url ?? null,
      city: biz?.city ?? null, state: biz?.state ?? null,
      address: biz?.address ?? null, postalCode: biz?.postal_code ?? null,
      taxId: biz?.tax_id ?? null, licenseNumber: biz?.license_number ?? null,
      email: biz?.email ?? null, phone: biz?.phone ?? null, website: biz?.website ?? null,
    };
    const docData: InvoiceDocData = {
      invoiceNumber: proposal.estimate_number ?? '',
      status: 'draft',
      issueDate: proposal.issue_date ?? '',
      dueDate: proposal.expiry_date ?? null,
      lineItems: items.map(i => ({ description: i.description, qty: i.quantity, rate: i.unit_price })),
      subtotalAmount: proposal.subtotal_amount > 0 ? proposal.subtotal_amount : itemSum,
      taxRate: proposal.tax_rate ?? 0,
      taxAmount: proposal.tax_amount ?? 0,
      totalAmount: proposal.total_amount > 0 ? proposal.total_amount : itemSum,
      notes: null,
      language: invoiceDefaultLanguage(biz?.invoice_template, locale),
      clients: client
        ? [{
            firstName: client.first_name, lastName: client.last_name, company: client.company ?? null,
            email: client.email ?? null, phoneCell: client.phone_cell ?? null,
            address: client.address ?? null, city: client.city ?? null, state: client.state ?? null, zip: client.zip_code ?? null,
          }]
        : [],
      docType: 'estimate',
      estimateDescription: proposal.description,
      estimateTerms: proposal.notes,
      estimatePreparedBy: proposal.created_by_name,
      estimateSignature: accepted && proposal.client_signature
        ? {
            image: proposal.client_signature,
            line: t.signedByLine
              .replace('{{name}}', proposal.client_signed_name ?? '')
              .replace('{{date}}', proposal.client_responded_at ? formatDateTimeLong(proposal.client_responded_at, t.dateLocale) : ''),
          }
        : null,
    };
    return buildInvoiceViewModel(resolveConfig(null, biz?.invoice_template ?? null), docData, branding);
  }, [proposal, items, locale, t]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );

  if (notFound || !proposal) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-lg font-semibold text-gray-900 mb-1">{t.notFound}</p>
        <p className="text-sm text-gray-400">{t.notFoundSub}</p>
      </div>
    </div>
  );

  const isAccepted = ['accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'].includes(proposal.status);
  const isDeclined = proposal.status === 'declined';
  const isExpired = !!proposal.expiry_date && new Date(proposal.expiry_date) < new Date();
  const canRespond = ['proposal', 'sent'].includes(proposal.status) && !isExpired;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Full-bleed on print so the theme decoration reaches the sheet edges. */}
      <style>{'@media print{@page{margin:10mm}.inv-doc-page{aspect-ratio:auto!important;overflow:visible!important;display:block!important}.inv-doc-page>*{flex:0 0 auto!important}}'}</style>
      <div className="max-w-3xl mx-auto py-10 px-6 print:py-0 print:px-0 print:max-w-none">
        {/* Themed estimate document — same engine/theme as invoices. */}
        <div className="bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 shadow-sm print:shadow-none overflow-hidden mb-6 print:mb-0">
          {vm ? <InvoiceDocument vm={vm} /> : null}
        </div>

        {/* Accepted (no signature on file — accepted manually by the business) */}
        {isAccepted && !proposal.client_signature && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5 mb-6 print:hidden">
            <p className="text-sm font-semibold text-emerald-700">✓ {t.acceptedBanner}</p>
          </div>
        )}

        {/* Declined */}
        {isDeclined && (
          <div className="bg-red-50 rounded-2xl border border-red-100 p-5 mb-6 print:hidden">
            <p className="text-sm font-semibold text-red-600">{t.declinedNotice}</p>
          </div>
        )}

        {/* Expired — no longer respondable */}
        {!isAccepted && !isDeclined && isExpired && (
          <div className="bg-orange-50 rounded-2xl border border-orange-100 p-5 mb-6 print:hidden">
            <p className="text-sm font-semibold text-orange-600">{t.expiredNotice}</p>
          </div>
        )}

        {/* Accept & sign / decline form */}
        {canRespond && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 print:hidden">
            <h2 className="text-base font-bold text-gray-900 mb-1">{t.approveTitle}</h2>
            <p className="text-sm text-gray-500 mb-4">{t.approveHint}</p>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t.nameLabel}</label>
            <input
              type="text"
              value={signName}
              onChange={e => setSignName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 mb-4 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{t.signLabel}</label>
            <SignaturePad hint={t.signHint} clearLabel={t.clearSignature} onChange={setSignature}/>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">{t.signDisclaimer}</p>
            {respondErr && <p className="text-sm text-red-600 mt-3">{respondErr}</p>}
            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button
                onClick={() => submitResponse('accepted')}
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {t.acceptButton}
              </button>
              <button
                onClick={() => submitResponse('declined')}
                disabled={submitting}
                className="px-6 py-3 text-sm font-semibold text-red-600 rounded-xl border border-red-200 hover:bg-red-50 disabled:opacity-60 transition-colors">
                {t.declineButton}
              </button>
            </div>
          </div>
        )}

        {/* Print button (hidden in print) */}
        <div className="text-center print:hidden mt-8">
          <button onClick={() => window.print()}
            className="px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors">
            {t.printButton}
          </button>
        </div>
      </div>
    </div>
  );
}
