'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignaturePad } from '@/components/SignaturePad';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { formatDateLong, formatDateTimeLong } from '@amixos/shared/lib/format';

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
  clients: { first_name: string; last_name: string; company: string | null } | null;
  businesses: { name: string; logo_url: string | null; city: string; state: string } | null;
}

interface JobItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PublicProposalPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const { t: full } = useLang();
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

  const biz = proposal.businesses;
  const client = proposal.clients;
  const clientName = client ? `${client.first_name} ${client.last_name}` : null;
  const hasFinancials = proposal.tax_rate > 0 || proposal.discount > 0;

  const fmtDateLong = (d: string) => formatDateLong(d, t.dateLocale);

  const isAccepted = ['accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'].includes(proposal.status);
  const isDeclined = proposal.status === 'declined';
  const isExpired = !!proposal.expiry_date && new Date(proposal.expiry_date) < new Date();
  const canRespond = ['proposal', 'sent'].includes(proposal.status) && !isExpired;

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="max-w-3xl mx-auto py-10 px-6 print:py-0 print:px-0">
        {/* Header */}
        <div className="bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 shadow-sm print:shadow-none p-8 mb-6 print:mb-4">
          <div className="flex items-start justify-between mb-6">
            <div>
              {biz?.logo_url && (
                <img src={biz.logo_url} alt={biz.name} className="h-12 mb-3 object-contain"/>
              )}
              <h2 className="text-lg font-bold text-gray-900">{biz?.name ?? t.defaultBizName}</h2>
              {biz && <p className="text-sm text-gray-500">{biz.city}, {biz.state}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-gray-400 mb-1">{proposal.estimate_number}</p>
              <h1 className="text-xl font-bold text-gray-900">{t.proposalLabel}</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 border-t border-gray-100 pt-5">
            <div>
              <p className="text-xs text-gray-400 mb-1">{t.client}</p>
              <p className="text-sm font-semibold text-gray-900">
                {clientName ?? t.noClient}
                {client?.company && <span className="text-gray-400 font-normal"> · {client.company}</span>}
              </p>
              {proposal.created_by_name && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 mb-1">{t.preparedBy}</p>
                  <p className="text-sm font-medium text-gray-900">{proposal.created_by_name}</p>
                </div>
              )}
            </div>
            <div className="text-right">
              {proposal.issue_date && (
                <div className="mb-2">
                  <p className="text-xs text-gray-400">{t.issueDate}</p>
                  <p className="text-sm font-medium text-gray-900">{fmtDateLong(proposal.issue_date)}</p>
                </div>
              )}
              {proposal.expiry_date && (
                <div className="mb-2">
                  <p className="text-xs text-gray-400">{t.validUntil}</p>
                  <p className="text-sm font-medium text-gray-900">{fmtDateLong(proposal.expiry_date)}</p>
                </div>
              )}
              {proposal.scheduled_date && (
                <div>
                  <p className="text-xs text-gray-400">{t.scheduledDate}</p>
                  <p className="text-sm font-medium text-gray-900">{fmtDateLong(proposal.scheduled_date)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {proposal.description && (
          <div className="bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 print:border-b shadow-sm print:shadow-none p-6 mb-6 print:mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.description}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{proposal.description}</p>
          </div>
        )}

        {/* Line items */}
        <div className="bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 shadow-sm print:shadow-none overflow-hidden mb-6 print:mb-4">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">{t.services}</h2>
          </div>

          {items.length > 0 ? (
            <>
              <div className="grid grid-cols-[1fr_60px_80px_90px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-2 border-b border-gray-50">
                <span>{t.colDescription}</span>
                <span className="text-center">{t.colQuantity}</span>
                <span className="text-right">{t.colUnitPrice}</span>
                <span className="text-right">{t.colTotal}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[1fr_60px_80px_90px] items-center px-6 py-3">
                    <span className="text-sm text-gray-900">{item.description}</span>
                    <span className="text-sm text-center text-gray-600">{item.quantity}</span>
                    <span className="text-sm text-right text-gray-600">${fmtMoney(item.unit_price)}</span>
                    <span className="text-sm text-right font-semibold text-gray-900">${fmtMoney(item.total)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">{t.noItems}</div>
          )}

          {/* Totals */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
            <div className="w-56 flex flex-col gap-1.5">
              {hasFinancials ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t.subtotal}</span>
                    <span>${fmtMoney(proposal.subtotal_amount)}</span>
                  </div>
                  {proposal.tax_rate > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t.tax} ({proposal.tax_rate}%)</span>
                      <span>${fmtMoney(proposal.tax_amount)}</span>
                    </div>
                  )}
                  {proposal.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t.discount}</span>
                      <span className="text-emerald-600">-${fmtMoney(proposal.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                    <span>{t.total}</span>
                    <span>${fmtMoney(proposal.total_amount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-base font-bold">
                  <span>{t.total}</span>
                  <span>${fmtMoney(proposal.total_amount)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes for client */}
        {proposal.notes && (
          <div className="bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 shadow-sm print:shadow-none p-6 mb-6 print:mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.termsTitle}</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{proposal.notes}</p>
          </div>
        )}

        {/* Client approval — signed proof (kept visible in print as record) */}
        {isAccepted && proposal.client_signature && (
          <div className="bg-white rounded-2xl print:rounded-none border border-emerald-200 print:border-0 print:border-t shadow-sm print:shadow-none p-6 mb-6 print:mb-4">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">{t.signatureTitle}</p>
            <div className="bg-gray-50 print:bg-white rounded-xl border border-gray-100 p-3 mb-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proposal.client_signature} alt="" className="h-16 object-contain"/>
            </div>
            <p className="text-sm text-gray-600">
              {t.signedByLine
                .replace('{{name}}', proposal.client_signed_name ?? '')
                .replace('{{date}}', proposal.client_responded_at ? formatDateTimeLong(proposal.client_responded_at, t.dateLocale) : '')}
            </p>
          </div>
        )}

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
