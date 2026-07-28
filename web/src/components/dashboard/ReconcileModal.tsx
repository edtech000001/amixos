'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { createSupabaseClient } from '@/lib/supabase';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { linkLineToJob } from '@amixos/shared/lib/invoicing';
import { JobPreviewSheet } from '@amixos/shared/screens/dashboard/JobPreviewSheet';
import {
  buildReconcileProposals,
  type OrphanJob,
  type UnlinkedLine,
  type ReconcileProposal,
} from '@amixos/shared/lib/reconcile';

interface Props {
  open: boolean;
  businessId: string;
  locale: 'es' | 'en';
  onClose: () => void;
}

type Phase = 'loading' | 'summary' | 'autolinking' | 'review' | 'done';

interface JobRow { id: string; title: string | null; external_ref: string | null; scheduled_date: string | null; client_id: string | null; clients: { first_name: string | null; last_name: string | null; company: string | null } | null }
interface InvRow { id: string; invoice_number: string | null; client_id: string | null; issue_date: string | null; line_items: unknown }

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function ReconcileModal({ open, businessId, locale, onClose }: Props) {
  const es = locale === 'es';
  const supabase = useMemo(() => createSupabaseClient(), []);
  const t = (esStr: string, enStr: string) => (es ? esStr : enStr);

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadMsg, setLoadMsg] = useState('');
  const [proposals, setProposals] = useState<ReconcileProposal[]>([]);
  const [noMatchCount, setNoMatchCount] = useState(0);
  const [autoExact, setAutoExact] = useState(true);

  // Review-queue state
  const [queue, setQueue] = useState<ReconcileProposal[]>([]);
  const [cursor, setCursor] = useState(0);
  const [usedLines, setUsedLines] = useState<Set<string>>(new Set());
  const [linkedCount, setLinkedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [autoProgress, setAutoProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  // Per-step: which alternative line the user chose (else the proposal's primary).
  const [pickedLineKey, setPickedLineKey] = useState<string | null>(null);
  // Job preview sheet (tap the job card to see full details for disambiguation).
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);

  const lineKey = (l: UnlinkedLine) => `${l.invoiceId}#${l.index}`;
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(es ? 'es' : 'en', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadMsg(t('Cargando trabajos…', 'Loading jobs…'));
    // 1) Orphaned completed jobs (not yet on an invoice).
    const jobRows = await fetchAllById<JobRow>((afterId, pageSize) => {
      let q = supabase.from('jobs')
        .select('id, title, external_ref, scheduled_date, client_id, clients(first_name, last_name, company)')
        .eq('business_id', businessId).eq('status', 'completed').is('invoice_id', null)
        .order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q as never;
    });
    const jobs: OrphanJob[] = jobRows.map(j => {
      const cl = Array.isArray(j.clients) ? (j.clients as any)[0] : j.clients;
      return {
        id: j.id,
        title: j.title ?? '',
        externalRef: j.external_ref,
        clientId: j.client_id,
        clientName: (cl?.company || `${cl?.first_name ?? ''} ${cl?.last_name ?? ''}`.trim()) || '',
        scheduledDate: j.scheduled_date,
      };
    });

    // 2) Invoices for those jobs' clients (chunked .in()).
    setLoadMsg(t('Cargando facturas…', 'Loading invoices…'));
    const clientIds = Array.from(new Set(jobs.map(j => j.clientId).filter(Boolean))) as string[];
    const invRows: InvRow[] = [];
    for (const ids of chunk(clientIds, 80)) {
      const part = await fetchAllById<InvRow>((afterId, pageSize) => {
        let q = supabase.from('invoices')
          .select('id, invoice_number, client_id, issue_date, line_items')
          .eq('business_id', businessId).in('client_id', ids)
          .order('id', { ascending: true }).limit(pageSize);
        if (afterId) q = q.gt('id', afterId);
        return q as never;
      });
      invRows.push(...part);
    }

    // 3) Pool of UNLINKED lines (no job_id) across those invoices.
    const lines: UnlinkedLine[] = [];
    for (const inv of invRows) {
      const items = (Array.isArray(inv.line_items) ? inv.line_items : []) as { description?: string; qty?: number; rate?: number; job_id?: string | null }[];
      items.forEach((li, index) => {
        if (li.job_id) return;
        const qty = Number(li.qty) || 0;
        const rate = Number(li.rate) || 0;
        lines.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number ?? '',
          index,
          description: li.description ?? '',
          qty,
          rate,
          amount: qty * rate,
          clientId: inv.client_id,
          issueDate: inv.issue_date,
        });
      });
    }

    // 4) Match.
    setLoadMsg(t('Buscando coincidencias…', 'Finding matches…'));
    const all = buildReconcileProposals(jobs, lines);
    const matched = all.filter(p => p.line);
    setProposals(matched);
    setNoMatchCount(all.length - matched.length);
    setPhase('summary');
  }, [supabase, businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) void load(); }, [open, load]);

  const exactCount = proposals.filter(p => p.confidence === 'exact').length;
  const fuzzyCount = proposals.filter(p => p.confidence === 'fuzzy').length;

  // Link one job→line; returns true if it stuck (line not already used).
  const applyLink = async (p: ReconcileProposal, line: UnlinkedLine): Promise<boolean> => {
    if (usedLines.has(lineKey(line))) return false;
    await linkLineToJob(supabase, { invoiceId: line.invoiceId, index: line.index, jobId: p.job.id });
    setUsedLines(prev => new Set(prev).add(lineKey(line)));
    return true;
  };

  const start = async () => {
    setBusy(true);
    const used = new Set<string>();
    let linked = 0;
    if (autoExact) {
      const exact = proposals.filter(p => p.confidence === 'exact' && p.line);
      setPhase('autolinking');
      setAutoProgress({ done: 0, total: exact.length });
      for (let i = 0; i < exact.length; i++) {
        const p = exact[i];
        const l = p.line!;
        if (!used.has(lineKey(l))) {
          await linkLineToJob(supabase, { invoiceId: l.invoiceId, index: l.index, jobId: p.job.id });
          used.add(lineKey(l));
          linked++;
        }
        setAutoProgress({ done: i + 1, total: exact.length });
      }
    }
    setUsedLines(used);
    setLinkedCount(linked);
    // Review queue: fuzzy only when auto-linking exact, else everything.
    const q = autoExact ? proposals.filter(p => p.confidence === 'fuzzy' && p.line) : proposals.filter(p => p.line);
    setQueue(q);
    setCursor(0);
    setPickedLineKey(null);
    setBusy(false);
    setPhase(q.length ? 'review' : 'done');
  };

  const current = queue[cursor];
  const currentLine: UnlinkedLine | null = current
    ? (pickedLineKey ? [current.line!, ...current.alternatives].find(l => lineKey(l) === pickedLineKey) ?? current.line! : current.line!)
    : null;

  const advance = () => {
    const next = cursor + 1;
    setPickedLineKey(null);
    if (next >= queue.length) { setPhase('done'); return; }
    setCursor(next);
  };

  const onContinue = async () => {
    if (!current || !currentLine) return;
    setBusy(true);
    const ok = await applyLink(current, currentLine);
    setBusy(false);
    if (ok) setLinkedCount(c => c + 1); else setSkippedCount(c => c + 1);
    advance();
  };
  const onSkip = () => { setSkippedCount(c => c + 1); advance(); };

  return (
    <Modal open={open} onClose={onClose} title={t('Reconciliar trabajos ↔ facturas', 'Reconcile jobs ↔ invoices')} size="lg">
      {phase === 'loading' && (
        <div className="py-10 text-center text-sm text-muted">{loadMsg || '…'}</div>
      )}

      {phase === 'summary' && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted">
            {t(
              'Encontramos trabajos completados sin factura que coinciden por nombre con líneas de factura sin vincular del mismo cliente.',
              'We found completed jobs with no invoice that match, by name, an unlinked invoice line for the same client.',
            )}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-2xl border border-border-soft p-4 text-center">
              <p className="text-2xl font-bold text-emerald-500">{exactCount}</p>
              <p className="text-xs text-faint mt-1">{t('Exactas (auto)', 'Exact (auto)')}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border-soft p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{fuzzyCount}</p>
              <p className="text-xs text-faint mt-1">{t('Para revisar', 'To review')}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border-soft p-4 text-center">
              <p className="text-2xl font-bold text-faint">{noMatchCount}</p>
              <p className="text-xs text-faint mt-1">{t('Sin coincidencia', 'No match')}</p>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 bg-card rounded-2xl border border-border-soft p-4 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold text-ink">{t('Vincular exactas automáticamente', 'Auto-link exact matches')}</span>
              <span className="block text-xs text-faint mt-0.5">{t('Vincula las coincidencias exactas sin revisión; solo revisas las dudosas.', 'Links exact matches without review; you only step through the uncertain ones.')}</span>
            </span>
            <Toggle checked={autoExact} onChange={setAutoExact} />
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} fullWidth>{t('Cerrar', 'Close')}</Button>
            <Button onClick={start} loading={busy} disabled={exactCount + fuzzyCount === 0} fullWidth>
              {t('Empezar', 'Start')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'autolinking' && (
        <div className="py-10 text-center">
          <p className="text-sm text-muted mb-2">{t('Vinculando exactas…', 'Linking exact matches…')}</p>
          <p className="text-2xl font-bold text-ink">{autoProgress.done} / {autoProgress.total}</p>
        </div>
      )}

      {phase === 'review' && current && currentLine && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-faint">
              {cursor + 1} / {queue.length}
              <span className="text-emerald-500 ml-2">· {linkedCount} {t('vinculados', 'linked')}</span>
            </p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${current.confidence === 'exact' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
              {current.confidence === 'exact' ? t('EXACTA', 'EXACT') : t('REVISAR', 'REVIEW')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setPreviewJobId(current.job.id)}
              className="bg-card rounded-2xl border border-border-soft p-4 text-left hover:border-primary/40 hover:bg-surface transition-colors">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-faint mb-1">{t('Trabajo', 'Job')} ›</p>
              <p className="text-sm font-semibold text-primary">{current.job.title}</p>
              {current.job.externalRef ? <p className="text-xs font-mono text-faint mt-0.5">{current.job.externalRef}</p> : null}
              <p className="text-xs text-muted mt-1">{current.job.clientName}</p>
              {current.job.scheduledDate ? <p className="text-xs text-faint mt-0.5">{fmtDate(current.job.scheduledDate)}</p> : null}
            </button>
            <div className="bg-card rounded-2xl border border-border-soft p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-faint mb-1">{t('Línea de factura', 'Invoice line')}</p>
              <p className="text-sm font-semibold text-ink">{currentLine.description}</p>
              <p className="text-xs font-mono text-faint mt-0.5">#{currentLine.invoiceNumber}</p>
              {/* Same client as the job (matched by client) — show it for visual parity. */}
              <p className="text-xs text-muted mt-1">{current.job.clientName}</p>
              <p className="text-xs text-muted mt-1">
                {currentLine.qty} × {money(currentLine.rate)} = <span className="font-semibold text-ink">{money(currentLine.amount)}</span>
              </p>
              {currentLine.issueDate ? <p className="text-xs text-faint mt-0.5">{fmtDate(currentLine.issueDate)}</p> : null}
            </div>
          </div>

          {current.alternatives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-1.5">{t('Otras líneas posibles', 'Other possible lines')}</p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {[current.line!, ...current.alternatives].map(l => {
                  const active = lineKey(l) === lineKey(currentLine);
                  return (
                    <button key={lineKey(l)} onClick={() => setPickedLineKey(lineKey(l))}
                      className={`text-left px-3 py-2 rounded-xl text-sm ${active ? 'bg-primary/10 text-primary' : 'hover:bg-surface text-ink'}`}>
                      <span className="block truncate">{l.description}</span>
                      <span className="block text-xs text-faint">#{l.invoiceNumber} · {l.qty} × {money(l.rate)} = {money(l.amount)}{l.issueDate ? ` · ${fmtDate(l.issueDate)}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onSkip} disabled={busy} fullWidth>{t('Saltar', 'Skip')}</Button>
            <Button onClick={onContinue} loading={busy} fullWidth>{t('Continuar', 'Continue')}</Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-col gap-5 py-4 text-center">
          <p className="text-3xl">✅</p>
          <p className="text-sm text-ink">
            {t(`Se vincularon ${linkedCount} trabajos.`, `Linked ${linkedCount} jobs.`)}
            {skippedCount ? ` ${t(`${skippedCount} saltados.`, `${skippedCount} skipped.`)}` : ''}
            {noMatchCount ? ` ${t(`${noMatchCount} sin coincidencia.`, `${noMatchCount} had no match.`)}` : ''}
          </p>
          <Button onClick={onClose} fullWidth>{t('Listo', 'Done')}</Button>
        </div>
      )}

      {/* Tap the job card → full job details for disambiguation. Opens over the
          reconcile modal; "open full" goes to the job in a new tab so the
          reconcile queue isn't disturbed. */}
      <JobPreviewSheet
        supabase={supabase}
        jobId={previewJobId}
        onClose={() => setPreviewJobId(null)}
        onOpenFull={(jid) => { setPreviewJobId(null); window.open(`/dashboard/trabajos/${jid}`, '_blank'); }}
      />
    </Modal>
  );
}
