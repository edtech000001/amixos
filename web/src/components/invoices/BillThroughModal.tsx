'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Building2, FilePlus2, UserPlus, Search, AlertTriangle, CheckCircle, ExternalLink, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import { formatDateLong } from '@amixos/shared/lib/format';
import {
  billInvoiceThrough,
  copyClientToBusiness,
  openInvoicesForClient,
  searchTargetClients,
  suggestTargetClients,
  type BillThroughClient,
  type BillThroughResult,
  type BillThroughTarget,
  type ClientMatch,
  type OpenInvoice,
  removeBillThrough,
  type BillThroughLink,
} from '@amixos/shared/lib/invoiceBillThrough';

type Supa = Parameters<typeof billInvoiceThrough>[0];

export interface BillThroughLine {
  name: string;
  qty: number;
  rate: number;
  excluded?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  supabase: Supa;
  sourceBusinessId: string;
  sourceInvoiceId: string;
  sourceClientId: string | null;
  /** Display names already resolved the way the invoice screen shows them. */
  lines: BillThroughLine[];
  targets: BillThroughTarget[];
  /** Switch to the target business and open the invoice. */
  onOpenTarget: (businessId: string, invoiceId: string) => void;
  /** Set when this invoice is already billed through somewhere. The modal then
   *  opens on the linked step instead of the picker — one company at a time. */
  existingLink?: BillThroughLink | null;
}

type Step = 'linked' | 'company' | 'client' | 'invoice' | 'lines' | 'done';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const clientName = (c: BillThroughClient) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || '—';

/**
 * "Bill through another company" (migration 240) — web twin of the mobile
 * BillThroughSheet: company → client (suggested match, search, or copy) →
 * invoice (open one or new) → which lines.
 */
export function BillThroughModal({
  open,
  onClose,
  supabase,
  sourceBusinessId,
  sourceInvoiceId,
  sourceClientId,
  lines,
  targets,
  onOpenTarget,
  existingLink,
}: Props) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices.billThrough;
  const tStatus = full.dashboard.invoiceStatus as Record<string, string>;

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('company');
  const [target, setTarget] = useState<BillThroughTarget | null>(null);
  const [matches, setMatches] = useState<ClientMatch[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BillThroughClient[]>([]);
  const [client, setClient] = useState<BillThroughClient | null>(null);
  const [copyClient, setCopyClient] = useState(false);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[] | null>(null);
  const [invoice, setInvoice] = useState<OpenInvoice | 'new' | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ businessId: string; invoiceId: string; invoiceNumber: string } | null>(null);
  // Removing an existing link. The confirm renders inline rather than as a
  // second dialog, matching how this modal already handles confirmations.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);

  const doRemoveLink = async () => {
    if (!existingLink) return;
    setRemoving(true); setError('');
    const res = await removeBillThrough(supabase, {
      sourceInvoiceId,
      targetInvoiceId: existingLink.invoice_id,
    });
    setRemoving(false);
    if (!res.ok) { setError(t.removeFailed); setConfirmRemove(false); return; }
    setRemoved(
      (res.invoiceDeleted ? t.removedDeleted : t.removed)
        .replace('{{invoice}}', existingLink.invoice_number),
    );
  };


  // Reset on every open; pre-pick the only company and all included lines.
  useEffect(() => {
    if (!open) return;
    setEnabled(null);
    setTarget(targets.length === 1 ? targets[0] : null);
    setStep(existingLink ? 'linked' : targets.length === 1 ? 'client' : 'company');
    setConfirmRemove(false); setRemoving(false); setRemoved(null);
    setMatches(null); setQuery(''); setResults([]); setClient(null); setCopyClient(false);
    setOpenInvoices(null); setInvoice(null); setBusy(false); setDuplicate(false); setError(''); setResult(null);
    setPicked(new Set(lines.map((l, i) => (l.excluded ? -1 : i)).filter(i => i >= 0)));
    // Read the opt-in here, not from the app-wide business query: selecting a
    // column that isn't migrated yet would break loading for everyone.
    void supabase.from('businesses').select('allow_bill_through').eq('id', sourceBusinessId).single()
      .then(({ data }: { data: { allow_bill_through?: boolean } | null }) => setEnabled(!!data?.allow_bill_through));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    setMatches(null);
    void suggestTargetClients(supabase, target.id, sourceClientId).then(setMatches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  useEffect(() => {
    if (!target || !query.trim()) { setResults([]); return; }
    const h = setTimeout(() => { void searchTargetClients(supabase, target.id, query).then(setResults); }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target?.id]);

  useEffect(() => {
    if (step !== 'invoice' || !target) return;
    if (copyClient || !client) { setOpenInvoices([]); return; }
    setOpenInvoices(null);
    void openInvoicesForClient(supabase, target.id, client.id).then(setOpenInvoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, target?.id, client?.id, copyClient]);

  const pickedTotal = useMemo(
    () => lines.reduce((s, l, i) => (picked.has(i) ? s + (Number(l.qty) || 0) * (Number(l.rate) || 0) : s), 0),
    [lines, picked],
  );

  const back = () => {
    setError(''); setDuplicate(false);
    if (step === 'lines') setStep('invoice');
    else if (step === 'invoice') setStep('client');
    else if (step === 'client' && targets.length > 1) setStep('company');
  };
  const canGoBack = step === 'lines' || step === 'invoice' || (step === 'client' && targets.length > 1);

  const submit = async (allowDuplicate = false) => {
    if (!target || !invoice || picked.size === 0) return;
    setBusy(true); setError('');
    let clientId = client?.id ?? null;
    if (copyClient && sourceClientId) {
      clientId = await copyClientToBusiness(supabase, sourceClientId, target.id);
      if (!clientId) { setBusy(false); setError(t.failed.replace('{{error}}', 'client')); return; }
      // Copied once — a retry (e.g. after the duplicate prompt) reuses it.
      setClient({ id: clientId, firstName: '', lastName: '', company: null, city: null, state: null, phone: null, email: null });
      setCopyClient(false);
    }
    if (!clientId) { setBusy(false); return; }
    const res = await billInvoiceThrough(supabase, {
      sourceInvoiceId,
      lineIndexes: Array.from(picked),
      targetBusinessId: target.id,
      targetClientId: clientId,
      targetInvoiceId: invoice === 'new' ? null : invoice.id,
      allowDuplicate,
    });
    setBusy(false);
    if (res.ok === true) { setResult(res); setStep('done'); return; }
    // Explicit narrow — strict is off, so `res.ok` alone doesn't discriminate.
    const fail = res as Extract<BillThroughResult, { ok: false }>;
    if (fail.error === 'duplicate') { setDuplicate(true); return; }
    if (fail.error === 'not_allowed') { setEnabled(false); return; }
    setError(t.failed.replace('{{error}}', fail.message ?? fail.error));
  };

  const stepTitle =
    step === 'company' ? t.stepCompany
    : step === 'client' ? t.stepClient
    : step === 'invoice' ? t.stepInvoice
    : t.stepLines;

  const rowCls = (selected: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border-soft bg-card hover:bg-surface'}`;

  const reasonLabel = (m: ClientMatch) =>
    m.reason === 'email' ? t.reasonEmail : m.reason === 'phone' ? t.reasonPhone : m.reason === 'name' ? t.reasonName : t.reasonCompany;

  const clientRow = (cl: BillThroughClient, badge?: string) => (
    <button
      key={cl.id}
      type="button"
      onClick={() => { setClient(cl); setCopyClient(false); setInvoice(null); setStep('invoice'); }}
      className={rowCls(client?.id === cl.id && !copyClient)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{clientName(cl)}</p>
        <p className="text-xs text-faint truncate">
          {[cl.company, [cl.city, cl.state].filter(Boolean).join(', '), cl.phone ?? cl.email].filter(Boolean).join(' · ')}
        </p>
      </div>
      {badge ? <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-600 shrink-0">{badge}</span> : null}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title={step === 'linked' ? t.linkedTitle : t.title} size="lg"
      headerAction={canGoBack && enabled ? (
        <button type="button" onClick={back} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-border-soft text-sm text-muted">
          <ArrowLeft size={15} /> {t.back}
        </button>
      ) : undefined}
    >
      {enabled === null ? (
        <div className="py-10 flex justify-center"><span className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : !enabled ? (
        <div className="flex gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <p className="text-sm text-ink">{t.notEnabled}</p>
        </div>
      ) : removed ? (
        <div className="py-6 flex flex-col items-center gap-3 text-center">
          <CheckCircle size={36} className="text-emerald-500" />
          <p className="text-base font-semibold text-ink">{removed}</p>
          <button type="button" onClick={onClose} className="mt-2 px-4 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90">
            {full.common.buttons.close}
          </button>
        </div>
      ) : step === 'linked' && existingLink ? (
        /* Already billed through somewhere. The source account can see where
           and undo it from here, instead of switching business and hunting
           for the line. Billing through a second company means removing this
           link first — one at a time. */
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 p-4 rounded-2xl bg-border-soft">
            <Building2 size={18} className="text-muted shrink-0 mt-0.5" />
            <p className="text-sm text-ink">
              {t.linkedBody
                .replace('{{company}}', existingLink.business_name)
                .replace('{{invoice}}', existingLink.invoice_number)}
            </p>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {confirmRemove ? (
            <div className="flex flex-col gap-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-ink">
                {t.removeConfirm
                  .replace('{{company}}', existingLink.business_name)
                  .replace('{{invoice}}', existingLink.invoice_number)}
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={removing} onClick={() => setConfirmRemove(false)}
                  className="px-4 py-2.5 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border disabled:opacity-50">
                  {full.common.buttons.cancel}
                </button>
                <button type="button" disabled={removing} onClick={() => void doRemoveLink()}
                  className="px-4 py-2.5 rounded-xl bg-red-500 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {removing ? t.removing : t.removeConfirmYes}
                </button>
              </div>
            </div>
          ) : (
            /* Right-aligned, the conventional spot for dialog actions —
               reads as actions rather than more body content. Sized to their
               labels: full-width rows read as a list of settings. */
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => onOpenTarget(existingLink.business_id, existingLink.invoice_id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-border-soft hover:bg-border transition-colors">
                <ExternalLink size={15} className="text-muted shrink-0" />
                <span className="text-sm font-semibold text-ink whitespace-nowrap">{t.viewTarget}</span>
              </button>
              <button type="button" onClick={() => setConfirmRemove(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 hover:bg-red-500/10 transition-colors">
                <Trash2 size={15} className="text-red-500 shrink-0" />
                <span className="text-sm font-semibold text-red-500 whitespace-nowrap">{t.removeLink}</span>
              </button>
            </div>
          )}
        </div>
      ) : step === 'done' && result && target ? (
        <div className="py-6 flex flex-col items-center gap-3 text-center">
          <CheckCircle size={36} className="text-emerald-500" />
          <p className="text-base font-semibold text-ink">
            {t.done.replace('{{company}}', target.name).replace('{{invoice}}', result.invoiceNumber)}
          </p>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border">
              {full.common.buttons.close}
            </button>
            <button type="button" onClick={() => onOpenTarget(result.businessId, result.invoiceId)} className="px-4 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90">
              {t.openTarget}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <p className="text-sm text-muted mb-3">{t.subtitle}</p>
          {target && step !== 'company' ? (
            <p className="text-xs text-muted mb-3 truncate">
              {[target.name, client && !copyClient ? clientName(client) : null, invoice && step === 'lines' ? (invoice === 'new' ? t.newInvoice : invoice.invoiceNumber) : null]
                .filter(Boolean).join('  ›  ')}
            </p>
          ) : null}
          <p className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">{stepTitle}</p>

          {step === 'company' ? (
            <div className="flex flex-col gap-2">
              {targets.map(b => (
                <button key={b.id} type="button" onClick={() => { setTarget(b); setClient(null); setInvoice(null); setStep('client'); }} className={rowCls(target?.id === b.id)}>
                  <span className="w-9 h-9 rounded-xl bg-border-soft flex items-center justify-center shrink-0"><Building2 size={18} className="text-muted" /></span>
                  <span className="text-sm font-semibold text-ink">{b.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 'client' && target ? (
            <div className="flex flex-col gap-2">
              {matches === null ? (
                <div className="py-4 flex justify-center"><span className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
              ) : matches.length ? (
                matches.map((m, i) => clientRow(m, i === 0 ? `${t.suggested} · ${reasonLabel(m)}` : reasonLabel(m)))
              ) : (
                <p className="text-sm text-muted mb-1">{t.noMatch.replace('{{company}}', target.name)}</p>
              )}
              <label className="flex items-center gap-2 px-3 rounded-xl border border-border bg-surface mt-1">
                <Search size={15} className="text-faint" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="flex-1 py-2.5 bg-transparent text-sm text-ink placeholder-faint focus:outline-none"
                />
              </label>
              {results.filter(r => !matches?.some(m => m.id === r.id)).map(r => clientRow(r))}
              {sourceClientId ? (
                <button type="button" onClick={() => { setCopyClient(true); setClient(null); setInvoice('new'); setStep('lines'); }} className={rowCls(copyClient)}>
                  <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><UserPlus size={18} className="text-primary" /></span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">{t.copyClient.replace('{{company}}', target.name)}</span>
                    <span className="block text-xs text-faint">{t.copyClientHint}</span>
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}

          {step === 'invoice' ? (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => { setInvoice('new'); setStep('lines'); }} className={rowCls(invoice === 'new')}>
                <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><FilePlus2 size={18} className="text-primary" /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink">{t.newInvoice}</span>
                  <span className="block text-xs text-faint">{t.newInvoiceHint}</span>
                </span>
              </button>
              <p className="text-[11px] font-semibold text-faint uppercase tracking-wide mt-2">{t.openInvoicesHeading}</p>
              {openInvoices === null ? (
                <div className="py-4 flex justify-center"><span className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
              ) : openInvoices.length === 0 ? (
                <p className="text-sm text-faint">{t.noOpenInvoices}</p>
              ) : openInvoices.map(inv => (
                <button key={inv.id} type="button" onClick={() => { setInvoice(inv); setStep('lines'); }} className={rowCls(invoice !== 'new' && invoice?.id === inv.id)}>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">{inv.invoiceNumber}</span>
                    <span className="block text-xs text-faint">
                      {[tStatus[inv.status] ?? inv.status, inv.issueDate ? formatDateLong(inv.issueDate, locale === 'en' ? 'en-US' : 'es-MX') : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-ink">{fmt(inv.totalAmount)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 'lines' && target ? (
            <>
              <button
                type="button"
                onClick={() => setPicked(prev => (prev.size === lines.length ? new Set() : new Set(lines.map((_, i) => i))))}
                className="self-start mb-1 text-xs font-semibold text-primary hover:underline"
              >
                {t.selectAll}
              </button>
              {/* gap, not border-b: the rows are rounded fills now, so a
                  divider would cut across the hover highlight. */}
              <div className="flex flex-col gap-0.5">
                {lines.map((l, i) => {
                  const on = picked.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPicked(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-surface transition-colors"
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                        {on ? <Check size={13} className="text-white" /> : null}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm ${l.excluded ? 'text-faint' : 'text-ink'}`}>{l.name}</span>
                        <span className="block text-xs text-faint">{l.qty} × {fmt(l.rate)}</span>
                      </span>
                      <span className="text-sm font-semibold text-ink">{fmt((Number(l.qty) || 0) * (Number(l.rate) || 0))}</span>
                    </button>
                  );
                })}
              </div>

              {duplicate ? (
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm font-semibold text-ink">{t.duplicateTitle}</p>
                  <p className="text-xs text-muted mt-0.5">{t.duplicateMessage.replace('{{invoice}}', invoice && invoice !== 'new' ? invoice.invoiceNumber : '')}</p>
                  <button type="button" onClick={() => { setDuplicate(false); void submit(true); }} className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/20 text-xs font-semibold text-amber-700 hover:bg-amber-500/30">
                    {t.duplicateConfirm}
                  </button>
                </div>
              ) : null}
              {error ? <p className="text-sm text-red-500 mt-2">{error}</p> : null}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || picked.size === 0}
                className="mt-4 py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50 flex flex-col items-center"
              >
                <span className="text-sm">{busy ? t.working : t.confirmBtn.replace('{{company}}', target.name)}</span>
                {!busy ? (
                  <span className="text-xs text-white/80 font-normal">
                    {(picked.size === 1 ? t.linesSelectedOne : t.linesSelected)
                        .replace('{{count}}', String(picked.size))
                        .replace('{{amount}}', fmt(pickedTotal))}
                  </span>
                ) : null}
              </button>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
