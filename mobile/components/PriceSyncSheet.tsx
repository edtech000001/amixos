import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal as RNModal } from 'react-native';
import { haptics } from '@amixos/shared/lib/haptics';
import { X, ArrowLeft, Check, AlertTriangle, CheckCircle } from 'lucide-react-native';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  syncPriceSheet,
  skippedClientPrices,
  setPriceAutosync,
  autosyncBlock,
  type PriceAutosyncLink,
  type PriceSyncReport,
  type PriceSyncTarget,
} from '@amixos/shared/lib/priceSheetSync';

type Supa = Parameters<typeof syncPriceSheet>[0];

interface Props {
  open: boolean;
  onClose: () => void;
  supabase: Supa;
  sourceBusinessId: string;
  targets: PriceSyncTarget[];
  /** Auto-sync links (migration 259) the user can see. */
  links: PriceAutosyncLink[];
  /** Re-read the links after one is turned on/off. */
  onLinksChanged: () => void;
  /** Name for any business id (for "Syncs from …"). */
  businessName: (id: string) => string;
}

type Step = 'pick' | 'preview' | 'done';

const fmtRate = (r: number | null) =>
  r == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(Number(r));

/**
 * "Copy prices to other companies" (migration 242) — pick companies →
 * preview (nothing written) → confirm. Web twin: PriceSyncModal.
 * Canonical sheet structure (absolute backdrop first, card as a sibling);
 * the confirmation is inline — iOS won't present a second modal over this.
 */
export function PriceSyncSheet({ open, onClose, supabase, sourceBusinessId, targets, links, onLinksChanged, businessName }: Props) {
  const c = useThemeColors();
  const { t: full } = useLang();
  const t = full.dashboard.settings.priceSheet.sync;
  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<Record<string, PriceSyncReport>>({});
  const [showMatches, setShowMatches] = useState(false);
  // Targets with auto-sync wanted ON. Already-on links start on; turning one
  // on takes effect after the copy below, turning one off is immediate.
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const activeAuto = (id: string) => links.some(l => l.sourceId === sourceBusinessId && l.targetId === id);
  const blockOf = (id: string) => autosyncBlock(links, sourceBusinessId, id);

  useEffect(() => {
    if (!open) return;
    const syncable = targets.filter(x => !blockOf(x.id));
    setNotice('');
    // Already auto-synced companies are identical — not ticked for a copy.
    setStep('pick'); setPicked(new Set(syncable.filter(x => !activeAuto(x.id)).map(x => x.id))); setBusy(false); setError(''); setReports({}); setShowMatches(false);
    setAuto(new Set(syncable.filter(x => activeAuto(x.id)).map(x => x.id)));
    // Reset on OPEN only — `targets` is rebuilt by the parent every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = targets.filter(x => picked.has(x.id));
  const names = chosen.map(x => x.name).join(', ');

  const run = async (preview: boolean) => {
    setBusy(true); setError('');
    const next: Record<string, PriceSyncReport> = {};
    for (const target of chosen) {
      const res = await syncPriceSheet(supabase, sourceBusinessId, target.id, preview);
      if (res.ok === false) {
        setBusy(false);
        setError(t.failed.replace('{{error}}', `${target.name}: ${res.error}`));
        return;
      }
      next[target.id] = res.report;
    }
    if (!preview) {
      // Copy succeeded → switch on auto-sync where it was asked for.
      let changed = false;
      for (const target of chosen) {
        if (!auto.has(target.id) || activeAuto(target.id)) continue;
        const res = await setPriceAutosync(supabase, sourceBusinessId, target.id, true);
        if (res.ok === false) {
          setBusy(false);
          setError(t.failed.replace('{{error}}', `${target.name}: ${res.error}`));
          onLinksChanged();
          return;
        }
        changed = true;
      }
      if (changed) onLinksChanged();
    }
    setReports(next); setBusy(false); setStep(preview ? 'preview' : 'done');
  };

  const toggleAuto = async (id: string) => {
    if (auto.has(id)) {
      // Turning OFF an active link is immediate (nothing to preview).
      if (activeAuto(id)) {
        setBusy(true);
        const res = await setPriceAutosync(supabase, sourceBusinessId, id, false);
        setBusy(false);
        if (res.ok === false) { setError(t.autoOffFailed.replace('{{error}}', res.error)); return; }
        onLinksChanged();
        setNotice(t.autoTurnedOff.replace('{{company}}', targets.find(x => x.id === id)?.name ?? ''));
      }
      setAuto(prev => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      // Auto-sync implies copying now, so it also ticks the company.
      setAuto(prev => new Set(prev).add(id));
      setPicked(prev => new Set(prev).add(id));
    }
  };
  const autoNames = chosen.filter(x => auto.has(x.id)).map(x => x.name).join(', ');
  // Switched on in this sheet, not yet saved — it saves with the copy.
  const pendingAuto = chosen.some(x => auto.has(x.id) && !activeAuto(x.id));

  const howLabel = (how: string) =>
    how === 'email' ? t.howEmail : how === 'phone' ? t.howPhone : how === 'name' ? t.howName : t.howCompany;

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable onPress={busy ? undefined : onClose} style={SHEET_BACKDROP} />
        <View className="bg-card rounded-t-3xl px-5 pt-3 pb-8" style={{ maxHeight: '88%' }}>
          <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>
          <View className="flex-row items-center gap-2 mb-2">
            {step === 'preview' && !busy ? (
              <Pressable onPress={() => setStep('pick')} hitSlop={8} className="p-1 -ml-1 rounded-lg active:bg-border-soft">
                <ArrowLeft size={18} color={c.muted} />
              </Pressable>
            ) : null}
            <Text className="text-base font-bold text-ink flex-1">{t.title}</Text>
            <Pressable onPress={onClose} disabled={busy} hitSlop={8} className="p-1.5 rounded-lg active:bg-border-soft">
              <X size={18} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {step === 'pick' ? (
              <>
                <Text className="text-sm text-muted mb-3">{t.subtitle}</Text>
                <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">{t.pickTargets}</Text>
                {targets.map(b => {
                  const block = blockOf(b.id);
                  const on = picked.has(b.id) && !block;
                  const autoOn = auto.has(b.id);
                  const inSync = autoOn && activeAuto(b.id);
                  return (
                    <View key={b.id}
                      className={`flex-row items-center gap-3 px-3 py-3 rounded-xl border mb-2 ${block ? 'border-border-soft opacity-60' : on ? 'border-primary bg-primary/10' : 'border-border-soft'}`}>
                      <Pressable disabled={!!block || autoOn}
                        onPress={() => setPicked(prev => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
                        className="flex-1 flex-row items-center gap-3 active:opacity-70">
                        <View className={`w-5 h-5 rounded-md border items-center justify-center ${on || inSync ? 'bg-primary border-primary' : 'border-border'}`}>
                          {on || inSync ? <Check size={13} color="#fff" /> : null}
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{b.name}</Text>
                          {block ? (
                            <Text className="text-[11px] text-faint">
                              {block.kind === 'follows' ? t.autoSyncsFrom.replace('{{company}}', businessName(block.otherSourceId)) : t.autoIsSource}
                            </Text>
                          ) : inSync ? (
                            <Text className="text-[11px] text-emerald-600">{t.autoInSync}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                      {!block ? (
                        <View className="items-center">
                          {/* Pressable toggle, not RN <Switch>: the native UISwitch
                              didn't receive taps inside this modal sheet's ScrollView
                              on iOS (the rows' Pressables did). */}
                          <Pressable accessibilityRole="switch" accessibilityState={{ checked: autoOn, disabled: busy }}
                            disabled={busy} hitSlop={8} onPress={() => { haptics.select(); void toggleAuto(b.id); }}
                            style={{ width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center',
                                     backgroundColor: autoOn ? c.primary : 'rgba(120,120,128,0.36)', opacity: busy ? 0.5 : 1 }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
                                           alignSelf: autoOn ? 'flex-end' : 'flex-start' }} />
                          </Pressable>
                          <Text className="text-[10px] font-semibold text-muted mt-0.5">{t.autoLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <Text className="text-[11px] text-faint mt-1">{pendingAuto ? t.autoPendingHint : `${t.autoHint}.`}</Text>
                {notice ? <Text className="text-sm text-emerald-600 mt-2">{notice}</Text> : null}
              </>
            ) : step === 'preview' ? (
              <>
                {chosen.map(b => {
                  const r = reports[b.id];
                  if (!r) return null;
                  const skipped = skippedClientPrices(r);
                  const copied = r.clientPrices.filter(x => !skipped.includes(x));
                  return (
                    <View key={b.id} className="rounded-2xl border border-border-soft p-4 mb-3">
                      <Text className="text-sm font-semibold text-ink">{b.name}</Text>
                      <Text className="text-sm text-muted mt-0.5">
                        {t.summary.replace('{{updated}}', String(r.updated)).replace('{{added}}', String(r.added)).replace('{{removed}}', String(r.removed))}
                      </Text>
                      {r.clientPrices.length ? (
                        <Text className="text-sm mt-1">
                          <Text className="text-emerald-600">{t.clientCopied.replace('{{count}}', String(copied.length))}</Text>
                          {skipped.length ? <Text className="text-amber-600">{' · '}{t.clientSkipped.replace('{{count}}', String(skipped.length))}</Text> : null}
                        </Text>
                      ) : null}
                      {skipped.length ? (
                        <View className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                          <Text className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">{t.skippedHeading}</Text>
                          {skipped.map((x, i) => (
                            <Text key={i} className="text-sm text-ink mb-1">
                              <Text className="font-medium">{x.client}</Text> · {x.item} {fmtRate(x.rate)}
                              <Text className="text-muted"> — {x.how === 'none'
                                ? t.skippedNone.replace('{{company}}', b.name)
                                : t.skippedAmbiguous.replace('{{count}}', String(x.candidates)).replace('{{company}}', b.name)}</Text>
                            </Text>
                          ))}
                          <Text className="text-xs text-muted mt-1">{t.skippedHint}</Text>
                        </View>
                      ) : null}
                      {showMatches && copied.length ? (
                        <View className="mt-3">
                          {copied.map((x, i) => (
                            <Text key={i} className="text-sm text-ink mb-1">
                              <Text className="font-medium">{x.client}</Text> · {x.item} {fmtRate(x.rate)}
                              <Text className={x.how === 'name' || x.how === 'company' ? 'text-amber-600' : 'text-muted'}>
                                {' '}— {t.matchedBy.replace('{{how}}', howLabel(x.how))}
                              </Text>
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {Object.values(reports).some(r => r.clientPrices.some(x => x.how !== 'none' && x.how !== 'ambiguous')) ? (
                  <Pressable onPress={() => setShowMatches(v => !v)} hitSlop={6} className="self-start mb-3 active:opacity-60">
                    <Text className="text-xs font-semibold text-primary">{t.showMatches}</Text>
                  </Pressable>
                ) : null}
                <View className="flex-row gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertTriangle size={16} color={c.danger} />
                  <Text className="text-sm text-ink flex-1">{t.warning}</Text>
                </View>
              </>
            ) : (
              <View className="py-6 items-center gap-3">
                <CheckCircle size={36} color={c.success} />
                <Text className="text-base font-semibold text-ink text-center">{t.done.replace('{{companies}}', names)}</Text>
                {autoNames ? <Text className="text-sm text-muted text-center px-4">{t.autoDone.replace('{{companies}}', autoNames)}</Text> : null}
              </View>
            )}
          </ScrollView>

          {error ? <Text className="text-sm text-red-500 mt-2">{error}</Text> : null}

          {step === 'pick' ? (
            <Pressable onPress={() => void run(true)} disabled={busy || chosen.length === 0}
              className={`mt-3 py-3.5 rounded-2xl items-center ${busy || chosen.length === 0 ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}>
              <Text className="text-sm font-semibold text-white">{busy ? t.previewing : pendingAuto ? t.previewAutoBtn : t.previewBtn}</Text>
            </Pressable>
          ) : step === 'preview' ? (
            <Pressable onPress={() => void run(false)} disabled={busy}
              className={`mt-3 py-3.5 rounded-2xl items-center ${busy ? 'bg-red-500/50' : 'bg-red-500 active:opacity-90'}`}>
              <Text className="text-sm font-semibold text-white">{busy ? t.running : pendingAuto ? t.confirmAutoBtn : t.confirmBtn.replace('{{companies}}', names)}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onClose} className="mt-3 py-3.5 rounded-2xl bg-border-soft items-center active:opacity-80">
              <Text className="text-sm font-semibold text-ink">{full.common.buttons.close}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </RNModal>
  );
}
