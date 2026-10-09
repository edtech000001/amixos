import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal as RNModal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { X, ArrowLeft, Check, Building2, FilePlus2, UserPlus, Search, AlertTriangle, CheckCircle, ExternalLink, Trash2 } from 'lucide-react-native';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';
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
  /** Set when this invoice is already billed through somewhere. The sheet then
   *  opens on the linked step instead of the picker — one company at a time. */
  existingLink?: BillThroughLink | null;
}

type Step = 'linked' | 'company' | 'client' | 'invoice' | 'lines' | 'done';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const clientName = (c: BillThroughClient) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || '—';

/**
 * "Bill through another company" (migration 240) — a stepped bottom sheet:
 * company → client (suggested match, search, or copy) → invoice (open one or
 * new) → which lines. Canonical sheet structure: absolute backdrop first, card
 * as a plain sibling (see CLAUDE.md). Confirmations render inline — iOS won't
 * present a second modal over this one.
 */
export function BillThroughSheet({
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
  const c = useThemeColors();
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
  // Removing an existing link. Confirmation renders INLINE — iOS silently
  // refuses to present a second modal over this one (see CLAUDE.md).
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

  // Suggested client matches once a company is picked.
  useEffect(() => {
    if (!open || !target) return;
    setMatches(null);
    void suggestTargetClients(supabase, target.id, sourceClientId).then(setMatches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  // Debounced client search.
  useEffect(() => {
    if (!target || !query.trim()) { setResults([]); return; }
    const h = setTimeout(() => { void searchTargetClients(supabase, target.id, query).then(setResults); }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target?.id]);

  // Open invoices for the chosen (existing) client.
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
    : step === 'lines' ? t.stepLines
    : t.title;

  const row = (key: string, onPress: () => void, children: React.ReactNode, selected = false) => (
    <Pressable
      key={key}
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3 py-3 rounded-xl border mb-2 active:opacity-70 ${selected ? 'border-primary bg-primary/10' : 'border-border-soft bg-card'}`}
    >
      {children}
    </Pressable>
  );

  const clientRow = (cl: BillThroughClient, badge?: string) =>
    row(cl.id, () => { setClient(cl); setCopyClient(false); setInvoice(null); setStep('invoice'); }, (
      <>
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{clientName(cl)}</Text>
          <Text className="text-xs text-faint" numberOfLines={1}>
            {[cl.company, [cl.city, cl.state].filter(Boolean).join(', '), cl.phone ?? cl.email].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {badge ? (
          <View className="px-2 py-0.5 rounded-full bg-emerald-500/15">
            <Text className="text-[11px] font-semibold text-emerald-600">{badge}</Text>
          </View>
        ) : null}
      </>
    ), client?.id === cl.id && !copyClient);

  const reasonLabel = (m: ClientMatch) =>
    m.reason === 'email' ? t.reasonEmail : m.reason === 'phone' ? t.reasonPhone : m.reason === 'name' ? t.reasonName : t.reasonCompany;

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable onPress={onClose} style={SHEET_BACKDROP} />
        <View className="bg-card rounded-t-3xl px-5 pt-3 pb-8" style={{ maxHeight: '88%' }}>
          <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>
          <View className="flex-row items-center gap-2 mb-1">
            {canGoBack ? (
              <Pressable onPress={back} hitSlop={8} className="p-1 -ml-1 rounded-lg active:bg-border-soft">
                <ArrowLeft size={18} color={c.muted} />
              </Pressable>
            ) : null}
            <Text className="text-base font-bold text-ink flex-1">
              {step === 'linked' ? t.linkedTitle : t.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1.5 rounded-lg active:bg-border-soft">
              <X size={18} color={c.muted} />
            </Pressable>
          </View>

          {enabled === null ? (
            <View className="py-10 items-center"><ActivityIndicator color={c.primary} /></View>
          ) : !enabled ? (
            <View className="py-4">
              <View className="flex-row gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle size={18} color={c.warning} />
                <Text className="text-sm text-ink flex-1">{t.notEnabled}</Text>
              </View>
            </View>
          ) : (
            <>
              {step !== 'done' && step !== 'linked' && !removed ? (
                <>
                  <Text className="text-xs text-faint mb-3">{t.subtitle}</Text>
                  {/* Breadcrumb of what's been chosen so far. */}
                  {target && step !== 'company' ? (
                    <Text className="text-xs text-muted mb-3" numberOfLines={1}>
                      {[target.name, client && !copyClient ? clientName(client) : null, invoice && step === 'lines' ? (invoice === 'new' ? t.newInvoice : invoice.invoiceNumber) : null]
                        .filter(Boolean).join('  ›  ')}
                    </Text>
                  ) : null}
                  <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">{stepTitle}</Text>
                </>
              ) : null}

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                {step === 'company' ? targets.map(b =>
                  row(b.id, () => { setTarget(b); setClient(null); setInvoice(null); setStep('client'); }, (
                    <>
                      <View className="w-9 h-9 rounded-xl bg-border-soft items-center justify-center"><Building2 size={18} color={c.muted} /></View>
                      <Text className="text-sm font-semibold text-ink flex-1">{b.name}</Text>
                    </>
                  ), target?.id === b.id)
                ) : null}

                {step === 'client' && target ? (
                  <>
                    {matches === null ? (
                      <View className="py-4 items-center"><ActivityIndicator color={c.primary} /></View>
                    ) : matches.length ? (
                      matches.map((m, i) => clientRow(m, i === 0 ? `${t.suggested} · ${reasonLabel(m)}` : reasonLabel(m)))
                    ) : (
                      <Text className="text-sm text-muted mb-3">{t.noMatch.replace('{{company}}', target.name)}</Text>
                    )}
                    <View className="flex-row items-center gap-2 px-3 rounded-xl border border-border bg-surface mt-1 mb-2">
                      <Search size={15} color={c.faint} />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t.searchPlaceholder}
                        placeholderTextColor={c.faint}
                        className="flex-1 py-2.5 text-ink"
                        autoCorrect={false} style={{ fontSize: 14 }} />
                    </View>
                    {results.filter(r => !matches?.some(m => m.id === r.id)).map(r => clientRow(r))}
                    {sourceClientId ? row('copy', () => { setCopyClient(true); setClient(null); setInvoice('new'); setStep('lines'); }, (
                      <>
                        <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center"><UserPlus size={18} color={c.primary} /></View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-ink">{t.copyClient.replace('{{company}}', target.name)}</Text>
                          <Text className="text-xs text-faint">{t.copyClientHint}</Text>
                        </View>
                      </>
                    ), copyClient) : null}
                  </>
                ) : null}

                {step === 'invoice' ? (
                  <>
                    {row('new', () => { setInvoice('new'); setStep('lines'); }, (
                      <>
                        <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center"><FilePlus2 size={18} color={c.primary} /></View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-ink">{t.newInvoice}</Text>
                          <Text className="text-xs text-faint">{t.newInvoiceHint}</Text>
                        </View>
                      </>
                    ), invoice === 'new')}
                    <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mt-3 mb-2">{t.openInvoicesHeading}</Text>
                    {openInvoices === null ? (
                      <View className="py-4 items-center"><ActivityIndicator color={c.primary} /></View>
                    ) : openInvoices.length === 0 ? (
                      <Text className="text-sm text-faint">{t.noOpenInvoices}</Text>
                    ) : openInvoices.map(inv =>
                      row(inv.id, () => { setInvoice(inv); setStep('lines'); }, (
                        <>
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-ink">{inv.invoiceNumber}</Text>
                            <Text className="text-xs text-faint">
                              {[tStatus[inv.status] ?? inv.status, inv.issueDate ? formatDateLong(inv.issueDate, locale === 'en' ? 'en-US' : 'es-MX') : null].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Text className="text-sm font-semibold text-ink">{fmt(inv.totalAmount)}</Text>
                        </>
                      ), invoice !== 'new' && invoice?.id === inv.id)
                    )}
                  </>
                ) : null}

                {step === 'lines' ? (
                  <>
                    <Pressable
                      onPress={() => setPicked(prev => (prev.size === lines.length ? new Set() : new Set(lines.map((_, i) => i))))}
                      className="self-start mb-2 active:opacity-60"
                      hitSlop={6}
                    >
                      <Text className="text-xs font-semibold text-primary">{t.selectAll}</Text>
                    </Pressable>
                    {lines.map((l, i) => {
                      const on = picked.has(i);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => setPicked(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                          /* Keeps its divider: mobile rows have no hover fill, so without one
                             they run together. px-3 aligns them with the other steps. */
                          className="flex-row items-center gap-3 px-3 py-2.5 border-b border-border-soft active:opacity-70"
                        >
                          <View className={`w-5 h-5 rounded-md border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                            {on ? <Check size={13} color="#fff" /> : null}
                          </View>
                          <View className="flex-1 min-w-0">
                            <Text className={`text-sm ${l.excluded ? 'text-faint' : 'text-ink'}`} numberOfLines={2}>{l.name}</Text>
                            <Text className="text-xs text-faint">{l.qty} × {fmt(l.rate)}</Text>
                          </View>
                          <Text className="text-sm font-semibold text-ink">{fmt((Number(l.qty) || 0) * (Number(l.rate) || 0))}</Text>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}

                {removed ? (
                  <View className="py-6 items-center gap-3">
                    <CheckCircle size={36} color={c.success} />
                    <Text className="text-base font-semibold text-ink text-center">{removed}</Text>
                  </View>
                ) : step === 'linked' && existingLink ? (
                  /* Already billed through somewhere. The source account can
                     see where and undo it from here, instead of switching
                     business and hunting for the line. Billing through a
                     second company means removing this one first. */
                  <View className="gap-4">
                    <View className="flex-row gap-3 p-4 rounded-2xl bg-border-soft">
                      <Building2 size={18} color={c.muted} />
                      <Text className="text-sm text-ink flex-1">
                        {t.linkedBody
                          .replace('{{company}}', existingLink.business_name)
                          .replace('{{invoice}}', existingLink.invoice_number)}
                      </Text>
                    </View>
                    {confirmRemove ? (
                      <View className="gap-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/5">
                        <Text className="text-sm text-ink">
                          {t.removeConfirm
                            .replace('{{company}}', existingLink.business_name)
                            .replace('{{invoice}}', existingLink.invoice_number)}
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable disabled={removing} onPress={() => setConfirmRemove(false)}
                            className="px-4 py-2.5 rounded-xl bg-border-soft active:opacity-70">
                            <Text className="text-sm font-semibold text-ink">{full.common.buttons.cancel}</Text>
                          </Pressable>
                          <Pressable disabled={removing} onPress={() => void doRemoveLink()}
                            className="px-4 py-2.5 rounded-xl bg-red-500 active:opacity-70">
                            <Text className="text-sm font-semibold text-white">
                              {removing ? t.removing : t.removeConfirmYes}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      /* Right-aligned, the conventional spot for dialog
                         actions, and the easiest reach for a right thumb. */
                      <View className="flex-row flex-wrap justify-end gap-2">
                        <Pressable onPress={() => onOpenTarget(existingLink.business_id, existingLink.invoice_id)}
                          className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl bg-border-soft active:opacity-70">
                          <ExternalLink size={15} color={c.muted} />
                          <Text className="text-sm font-semibold text-ink">{t.viewTarget}</Text>
                        </Pressable>
                        <Pressable onPress={() => setConfirmRemove(true)}
                          className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 active:opacity-70">
                          <Trash2 size={15} color="#EF4444" />
                          <Text className="text-sm font-semibold text-red-500">{t.removeLink}</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ) : step === 'done' && result && target ? (
                  <View className="py-6 items-center gap-3">
                    <CheckCircle size={36} color={c.success} />
                    <Text className="text-base font-semibold text-ink text-center">
                      {t.done.replace('{{company}}', target.name).replace('{{invoice}}', result.invoiceNumber)}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>

              {duplicate ? (
                <View className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <Text className="text-sm font-semibold text-ink">{t.duplicateTitle}</Text>
                  <Text className="text-xs text-muted mt-0.5">{t.duplicateMessage.replace('{{invoice}}', invoice && invoice !== 'new' ? invoice.invoiceNumber : '')}</Text>
                  <Pressable onPress={() => { setDuplicate(false); void submit(true); }} className="mt-2 self-start px-3 py-1.5 rounded-lg bg-amber-500/20 active:opacity-70">
                    <Text className="text-xs font-semibold text-amber-700">{t.duplicateConfirm}</Text>
                  </Pressable>
                </View>
              ) : null}
              {error ? <Text className="text-sm text-red-500 mt-2">{error}</Text> : null}

              {step === 'lines' && target ? (
                <Pressable
                  onPress={() => void submit()}
                  disabled={busy || picked.size === 0}
                  className={`mt-3 py-3.5 rounded-2xl items-center ${busy || picked.size === 0 ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}
                >
                  <Text className="text-sm font-semibold text-white">
                    {busy ? t.working : t.confirmBtn.replace('{{company}}', target.name)}
                  </Text>
                  {!busy ? (
                    <Text className="text-xs text-white/80 mt-0.5">
                      {(picked.size === 1 ? t.linesSelectedOne : t.linesSelected)
                        .replace('{{count}}', String(picked.size))
                        .replace('{{amount}}', fmt(pickedTotal))}
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}

              {step === 'done' && result ? (
                <View className="flex-row gap-3 mt-2">
                  <Pressable onPress={onClose} className="flex-1 py-3.5 rounded-2xl bg-border-soft items-center active:opacity-80">
                    <Text className="text-sm font-semibold text-ink">{full.common.buttons.close}</Text>
                  </Pressable>
                  <Pressable onPress={() => onOpenTarget(result.businessId, result.invoiceId)} className="flex-1 py-3.5 rounded-2xl bg-primary items-center active:opacity-90">
                    <Text className="text-sm font-semibold text-white">{t.openTarget}</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}
