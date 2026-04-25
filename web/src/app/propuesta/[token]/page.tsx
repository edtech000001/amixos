'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';

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

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseClient();
      const { data: job } = await supabase
        .from('jobs')
        .select('id, title, description, estimate_number, status, issue_date, expiry_date, scheduled_date, subtotal_amount, tax_rate, tax_amount, discount, total_amount, notes, clients(first_name, last_name, company), businesses(name, logo_url, city, state)')
        .eq('share_token', token)
        .single();

      if (!job) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProposal(job as ProposalData);

      const { data: jobItems } = await supabase
        .from('job_items')
        .select('id, description, quantity, unit_price, total')
        .eq('job_id', job.id)
        .order('created_at');

      setItems(jobItems ?? []);
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

  const fmtDateLong = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });

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
