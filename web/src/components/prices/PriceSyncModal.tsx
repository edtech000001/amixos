'use client';

import { useEffect, useState } from 'react';
import { Check, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
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
 * preview (nothing written) → confirm. The preview is not optional: a sync
 * REPLACES the target's whole price sheet, and it's where the user sees which
 * client prices can't carry over. Mobile twin: PriceSyncSheet.
 */
export function PriceSyncModal({ open, onClose, supabase, sourceBusinessId, targets, links, onLinksChanged, businessName }: Props) {
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
  const activeAuto = (id: string) => links.some(l => l.sourceId === sourceBusinessId && l.targetId === id);
  const blockOf = (id: string) => autosyncBlock(links, sourceBusinessId, id);

  useEffect(() => {
    if (!open) return;
    const syncable = targets.filter(x => !blockOf(x.id));
    setStep('pick'); setPicked(new Set(syncable.map(x => x.id))); setBusy(false); setError(''); setReports({}); setShowMatches(false);
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
      }
      setAuto(prev => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      // Auto-sync implies copying now, so it also ticks the company.
      setAuto(prev => new Set(prev).add(id));
      setPicked(prev => new Set(prev).add(id));
    }
  };
  const autoNames = chosen.filter(x => auto.has(x.id)).map(x => x.name).join(', ');

  const howLabel = (how: string) =>
    how === 'email' ? t.howEmail : how === 'phone' ? t.howPhone : how === 'name' ? t.howName : t.howCompany;

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="lg"
      headerAction={step === 'preview' && !busy ? (
        <button type="button" onClick={() => setStep('pick')} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-border-soft text-sm text-muted">
          <ArrowLeft size={15} /> {t.back}
        </button>
      ) : undefined}
    >
      {step === 'pick' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t.subtitle}</p>
          <p className="text-[11px] font-semibold text-faint uppercase tracking-wide">{t.pickTargets}</p>
          {targets.map(b => {
            const on = picked.has(b.id);
            const block = blockOf(b.id);
            const autoOn = auto.has(b.id);
            return (
              <div key={b.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${block ? 'border-border-soft opacity-60' : on ? 'border-primary bg-primary/10' : 'border-border-soft'}`}>
                <button type="button" disabled={!!block || autoOn}
                  onClick={() => setPicked(prev => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:cursor-default">
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on && !block ? 'bg-primary border-primary' : 'border-border'}`}>
                    {on && !block ? <Check size={13} className="text-white" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">{b.name}</span>
                    {block ? (
                      <span className="block text-[11px] text-faint">
                        {block.kind === 'follows' ? t.autoSyncsFrom.replace('{{company}}', businessName(block.otherSourceId)) : t.autoIsSource}
                      </span>
                    ) : null}
                  </span>
                </button>
                {!block ? (
                  <label className="flex items-center gap-2 shrink-0 cursor-pointer" title={t.autoHint}>
                    <span className="text-xs font-semibold text-muted">{t.autoLabel}</span>
                    <button type="button" role="switch" aria-checked={autoOn} disabled={busy}
                      onClick={() => void toggleAuto(b.id)}
                      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${autoOn ? 'bg-primary' : 'bg-border'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoOn ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                ) : null}
              </div>
            );
          })}
          <p className="text-[11px] text-faint">{t.autoHint}.</p>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button type="button" onClick={() => void run(true)} disabled={busy || chosen.length === 0}
            className="mt-2 py-3 rounded-2xl bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {busy ? t.previewing : t.previewBtn}
          </button>
        </div>
      ) : step === 'preview' ? (
        <div className="flex flex-col gap-4">
          {chosen.map(b => {
            const r = reports[b.id];
            if (!r) return null;
            const skipped = skippedClientPrices(r);
            const copied = r.clientPrices.filter(c => !skipped.includes(c));
            return (
              <div key={b.id} className="rounded-2xl border border-border-soft p-4">
                <p className="text-sm font-semibold text-ink">{b.name}</p>
                <p className="text-sm text-muted mt-0.5">
                  {t.summary.replace('{{updated}}', String(r.updated)).replace('{{added}}', String(r.added)).replace('{{removed}}', String(r.removed))}
                </p>
                {r.clientPrices.length ? (
                  <p className="text-sm mt-1">
                    <span className="text-emerald-600">{t.clientCopied.replace('{{count}}', String(copied.length))}</span>
                    {skipped.length ? <span className="text-amber-600">{' · '}{t.clientSkipped.replace('{{count}}', String(skipped.length))}</span> : null}
                  </p>
                ) : null}
                {skipped.length ? (
                  <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                    <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">{t.skippedHeading}</p>
                    <ul className="flex flex-col gap-1">
                      {skipped.map((c, i) => (
                        <li key={i} className="text-sm text-ink">
                          <span className="font-medium">{c.client}</span> · {c.item} {fmtRate(c.rate)}
                          <span className="text-muted"> — {c.how === 'none'
                            ? t.skippedNone.replace('{{company}}', b.name)
                            : t.skippedAmbiguous.replace('{{count}}', String(c.candidates)).replace('{{company}}', b.name)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted mt-2">{t.skippedHint}</p>
                  </div>
                ) : null}
                {showMatches && copied.length ? (
                  <ul className="mt-3 flex flex-col gap-1">
                    {copied.map((c, i) => (
                      <li key={i} className="text-sm text-ink">
                        <span className="font-medium">{c.client}</span> · {c.item} {fmtRate(c.rate)}
                        <span className={c.how === 'name' || c.how === 'company' ? 'text-amber-600' : 'text-muted'}>
                          {' '}— {t.matchedBy.replace('{{how}}', howLabel(c.how))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
          {Object.values(reports).some(r => r.clientPrices.some(c => c.how !== 'none' && c.how !== 'ambiguous')) ? (
            <button type="button" onClick={() => setShowMatches(v => !v)} className="self-start text-xs font-semibold text-primary hover:underline">
              {t.showMatches}
            </button>
          ) : null}
          <div className="flex gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-ink">{t.warning}</p>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button type="button" onClick={() => void run(false)} disabled={busy}
            className="py-3 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {busy ? t.running : t.confirmBtn.replace('{{companies}}', names)}
          </button>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center gap-3 text-center">
          <CheckCircle size={36} className="text-emerald-500" />
          <p className="text-base font-semibold text-ink">{t.done.replace('{{companies}}', names)}</p>
          {autoNames ? <p className="text-sm text-muted max-w-sm">{t.autoDone.replace('{{companies}}', autoNames)}</p> : null}
          <button type="button" onClick={onClose} className="mt-2 px-4 py-2.5 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border">
            {full.common.buttons.close}
          </button>
        </div>
      )}
    </Modal>
  );
}
