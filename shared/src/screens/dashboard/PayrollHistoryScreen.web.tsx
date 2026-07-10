'use client';

// Payment history — its own page (grew out of the Payroll modal): every saved
// payroll check, grouped by pay period, newest first. These are the PERMANENT
// records (immune to job edits/deletes) — the page is the audit trail and the
// landing spot for future features (filters, export, per-worker view…).

import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLang } from '../../i18n';

export interface PayrollHistoryEntry {
  periodStart: string;
  periodEnd: string;
  name: string;
  hours: number;
  driverHours: number;
  bonus: number | null;
  grossPay: number;
  method: string;
  checkNumber: string | null;
  paidAt: string | null;
  /** Formula job-field counts this check paid for (label → number). */
  components?: Record<string, number> | null;
}

export interface PayrollHistoryScreenProps {
  loading: boolean;
  entries: PayrollHistoryEntry[];
  onBack: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function PayrollHistoryScreen({ loading, entries, onBack }: PayrollHistoryScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;
  const dateLocale = full.dashboard.dateLocale;
  const fmtDay = (d: string) =>
    new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
  const methodLabel: Record<string, string> = {
    cash: t.methodCash,
    check: t.methodCheck,
    wire: t.methodWire,
  };
  const componentsText = (c: Record<string, number> | null | undefined) =>
    c ? Object.entries(c).filter(([, v]) => v).map(([l, v]) => `${v} × ${l}`).join(' · ') : '';

  const groups = useMemo(() => {
    const by = new Map<string, PayrollHistoryEntry[]>();
    entries.forEach(h => {
      const list = by.get(h.periodStart) ?? [];
      list.push(h);
      by.set(h.periodStart, list);
    });
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} className="text-gray-500" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{t.historyTitle}</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">{t.historyEmpty}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([periodStart, list]) => (
            <div key={periodStart}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-gray-600">
                  {fmtDay(periodStart)} – {fmtDay(list[0].periodEnd)}
                </p>
                <p className="text-sm font-bold text-gray-800">
                  {fmt(list.reduce((sum, e) => sum + e.grossPay, 0))}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {list.map((h, i) => (
                  <div key={`${h.name}-${i}`} className={`px-5 py-3 flex items-center gap-3 ${i < list.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{h.name}</p>
                      <p className="text-xs text-gray-400">
                        {Math.round(h.hours * 100) / 100} h
                        {h.driverHours > 0 ? ` · ${Math.round(h.driverHours * 100) / 100} h ${t.driveShort}` : ''}
                        {h.bonus ? ` · ${t.historyBonus} ${fmt(h.bonus)}` : ''}
                        {' · '}
                        {h.method === 'check' && h.checkNumber ? `${t.checkPrefix}${h.checkNumber}` : (methodLabel[h.method] ?? h.method)}
                        {h.paidAt ? ` · ${fmtDay(h.paidAt)}` : ''}
                        {componentsText(h.components) ? ` · ${componentsText(h.components)}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0">{fmt(h.grossPay)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
