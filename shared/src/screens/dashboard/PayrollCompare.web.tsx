'use client';

// Payroll history → Compare (web twin of PayrollCompare.tsx — keep in sync).

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Search, Check } from 'lucide-react';
import { useLang } from '../../i18n';
import { payrollByMonth, monthRows, yearRows, pctChange, payrollWorkers, type CompareRow } from '../../lib/payrollCompare';
import type { PayrollHistoryEntry } from './PayrollHistoryScreen';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const delta = (cur: number, prev: number) => {
  const p = pctChange(cur, prev);
  return p === null ? '—' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%`;
};

export function PayrollCompare({ entries }: { entries: PayrollHistoryEntry[] }) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll.compare;
  const dateLocale = full.dashboard.dateLocale;
  const workers = useMemo(() => payrollWorkers(entries), [entries]);
  const [worker, setWorker] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState('');
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const shown = [{ id: null as string | null, name: t.all }, ...workers].filter(w => !q.trim() || norm(w.name).includes(norm(q.trim())));
  const pick = (id: string | null) => { setWorker(id); setPickOpen(false); setQ(''); };
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const byMonth = useMemo(() => payrollByMonth(entries, worker), [entries, worker]);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const nowKey = new Date().toISOString().slice(0, 7);

  const rows: CompareRow[] = mode === 'month'
    ? monthRows(byMonth, year).filter(r => r.key <= nowKey).reverse()
    : yearRows(byMonth);
  const max = Math.max(1, ...rows.map(r => r.cur.gross));
  const yearCur = monthRows(byMonth, year).reduce((s, r) => s + r.cur.gross, 0);
  const yearPrev = monthRows(byMonth, year).reduce((s, r) => s + r.prevYear.gross, 0);
  const label = (r: CompareRow) => mode === 'year' ? r.key
    : new Date(`${r.key}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'long' });

  return (
    <div>
      <div className="relative mb-3 w-full max-w-sm">
        <button type="button" onClick={() => setPickOpen(o => !o)} aria-expanded={pickOpen}
          className="w-full flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-sm hover:bg-surface">
          <span className="truncate">{workers.find(w => w.id === worker)?.name ?? t.all}</span>
          <ChevronDown size={16} className="text-muted shrink-0" />
        </button>
        {pickOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setPickOpen(false); setQ(''); }} />
            <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-card rounded-2xl border border-border-soft shadow-lg p-2">
              <div className="relative mb-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t.searchWorker}
                  onKeyDown={e => { if (e.key === 'Enter' && shown[0]) pick(shown[0].id); if (e.key === 'Escape') { setPickOpen(false); setQ(''); } }}
                  className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="max-h-72 overflow-y-auto" role="listbox">
                {shown.length === 0 ? <p className="text-sm text-faint px-3 py-3">{t.noMatch}</p> : shown.map(w => (
                  <button key={w.id ?? 'all'} type="button" role="option" aria-selected={worker === w.id} onClick={() => pick(w.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left hover:bg-surface ${worker === w.id ? 'text-primary font-semibold' : 'text-ink'}`}>
                    <span className="truncate">{w.name}</span>
                    {worker === w.id ? <Check size={15} /> : null}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="inline-flex rounded-xl border border-border bg-card p-0.5">
          {(['month', 'year'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${mode === m ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}>
              {m === 'month' ? t.monthly : t.yearly}
            </button>
          ))}
        </div>
        {mode === 'month' ? (
          <div className="flex items-center gap-3 bg-card rounded-2xl border border-border-soft shadow-sm px-3 py-2">
            <button type="button" onClick={() => setYear(y => y - 1)} aria-label={String(year - 1)} className="p-1 rounded-lg hover:bg-surface text-muted">
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="text-xs text-faint">{t.yearTotal} {year}</p>
              <p className="text-lg font-bold text-primary tabular-nums">{fmt(yearCur)}</p>
              <p className="text-xs text-muted">{delta(yearCur, yearPrev)} {t.vsPrevYear} ({fmt(yearPrev)})</p>
            </div>
            <button type="button" onClick={() => setYear(y => Math.min(thisYear, y + 1))} disabled={year >= thisYear} aria-label={String(year + 1)}
              className="p-1 rounded-lg hover:bg-surface text-muted disabled:opacity-30">
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-faint text-center py-12">{t.empty}</p>
      ) : (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-faint border-b border-border-soft">
                <th className="px-4 py-2.5 font-semibold">{mode === 'month' ? t.monthly : t.yearly}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{full.dashboard.reports.payroll.historyTotalLabel}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{full.dashboard.reports.payroll.totalHours}</th>
                {mode === 'month' ? <th className="px-4 py-2.5 font-semibold text-right">{t.vsPrevMonth}</th> : null}
                <th className="px-4 py-2.5 font-semibold text-right">{t.vsPrevYear}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 min-w-[160px]">
                    <p className="font-semibold text-ink capitalize">{label(r)}</p>
                    <div className="h-1.5 rounded-full bg-surface mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(r.cur.gross / max) * 100}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-ink tabular-nums">{fmt(r.cur.gross)}</td>
                  <td className="px-4 py-2.5 text-right text-muted tabular-nums">{Math.round(r.cur.hours * 100) / 100}</td>
                  {mode === 'month' ? <td className="px-4 py-2.5 text-right text-muted tabular-nums">{delta(r.cur.gross, r.prev.gross)}</td> : null}
                  <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                    {delta(r.cur.gross, r.prevYear.gross)} <span className="text-faint">({fmt(r.prevYear.gross)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
