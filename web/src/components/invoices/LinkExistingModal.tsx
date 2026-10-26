'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Building2, Search, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { formatDateLong } from '@amixos/shared/lib/format';
import {
  invoicesToLink,
  linkCandidates,
  linkExistingBillThrough,
  type BillThroughTarget,
  type LinkableInvoice,
  type LinkCandidateLine,
} from '@amixos/shared/lib/invoiceBillThrough';

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * "Link to an invoice already sent" — pair this (source) invoice with one the
 * other company already billed by hand. company → their invoice → which of
 * its lines are ours (matches pre-checked) → link. Nothing is copied.
 * Mobile twin: mobile/components/LinkExistingSheet.tsx.
 */
export function LinkExistingModal({
  open,
  onClose,
  sourceInvoiceId,
  targets,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  sourceInvoiceId: string;
  targets: BillThroughTarget[];
  onLinked: () => void;
}) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices.billThrough;
  const supabase = createSupabaseClient();
  const dateLoc = locale === 'es' ? 'es-MX' : 'en-US';

  const [company, setCompany] = useState<BillThroughTarget | null>(null);
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState<LinkableInvoice[] | null>(null);
  const [target, setTarget] = useState<LinkableInvoice | null>(null);
  const [lines, setLines] = useState<LinkCandidateLine[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompany(targets.length === 1 ? targets[0] : null);
    setSearch(''); setInvoices(null); setTarget(null); setLines(null); setPicked(new Set()); setError(null);
  }, [open, targets]);

  useEffect(() => {
    if (!open || !company || target) return;
    let active = true;
    setInvoices(null);
    const id = setTimeout(() => {
      void invoicesToLink(supabase, company.id, search).then(r => { if (active) setInvoices(r); });
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company, search, target]);

  const pickInvoice = async (inv: LinkableInvoice) => {
    setTarget(inv);
    setLines(null);
    const r = await linkCandidates(supabase, sourceInvoiceId, inv.id);
    setLines(r ?? []);
    setPicked(new Set((r ?? []).filter(l => l.suggested && !l.taken).map(l => l.index)));
  };

  const back = () => {
    setError(null);
    if (target) { setTarget(null); setLines(null); return; }
    if (company && targets.length > 1) setCompany(null);
  };

  const confirm = async () => {
    if (!target || !picked.size) return;
    setBusy(true); setError(null);
    const res = await linkExistingBillThrough(supabase, { sourceInvoiceId, targetInvoiceId: target.id, lineIndexes: Array.from(picked) });
    setBusy(false);
    if (!res.ok) { setError(t.linkFailed); return; }
    onLinked();
    onClose();
  };

  const step = !company ? 'company' : !target ? 'invoice' : 'lines';
  const canGoBack = step === 'lines' || (step === 'invoice' && targets.length > 1);

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={t.linkTitle} size="md">
      <div className="flex flex-col gap-3">
        {canGoBack ? (
          <button type="button" onClick={back} className="self-start flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft size={14} /> {t.linkBack}
          </button>
        ) : null}

        {step === 'company' ? (
          <>
            <p className="text-sm text-muted">{t.linkIntro}</p>
            <p className="text-sm font-semibold text-ink">{t.linkPickCompany}</p>
            <div className="flex flex-col gap-2">
              {targets.map(b => (
                <button key={b.id} type="button" onClick={() => setCompany(b)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-surface text-left">
                  <Building2 size={16} className="text-muted" />
                  <span className="flex-1 text-sm text-ink">{b.name}</span>
                  <ChevronRight size={14} className="text-faint" />
                </button>
              ))}
            </div>
          </>
        ) : step === 'invoice' ? (
          <>
            {targets.length === 1 ? <p className="text-sm text-muted">{t.linkIntro}</p> : null}
            <p className="text-sm font-semibold text-ink">{t.linkPickInvoice} · {company?.name}</p>
            <div className="flex items-center gap-2 px-3 rounded-xl border border-border">
              <Search size={14} className="text-faint" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.linkSearch}
                className="flex-1 py-2 text-sm bg-transparent focus:outline-none" />
            </div>
            <div className="max-h-80 overflow-y-auto">
              {invoices === null ? (
                <p className="text-sm text-faint text-center py-6">…</p>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-faint text-center py-6">{t.linkEmpty}</p>
              ) : invoices.map(inv => (
                <button key={inv.id} type="button" onClick={() => void pickInvoice(inv)}
                  className="w-full flex items-center gap-3 py-2.5 border-b border-border-soft hover:bg-surface text-left">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-ink">{inv.invoiceNumber}</span>
                    <span className="block text-xs text-faint truncate">
                      {[inv.clientName, inv.issueDate ? formatDateLong(inv.issueDate, dateLoc) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-ink">{money(inv.totalAmount)}</span>
                  <ChevronRight size={14} className="text-faint" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold text-ink">{t.linkPickLines} · {target?.invoiceNumber}</p>
              <p className="text-xs text-muted">{t.linkLinesHint}</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {lines === null ? (
                <p className="text-sm text-faint text-center py-6">…</p>
              ) : lines.map(l => {
                const on = picked.has(l.index);
                return (
                  <button key={l.index} type="button" disabled={l.taken}
                    onClick={() => setPicked(prev => { const n = new Set(prev); if (n.has(l.index)) n.delete(l.index); else n.add(l.index); return n; })}
                    className={`w-full flex items-center gap-3 py-2 border-b border-border-soft text-left ${l.taken ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface'}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                      {on ? <Check size={11} className="text-white" /> : null}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink">{l.description || '—'}</span>
                      <span className="block text-xs text-faint">{l.taken ? t.linkTaken : `${l.qty} × ${money(l.rate)}`}</span>
                    </span>
                    <span className="text-sm font-semibold text-ink">{money(l.qty * l.rate)}</span>
                  </button>
                );
              })}
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end">
              <button type="button" onClick={() => void confirm()} disabled={busy || !picked.size}
                className="px-4 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? '…' : `${t.linkConfirm} (${picked.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
