import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal as RNModal, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { X, ArrowLeft, Check, Building2, Search, ChevronRight } from 'lucide-react-native';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';
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
 * other company already billed by hand (before bill-through existed). Steps:
 * company → their invoice → which of its lines are ours (matches pre-checked)
 * → link. Nothing is copied (shared/src/lib/invoiceBillThrough.ts).
 * Bottom-sheet contract per CLAUDE.md: absolute backdrop first, card sibling.
 * Web twin: web/src/components/invoices/LinkExistingModal.tsx.
 */
export function LinkExistingSheet({
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
  const c = useThemeColors();
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

  // Fresh start each time; one possible company → skip that step.
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
    if (company && targets.length > 1) { setCompany(null); return; }
    onClose();
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

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable onPress={busy ? undefined : onClose} style={SHEET_BACKDROP} />
        <View className="bg-card rounded-t-3xl px-5 pt-3 pb-10" style={{ maxHeight: '88%' }}>
          <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>
          <View className="flex-row items-center gap-2 mb-2">
            {step !== 'company' && !(step === 'invoice' && targets.length === 1) ? (
              <Pressable onPress={back} hitSlop={10} className="p-1 -ml-1 rounded-lg active:bg-border-soft">
                <ArrowLeft size={20} color={c.ink} />
              </Pressable>
            ) : null}
            <Text className="flex-1 text-lg font-bold text-ink">{t.linkTitle}</Text>
            <Pressable onPress={onClose} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft">
              <X size={20} color={c.faint} />
            </Pressable>
          </View>

          {step === 'company' ? (
            <>
              <Text className="text-sm text-muted mb-3">{t.linkIntro}</Text>
              <Text className="text-sm font-semibold text-ink mb-2">{t.linkPickCompany}</Text>
              {targets.map(b => (
                <Pressable key={b.id} onPress={() => setCompany(b)}
                  className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl border border-border mb-2 active:bg-surface">
                  <Building2 size={18} color={c.muted} />
                  <Text className="flex-1 text-base text-ink">{b.name}</Text>
                  <ChevronRight size={16} color={c.faint} />
                </Pressable>
              ))}
            </>
          ) : step === 'invoice' ? (
            <>
              {targets.length === 1 ? <Text className="text-sm text-muted mb-3">{t.linkIntro}</Text> : null}
              <Text className="text-sm font-semibold text-ink mb-2">{t.linkPickInvoice} · {company?.name}</Text>
              <View className="flex-row items-center gap-2 px-3 rounded-xl border border-border bg-surface mb-2">
                <Search size={15} color={c.faint} />
                <TextInput value={search} onChangeText={setSearch} placeholder={t.linkSearch} placeholderTextColor={c.faint}
                  autoCapitalize="characters" autoCorrect={false} className="flex-1 py-2.5 text-sm text-ink" />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
                {invoices === null ? (
                  <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} />
                ) : invoices.length === 0 ? (
                  <Text className="text-sm text-faint text-center py-6">{t.linkEmpty}</Text>
                ) : invoices.map(inv => (
                  <Pressable key={inv.id} onPress={() => void pickInvoice(inv)}
                    className="flex-row items-center gap-3 py-3 border-b border-border-soft active:opacity-60">
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-semibold text-ink">{inv.invoiceNumber}</Text>
                      <Text className="text-xs text-faint" numberOfLines={1}>
                        {[inv.clientName, inv.issueDate ? formatDateLong(inv.issueDate, dateLoc) : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-ink">{money(inv.totalAmount)}</Text>
                    <ChevronRight size={16} color={c.faint} />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <Text className="text-sm font-semibold text-ink">{t.linkPickLines} · {target?.invoiceNumber}</Text>
              <Text className="text-xs text-muted mb-2">{t.linkLinesHint}</Text>
              <ScrollView style={{ flexGrow: 0 }}>
                {lines === null ? (
                  <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} />
                ) : lines.map(l => {
                  const on = picked.has(l.index);
                  return (
                    <Pressable key={l.index} disabled={l.taken}
                      onPress={() => setPicked(prev => { const n = new Set(prev); if (n.has(l.index)) n.delete(l.index); else n.add(l.index); return n; })}
                      className={`flex-row items-center gap-3 py-2.5 border-b border-border-soft ${l.taken ? 'opacity-40' : 'active:opacity-70'}`}>
                      <View className={`w-5 h-5 rounded-md border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                        {on ? <Check size={13} color="#fff" /> : null}
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm text-ink" numberOfLines={2}>{l.description || '—'}</Text>
                        <Text className="text-xs text-faint">{l.taken ? t.linkTaken : `${l.qty} × ${money(l.rate)}`}</Text>
                      </View>
                      <Text className="text-sm font-semibold text-ink">{money(l.qty * l.rate)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {error ? <Text className="text-sm text-red-600 mt-2">{error}</Text> : null}
              <Pressable onPress={() => void confirm()} disabled={busy || !picked.size}
                className={`mt-3 py-3.5 rounded-2xl items-center ${busy || !picked.size ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-sm font-semibold text-white">{t.linkConfirm} ({picked.size})</Text>}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}
