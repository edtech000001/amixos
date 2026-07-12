'use client';

// Payment history — its own page (grew out of the Payroll modal): every saved
// payroll check, grouped by pay period, newest first. These are the PERMANENT
// records (immune to job edits/deletes) — the page is the audit trail and the
// landing spot for future features (filters, export, per-worker view…).

import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, X, Check, Trash2, Calendar, Wrench, Truck, Clock } from 'lucide-react';
import { useLang } from '../../i18n';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { buildHistoryRangePresets } from '../../lib/dateRangePresets';
import type { PayrollBreakdown } from '../../lib/payroll';

export interface PayrollHistoryEntry {
  id: string;
  employeeId: string | null;
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
  /** Pay-time hours-breakdown snapshot (136). Null on old records/imports. */
  breakdown?: PayrollBreakdown | null;
}

export interface PayrollHistoryScreenProps {
  loading: boolean;
  entries: PayrollHistoryEntry[];
  onBack: () => void;
  /** Bulk delete (admin) — the page reloads entries afterwards. */
  onDeleteEntries?: (ids: string[]) => void | Promise<void>;
  /** Business payroll settings — enables the this/last pay-period presets. */
  payPeriod?: { frequency: unknown; anchorDate: unknown; customDays?: unknown };
  /** Loads the hours breakdown (jobs/timesheets of the record's period) for
   *  the in-place detail modal — same content as the live Payroll view. */
  onLoadBreakdown?: (entry: PayrollHistoryEntry) => Promise<PayrollBreakdown | null>;
  /** Opens a job from the breakdown's job list. */
  onJobPress?: (jobId: string) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function PayrollHistoryScreen({ loading, entries, onBack, onDeleteEntries, payPeriod, onLoadBreakdown, onJobPress }: PayrollHistoryScreenProps) {
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
  const fullDate = full.dashboard.jobs.dateFilter; // reuse the jobs date-filter labels
  const tSel = full.dashboard.jobs.batchInvoice; // reuse the jobs selection-bar labels
  const componentsText = (c: Record<string, number> | null | undefined) =>
    c ? Object.entries(c).filter(([, v]) => v).map(([l, v]) => `${v} × ${l}`).join(' · ') : '';

  // Search + date-range filter. Range matches by PERIOD OVERLAP so a period
  // straddling the boundary still counts.
  const [search, setSearch] = usePersistedSearch('search.payrollHistory');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const dateActive = !!(dateFrom || dateTo);
  // Recomputed per render so a tab left open past midnight stays correct.
  const presets = buildHistoryRangePresets(t.historyPresets, payPeriod);
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return entries.filter(h => {
      if (dateFrom && h.periodEnd.slice(0, 10) < dateFrom) return false;
      if (dateTo && h.periodStart.slice(0, 10) > dateTo) return false;
      if (!q) return true;
      return norm([
        h.name,
        h.checkNumber ?? '',
        methodLabel[h.method] ?? h.method,
        h.grossPay.toFixed(2),
        String(h.grossPay),
        componentsText(h.components),
      ].join(' ')).includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search, dateFrom, dateTo]);
  // In-place record detail — the check header + that period's hours
  // breakdown, without leaving the history page.
  const [detail, setDetail] = useState<{ entry: PayrollHistoryEntry; breakdown: PayrollBreakdown | null; loading: boolean } | null>(null);
  const openDetail = (entry: PayrollHistoryEntry) => {
    // Snapshot-first: what the check actually paid for, frozen at pay time.
    // Old records (pre-136) fall back to a live recomputation.
    if (entry.breakdown) {
      setDetail({ entry, breakdown: entry.breakdown, loading: false });
      return;
    }
    if (!onLoadBreakdown) return;
    setDetail({ entry, breakdown: null, loading: true });
    void onLoadBreakdown(entry)
      .then(b => setDetail(d => (d && d.entry.id === entry.id ? { entry, breakdown: b, loading: false } : d)))
      .catch(() => setDetail(d => (d && d.entry.id === entry.id ? { entry, breakdown: null, loading: false } : d)));
  };

  const groups = useMemo(() => {
    const by = new Map<string, PayrollHistoryEntry[]>();
    filtered.forEach(h => {
      const list = by.get(h.periodStart) ?? [];
      list.push(h);
      by.set(h.periodStart, list);
    });
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Summary of whatever is currently shown — "worker X earned $Y all time"
  // is just: search the worker, read this line. Add dates for a range.
  const shownTotal = filtered.reduce((sum, h) => sum + h.grossPay, 0);
  const shownHours = filtered.reduce((sum, h) => sum + h.hours + h.driverHours, 0);

  // Multi-select + bulk delete.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Shift-click selects the whole range since the last picked row (same as
  // the jobs list). Visible order = the grouped list, top to bottom.
  const lastPickRef = useRef<string | null>(null);
  const handleSelectClick = (id: string, shiftKey: boolean) => {
    // Range + anchor math OUTSIDE the state updater: React may invoke
    // updaters more than once, and mutating lastPickRef inside made the
    // second run see anchor === id — collapsing the shift-range to one row.
    const flat = groups.flatMap(([, list]) => list.map(h => h.id));
    const anchor = lastPickRef.current;
    const useRange = shiftKey && !!anchor && anchor !== id && flat.includes(anchor) && flat.includes(id);
    setSelected(prev => {
      const next = new Set(prev);
      if (useRange) {
        const a = flat.indexOf(anchor as string);
        const b = flat.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const turningOn = !prev.has(id);
        for (let i = lo; i <= hi; i++) {
          if (turningOn) next.add(flat[i]); else next.delete(flat[i]);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastPickRef.current = id;
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const allSelected = filtered.length > 0 && filtered.every(h => selected.has(h.id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map(h => h.id)));
  const deleteSelected = async () => {
    if (!onDeleteEntries || selected.size === 0) return;
    if (!window.confirm(t.historyDeleteConfirm.replace('{{count}}', String(selected.size)))) return;
    await onDeleteEntries(Array.from(selected));
    exitSelect();
  };

  return (
    <div className={`px-6 lg:px-8 pt-6 ${selectMode ? 'pb-28' : 'pb-12'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} className="text-gray-500" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{t.historyTitle}</h1>
      </div>

      {/* Search + date range + select */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.historySearchPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          ) : null}
        </div>
        {/* Date range — same calendar popover as the invoices list. */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setDateOpen(o => !o)}
            title={fullDate.title}
            className={`flex items-center justify-center p-2.5 rounded-2xl border shadow-sm transition-colors ${
              dateActive ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Calendar size={16} />
          </button>
          {dateOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDateOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-72 bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{fullDate.title}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {presets.map(pr => {
                    const on = dateFrom === pr.from && dateTo === pr.to;
                    return (
                      <button
                        key={pr.label}
                        type="button"
                        onClick={() => { setDateFrom(pr.from); setDateTo(pr.to); }}
                        className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
                          on ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {pr.label}
                      </button>
                    );
                  })}
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{fullDate.from}</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full mb-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <label className="block text-xs font-medium text-gray-600 mb-1">{fullDate.to}</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dateActive ? (
                  <button
                    type="button"
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                    className="mt-3 w-full py-2 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                  >
                    {fullDate.clear}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {onDeleteEntries ? (
          <button
            type="button"
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={`px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              selectMode ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {selectMode ? t.historyCancelSelect : t.historySelect}
          </button>
        ) : null}
      </div>

      {/* Shown-total summary — reflects the current search + date range. */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-4">
        <p className="text-xs text-gray-500">
          {t.historyTotalLabel} · {t.historyPaymentsCount.replace('{{count}}', String(filtered.length))} · {Math.round(shownHours * 100) / 100} h
        </p>
        <p className="text-base font-bold text-primary">{fmt(shownTotal)}</p>
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
        <p className="text-sm text-gray-400 text-center py-16">{search ? t.historyNoResults : t.historyEmpty}</p>
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
                  <div
                    key={h.id}
                    onClick={selectMode
                      ? (e) => handleSelectClick(h.id, e.shiftKey)
                      : (h.breakdown || (onLoadBreakdown && h.employeeId)) ? () => openDetail(h) : undefined}
                    className={`px-5 py-3 flex items-center gap-3 ${i < list.length - 1 ? 'border-b border-gray-50' : ''} ${selectMode ? 'cursor-pointer hover:bg-gray-50 select-none' : ''} ${!selectMode && (h.breakdown || (onLoadBreakdown && h.employeeId)) ? 'cursor-pointer hover:bg-gray-50' : ''} ${selectMode && selected.has(h.id) ? 'bg-primary/5' : ''}`}
                  >
                    {selectMode ? (
                      <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${selected.has(h.id) ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                        {selected.has(h.id) ? <Check size={13} className="text-white" /> : null}
                      </span>
                    ) : null}
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

      {/* In-place record detail — mirrors the live Payroll breakdown. */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-bold text-gray-900">{detail.entry.name}</p>
                <p className="text-sm text-gray-500">
                  {fmt(detail.entry.grossPay)} · {Math.round(detail.entry.hours * 100) / 100} h
                  {' · '}
                  {detail.entry.method === 'check' && detail.entry.checkNumber ? `${t.checkPrefix}${detail.entry.checkNumber}` : (methodLabel[detail.entry.method] ?? detail.entry.method)}
                  {detail.entry.paidAt ? ` · ${fmtDay(detail.entry.paidAt)}` : ''}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDay(detail.entry.periodStart)} – {fmtDay(detail.entry.periodEnd)}
                  {componentsText(detail.entry.components) ? ` · ${componentsText(detail.entry.components)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {detail.loading ? (
              <div className="flex justify-center py-10">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            ) : detail.breakdown ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {([[Wrench, t.hoursWorked, detail.breakdown.workedHours], [Truck, t.hoursDriven, detail.breakdown.drivenHours], [Clock, t.hoursLogged, detail.breakdown.loggedHours]] as const).map(([Icon, label, val], i) => (
                    <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
                      <Icon size={15} className="text-gray-400 mx-auto mb-1" />
                      <p className="text-base font-bold text-gray-900">{val}</p>
                      <p className="text-[11px] text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
                {detail.breakdown.jobs.length > 0 ? (
                  <>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.projectsHeading}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {detail.breakdown.jobs.map((j, i) => (
                        <div key={j.jobId ?? i} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                          <button
                            type="button"
                            disabled={!j.jobId || !onJobPress}
                            onClick={() => { if (j.jobId && onJobPress) onJobPress(j.jobId); }}
                            className="flex-1 min-w-0 text-left group disabled:cursor-default"
                          >
                            <p className={`text-sm font-semibold text-gray-900 truncate ${j.jobId && onJobPress ? 'group-hover:text-primary' : ''}`}>{j.title || t.untitledJob}</p>
                            {j.date && <p className="text-[11px] text-gray-400">{fmtDay(j.date)}</p>}
                          </button>
                          <div className="text-right shrink-0">
                            {j.workedHours > 0 && (
                              <p className="text-xs text-gray-600"><Wrench size={11} className="inline mr-1 text-gray-400" />{j.workedHours} h</p>
                            )}
                            {j.drivenHours > 0 && (
                              <p className="text-xs text-gray-600"><Truck size={11} className="inline mr-1 text-gray-400" />{j.drivenHours} h</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">{t.historyNoResults}</p>
            )}
          </div>
        </div>
      )}

      {/* Sticky bulk-delete bar — same layout as the jobs list. */}
      {selectMode ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {tSel.selectedCount.replace('{{count}}', String(selected.size))}
            </span>
            {filtered.length > 0 ? (
              <button type="button" onClick={toggleSelectAll} className="text-xs font-semibold text-primary hover:underline">
                {allSelected ? tSel.deselectAll : tSel.selectAll}
              </button>
            ) : null}
            <div className="flex-1" />
            <button type="button" onClick={exitSelect} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
              {tSel.cancel}
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
            >
              <Trash2 size={15} /> {t.historyDeleteBtn}{selected.size > 0 ? ` · ${selected.size}` : ''}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
