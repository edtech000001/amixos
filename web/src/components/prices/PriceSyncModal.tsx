'use client';

import { useEffect, useState } from 'react';
import { Check, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import {
  syncPriceSheet,
  skippedClientPrices,
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
export function PriceSyncModal({ open, onClose, supabase, sourceBusinessId, targets }: Props) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.priceSheet.sync;
  const [step, setStep] = useState<Step>('pick');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<Record<string, PriceSyncReport>>({});
  const [showMatches, setShowMatches] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('pick'); setPicked(new Set(targets.map(x => x.id))); setBusy(false); setError(''); setReports({}); setShowMatches(false);
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
    setReports(next); setBusy(false); setStep(preview ? 'preview' : 'done');
  };

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
            return (
              <button key={b.id} type="button"
                onClick={() => setPicked(prev => { const n = new Set(prev); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${on ? 'border-primary bg-primary/10' : 'border-border-soft hover:bg-surface'}`}>
                <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                  {on ? <Check size={13} className="text-white" /> : null}
                </span>
                <span className="text-sm font-semibold text-ink">{b.name}</span>
              </button>
            );
          })}
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
          <button type="button" onClick={onClose} className="mt-2 px-4 py-2.5 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border">
            {full.common.buttons.close}
          </button>
        </div>
      )}
    </Modal>
  );
}
