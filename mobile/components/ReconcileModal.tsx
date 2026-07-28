import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal as RNModal, View, Text, Pressable, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { X } from 'lucide-react-native';
import { Toggle } from '@amixos/shared/ui';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { linkLineToJob } from '@amixos/shared/lib/invoicing';
import {
  buildReconcileProposals,
  type OrphanJob,
  type UnlinkedLine,
  type ReconcileProposal,
} from '@amixos/shared/lib/reconcile';

interface Props {
  open: boolean;
  businessId: string;
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

export function ReconcileModal({ open, businessId, onClose }: Props) {
  const c = useThemeColors();
  const { locale } = useLang();
  const es = locale === 'es';
  const supabase = useMemo(() => createSupabaseClient(), []);
  const t = (esStr: string, enStr: string) => (es ? esStr : enStr);

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadMsg, setLoadMsg] = useState('');
  const [proposals, setProposals] = useState<ReconcileProposal[]>([]);
  const [noMatchCount, setNoMatchCount] = useState(0);
  const [autoExact, setAutoExact] = useState(true);

  const [queue, setQueue] = useState<ReconcileProposal[]>([]);
  const [cursor, setCursor] = useState(0);
  const [usedLines, setUsedLines] = useState<Set<string>>(new Set());
  const [linkedCount, setLinkedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [autoProgress, setAutoProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [pickedLineKey, setPickedLineKey] = useState<string | null>(null);

  const lineKey = (l: UnlinkedLine) => `${l.invoiceId}#${l.index}`;
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(es ? 'es' : 'en', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadMsg(t('Cargando trabajos…', 'Loading jobs…'));
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
    const ok = !usedLines.has(lineKey(currentLine));
    if (ok) {
      await linkLineToJob(supabase, { invoiceId: currentLine.invoiceId, index: currentLine.index, jobId: current.job.id });
      setUsedLines(prev => new Set(prev).add(lineKey(currentLine)));
      setLinkedCount(v => v + 1);
    } else setSkippedCount(v => v + 1);
    setBusy(false);
    advance();
  };
  const onSkip = () => { setSkippedCount(v => v + 1); advance(); };

  const Card = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View className="flex-1 bg-card rounded-2xl border border-border-soft p-3">
      <Text className="text-[10px] font-semibold uppercase tracking-wide text-faint mb-1">{label}</Text>
      {children}
    </View>
  );

  return (
    <RNModal visible={open} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-surface">
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-border-soft">
          <Text className="text-lg font-bold text-ink">{t('Reconciliar', 'Reconcile')}</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={c.faint} /></Pressable>
        </View>

        <ScrollView className="flex-1 px-5 py-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {phase === 'loading' && (
            <View className="py-20 items-center">
              <ActivityIndicator color={c.primary} />
              <Text className="text-sm text-muted mt-3">{loadMsg || '…'}</Text>
            </View>
          )}

          {phase === 'summary' && (
            <View className="gap-4">
              <Text className="text-sm text-muted">{t('Trabajos completados sin factura que coinciden por nombre con líneas sin vincular del mismo cliente.', 'Completed jobs with no invoice that match, by name, an unlinked invoice line for the same client.')}</Text>
              <View className="flex-row gap-3">
                <View className="flex-1 bg-card rounded-2xl border border-border-soft p-4 items-center">
                  <Text className="text-2xl font-bold text-emerald-500">{exactCount}</Text>
                  <Text className="text-[11px] text-faint mt-1">{t('Exactas (auto)', 'Exact (auto)')}</Text>
                </View>
                <View className="flex-1 bg-card rounded-2xl border border-border-soft p-4 items-center">
                  <Text className="text-2xl font-bold text-amber-500">{fuzzyCount}</Text>
                  <Text className="text-[11px] text-faint mt-1">{t('Para revisar', 'To review')}</Text>
                </View>
                <View className="flex-1 bg-card rounded-2xl border border-border-soft p-4 items-center">
                  <Text className="text-2xl font-bold text-faint">{noMatchCount}</Text>
                  <Text className="text-[11px] text-faint mt-1">{t('Sin match', 'No match')}</Text>
                </View>
              </View>
              <View className="flex-row items-center justify-between gap-3 bg-card rounded-2xl border border-border-soft p-4">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">{t('Vincular exactas automáticamente', 'Auto-link exact matches')}</Text>
                  <Text className="text-[11px] text-faint mt-0.5">{t('Vincula las exactas sin revisión; solo revisas las dudosas.', 'Links exact matches without review; you only review the uncertain ones.')}</Text>
                </View>
                <Toggle value={autoExact} onValueChange={setAutoExact} />
              </View>
              <Pressable onPress={start} disabled={busy || exactCount + fuzzyCount === 0} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                <Text className="text-white font-semibold">{t('Empezar', 'Start')}</Text>
              </Pressable>
            </View>
          )}

          {phase === 'autolinking' && (
            <View className="py-20 items-center">
              <Text className="text-sm text-muted mb-2">{t('Vinculando exactas…', 'Linking exact matches…')}</Text>
              <Text className="text-2xl font-bold text-ink">{autoProgress.done} / {autoProgress.total}</Text>
            </View>
          )}

          {phase === 'review' && current && currentLine && (
            <View className="gap-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-faint">{cursor + 1} / {queue.length}<Text className="text-emerald-500">  · {linkedCount} {t('vinculados', 'linked')}</Text></Text>
                <View className={`px-2 py-0.5 rounded-full ${current.confidence === 'exact' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                  <Text className={`text-[10px] font-semibold ${current.confidence === 'exact' ? 'text-emerald-500' : 'text-amber-500'}`}>{current.confidence === 'exact' ? t('EXACTA', 'EXACT') : t('REVISAR', 'REVIEW')}</Text>
                </View>
              </View>
              <View className="flex-row gap-3">
                <Card label={t('Trabajo', 'Job')}>
                  <Text className="text-sm font-semibold text-ink">{current.job.title}</Text>
                  {current.job.externalRef ? <Text className="text-xs font-mono text-faint mt-0.5">{current.job.externalRef}</Text> : null}
                  <Text className="text-xs text-muted mt-1">{current.job.clientName}</Text>
                  {current.job.scheduledDate ? <Text className="text-xs text-faint mt-0.5">{fmtDate(current.job.scheduledDate)}</Text> : null}
                </Card>
                <Card label={t('Línea', 'Invoice line')}>
                  <Text className="text-sm font-semibold text-ink">{currentLine.description}</Text>
                  <Text className="text-xs font-mono text-faint mt-0.5">#{currentLine.invoiceNumber}</Text>
                  <Text className="text-xs text-muted mt-1">{current.job.clientName}</Text>
                  <Text className="text-xs text-muted mt-1">{currentLine.qty} × {money(currentLine.rate)}</Text>
                  <Text className="text-xs font-semibold text-ink mt-0.5">{money(currentLine.amount)}</Text>
                  {currentLine.issueDate ? <Text className="text-xs text-faint mt-0.5">{fmtDate(currentLine.issueDate)}</Text> : null}
                </Card>
              </View>

              {current.alternatives.length > 0 && (
                <View>
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-1.5">{t('Otras líneas posibles', 'Other possible lines')}</Text>
                  {/* Only the OTHER lines — the matched one is already in the card above. */}
                  {[current.line!, ...current.alternatives].filter(l => lineKey(l) !== lineKey(currentLine)).map(l => (
                    <Pressable key={lineKey(l)} onPress={() => setPickedLineKey(lineKey(l))} className="px-3 py-2.5 rounded-xl mb-1 border border-border-soft">
                      <Text className="text-sm text-ink" numberOfLines={1}>{l.description}</Text>
                      <Text className="text-xs text-faint">#{l.invoiceNumber} · {l.qty} × {money(l.rate)} = {money(l.amount)}{l.issueDate ? ` · ${fmtDate(l.issueDate)}` : ''}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View className="flex-row gap-3 mt-2">
                <Pressable onPress={onSkip} disabled={busy} className="flex-1 py-3.5 rounded-2xl border border-border items-center active:opacity-80 disabled:opacity-50">
                  <Text className="text-sm font-semibold text-ink">{t('Saltar', 'Skip')}</Text>
                </Pressable>
                <Pressable onPress={onContinue} disabled={busy} className="flex-1 py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                  <Text className="text-sm font-semibold text-white">{t('Continuar', 'Continue')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {phase === 'done' && (
            <View className="py-16 items-center gap-4">
              <Text className="text-4xl">✅</Text>
              <Text className="text-sm text-ink text-center px-6">
                {t(`Se vincularon ${linkedCount} trabajos.`, `Linked ${linkedCount} jobs.`)}
                {skippedCount ? ` ${t(`${skippedCount} saltados.`, `${skippedCount} skipped.`)}` : ''}
                {noMatchCount ? ` ${t(`${noMatchCount} sin match.`, `${noMatchCount} no match.`)}` : ''}
              </Text>
              <Pressable onPress={onClose} className="py-3.5 px-8 rounded-2xl bg-primary items-center active:opacity-90">
                <Text className="text-white font-semibold">{t('Listo', 'Done')}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </RNModal>
  );
}
