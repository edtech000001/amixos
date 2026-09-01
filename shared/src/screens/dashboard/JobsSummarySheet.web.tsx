'use client';

// Jobs-list summary — totals for every job matching the current filters, not
// just the loaded page (see the jobs_summary RPC, migration 210).
//
// Presentational only: the caller fetches and computes, this renders. The
// mobile variant (JobsSummarySheet.tsx) shows the same numbers in a bottom
// sheet.

import { X } from 'lucide-react';
import { useLang } from '../../i18n';
import type { JobsSummaryTotals } from '../../lib/jobsSummary';

export interface JobsSummarySheetProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  /** null + !loading = the tab selection can't be summarized server-side. */
  totals: JobsSummaryTotals | null;
  /** True when any filter/search is active — changes the subtitle so the
   *  numbers are attributable. */
  filtered: boolean;
  /** Localized status labels, keyed by status. */
  statusLabels: Record<string, string>;
  formatMoney: (n: number) => string;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border-soft last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${muted ? 'text-muted' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

export function JobsSummarySheet({
  open, onClose, loading, totals, filtered, statusLabels, formatMoney,
}: JobsSummarySheetProps) {
  const { t: full } = useLang();
  const t = full.dashboard.jobs.summary;
  if (!open) return null;

  const hours = (n: number) => `${Math.round(n * 10) / 10} h`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-soft shrink-0">
          <div>
            <h2 className="text-base font-bold text-ink">{t.title}</h2>
            <p className="text-xs text-muted mt-0.5">
              {filtered ? t.subtitleFiltered : t.subtitleAll}
            </p>
          </div>
          <button onClick={onClose} aria-label={full.common.buttons.close} className="p-1 -mr-1 text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce"
                       style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          ) : !totals ? (
            <p className="text-sm text-muted py-4">{t.unavailable}</p>
          ) : totals.jobCount === 0 ? (
            <p className="text-sm text-muted py-4">{t.empty}</p>
          ) : (
            <>
              <div className="mb-1">
                <span className="text-3xl font-black text-ink tabular-nums">{totals.jobCount}</span>
                <span className="text-sm text-muted ml-2">{t.jobs}</span>
              </div>

              <div className="mt-4">
                <Row label={t.totalValue} value={formatMoney(totals.totalAmount)} />
                {totals.avgAmount != null ? (
                  <Row label={t.avgPerJob} value={formatMoney(totals.avgAmount)} />
                ) : null}
                <Row label={t.crewHours} value={hours(totals.totalHours)} />
                {totals.totalDriverHours > 0 ? (
                  <Row label={t.driverHours} value={hours(totals.totalDriverHours)} />
                ) : null}
              </div>
              <p className="text-[11px] text-faint mt-2">{t.moneyNote}</p>

              {/* Absent (not zeroed) for roles that can't see pay data. */}
              {totals.estimatedPayroll != null ? (
                <div className="mt-5">
                  <Row label={t.estPayroll} value={formatMoney(totals.estimatedPayroll)} />
                  <Row label={t.workers} value={String(totals.workerCount ?? 0)} muted />
                  <p className="text-[11px] text-faint mt-2">{t.payrollNote}</p>
                  {totals.salariedCount ? (
                    <p className="text-[11px] text-amber-600 mt-1">
                      {t.salariedNote.replace('{{count}}', String(totals.salariedCount))}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {totals.byStatus.length > 0 ? (
                <div className="mt-5">
                  <p className="text-xs font-bold text-faint uppercase tracking-wide mb-1">{t.byStatus}</p>
                  {totals.byStatus.map((r) => (
                    <Row key={r.status} label={statusLabels[r.status] ?? r.status} value={String(r.count)} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
