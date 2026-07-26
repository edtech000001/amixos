'use client';

// Web-only InvoicesListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale). Same exported API as InvoicesListScreen.tsx so the web
// page wrapper is untouched and the bundler resolves this .web.tsx variant.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, FileText, Search, X, Calendar, XCircle, List, Layers, Building2, MapPin, Check, ListChecks, Trash2, DollarSign } from 'lucide-react';
import { useLang } from '../../i18n';
import { formatDateLong, daysOverdue, daysSince } from '../../lib/format';
import { usStateName } from '../../lib/usStates';
import { usePersistedSearch } from '../../lib/usePersistedSearch';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  totalAmount: number;
  dueDate: string | null;
  clientNames: string | null;
  /** Primary client's company + state (for the company/state filters). */
  company: string | null;
  state: string | null;
  /** Invoice issue date (yyyy-mm-dd) — drives the date-range filter. */
  issueDate: string | null;
  /** When the invoice was sent (drives the "sent Nd ago" label). */
  sentAt?: string | null;
  /** Extra search text: line-item names + linked jobs' Project IDs. */
  searchExtra?: string;
}

export interface InvoicesListScreenProps {
  loading: boolean;
  invoices: InvoiceListItem[];
  onInvoicePress: (id: string) => void;
  /** Omit to hide the New-invoice button + empty-state create link — no create permission. */
  onNewInvoicePress?: () => void;
  /** Opens the price sheet (autopricing catalog). Shows a header button. */
  onPriceSheetPress?: () => void;
  onUpdateStatus: (id: string, status: 'sent' | 'paid') => Promise<void> | void;
  /** Bulk delete for selection mode. Pass ONLY when the role can delete
   *  invoices — its presence shows the Select tool. Caller owns the confirm
   *  + the actual delete (incl. reverting linked jobs). */
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  /** Scopes the persisted group-by preference per business. */
  businessId?: string;
  // ── Server mode (opt-in) — the wrapper does the search/status/counts/paging in
  // the DB. On: this screen skips its own filtering, uses `serverCounts` for the
  // badges + `serverTotal` for the header, reports filter changes via
  // `onFiltersChange`, and asks for more via `onLoadMore` near the bottom.
  serverMode?: boolean;
  serverCounts?: Record<string, number>;
  /** Total invoices matching the active filters (for the header count). */
  serverTotal?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onFiltersChange?: (f: {
    search: string;
    statuses: string[];
    groupBy: GroupKey;
    dateFrom: string | null;
    dateTo: string | null;
  }) => void;
}

// Selectable status filters (multi-select). "All" is the icon reset, not a key.
const STATUS_KEYS = ['draft', 'sent', 'paid', 'overdue', 'total_loss'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
type GroupKey = 'none' | 'status' | 'company' | 'state';

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-border-soft text-muted',
  sent: 'bg-blue-100 text-blue-600',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-600',
  cancelled: 'bg-border-soft text-faint',
  total_loss: 'bg-border-soft text-muted',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoicesListScreen({
  loading,
  invoices,
  onInvoicePress,
  onNewInvoicePress,
  onPriceSheetPress,
  onUpdateStatus,
  onBulkDelete,
  businessId,
  serverMode = false,
  serverCounts,
  serverTotal,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onFiltersChange,
}: InvoicesListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices;
  const tg = t.group;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the jobs date-filter labels
  const tStatus = full.dashboard.invoiceStatus;

  const [statuses, setStatuses] = useState<StatusKey[]>([]);
  const statusSet = useMemo(() => new Set<string>(statuses), [statuses]);
  const toggleStatus = (k: StatusKey) =>
    setStatuses(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const [search, setSearch] = usePersistedSearch(businessId ? `search.invoices.${businessId}` : null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  // Group the list into sections — persisted per device+business, like the
  // jobs list, so leaving the page keeps the chosen grouping.
  const groupStoreKey = businessId ? `amixos.invoicesGroupBy.v1.${businessId}` : 'amixos.invoicesGroupBy.v1';
  const [groupBy, setGroupByState] = useState<GroupKey>('none');
  // Gate the server-mode filter report until after the group-by restore, so the
  // first query uses the saved grouping, not the pre-restore default.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Restored after mount — reading localStorage during initial render
    // would mismatch the server-rendered HTML.
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(groupStoreKey) : null;
    if (saved === 'status' || saved === 'company' || saved === 'state' || saved === 'none') setGroupByState(saved);
    setHydrated(true);
  }, [groupStoreKey]);
  const setGroupBy = (g: GroupKey) => {
    setGroupByState(g);
    try { window.localStorage.setItem(groupStoreKey, g); } catch { /* private mode */ }
  };
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  const statusLabels: Record<StatusKey, string> = {
    draft: t.filters.drafts,
    sent: t.filters.sent,
    paid: t.filters.paid,
    overdue: t.filters.overdue,
    total_loss: t.filters.totalLoss,
  };
  const groupOptions: { key: GroupKey; label: string; Icon: typeof List }[] = [
    { key: 'none', label: tg.none, Icon: List },
    { key: 'status', label: tg.status, Icon: ListChecks },
    { key: 'company', label: tg.company, Icon: Building2 },
    { key: 'state', label: tg.state, Icon: MapPin },
  ];

  const computedCounts = useMemo(() => {
    const c: Record<StatusKey, number> = { draft: 0, sent: 0, paid: 0, overdue: 0, total_loss: 0 };
    for (const inv of invoices) if (inv.status in c) c[inv.status as StatusKey]++;
    return c;
  }, [invoices]);
  // Server mode gets exact counts from the DB (a partial page can't be counted
  // client-side); client mode counts the full array.
  const counts = serverMode && serverCounts
    ? (serverCounts as Record<StatusKey, number>)
    : computedCounts;

  const dateActive = !!dateFrom || !!dateTo;
  const clearDate = () => { setDateFrom(null); setDateTo(null); };

  const inDateRange = (d: string | null) => {
    if (!dateFrom && !dateTo) return true;
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  // In server mode `invoices` is ALREADY the search/status/date-filtered page(s)
  // from the DB in newest-first order, so we don't re-filter or re-sort — we only
  // group the loaded rows. In client mode we filter + sort the full array.
  const filtered = useMemo(() => {
    if (serverMode) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      if (statuses.length && !statusSet.has(inv.status)) return false;
      if (!inDateRange(inv.issueDate)) return false;
      const cn = (inv.clientNames ?? '').toLowerCase();
      // Amount search: digits (with optional $ , .) match against the total.
      const qAmount = q.replace(/[$,\s]/g, '');
      const amountHit = qAmount !== '' && /^[\d.]+$/.test(qAmount) && inv.totalAmount.toFixed(2).includes(qAmount);
      return amountHit || `${inv.invoiceNumber} ${cn} ${inv.searchExtra ?? ''}`.toLowerCase().includes(q);
    })
      // Newest first, by issue date (fallback: keep the fetch order).
      .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, statuses, search, dateFrom, dateTo, serverMode]);

  const sections = useMemo(() => {
    if (groupBy === 'none') return [{ title: '', data: filtered }];
    if (groupBy === 'status') {
      // Actionable first: overdue → sent (awaiting payment) → draft → paid.
      const ORDER = ['overdue', 'sent', 'draft', 'paid', 'total_loss'];
      const map = new Map<string, InvoiceListItem[]>();
      for (const inv of filtered) {
        const arr = map.get(inv.status);
        if (arr) arr.push(inv); else map.set(inv.status, [inv]);
      }
      return Array.from(map.entries())
        .sort((a, b) => {
          const ia = ORDER.indexOf(a[0]); const ib = ORDER.indexOf(b[0]);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        })
        .map(([key, data]) => ({ title: (tStatus as Record<string, string>)[key] ?? key, data }));
    }

    const noVal = '—';
    const map = new Map<string, InvoiceListItem[]>();
    for (const inv of filtered) {
      const raw = groupBy === 'company' ? inv.company : inv.state;
      const key = raw && raw.trim() ? raw : noVal;
      const arr = map.get(key);
      if (arr) arr.push(inv); else map.set(key, [inv]);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] === noVal ? 1 : b[0] === noVal ? -1 : a[0].localeCompare(b[0])))
      .map(([key, data]) => ({
        title: key === noVal ? noVal : groupBy === 'state' ? usStateName(key, locale) : key,
        data,
      }));
  }, [filtered, groupBy, locale]);

  // Raw sum, rounded ONCE to the cent (decimal-aware: float .665 stores as
  // .66499…, the toFixed pass restores the intended half-up → .67).
  const total = Math.round(Number((filtered.reduce((s, i) => s + i.totalAmount, 0) * 100).toFixed(3))) / 100;
  // In server mode the loaded rows are only part of the match set, so the sum is
  // only meaningful once everything for the current filter is loaded.
  const showTotal = filtered.length > 0 && (!serverMode || !hasMore);

  // Server mode: report filter changes UP so the wrapper re-queries. Search is
  // debounced so we don't fire a query per keystroke. Gated on `hydrated` so the
  // first query uses the restored group-by, not the pre-restore default.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !hydrated) return;
    onFiltersChange({ search: debouncedSearch, statuses, groupBy, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, hydrated, debouncedSearch, statuses, groupBy, dateFrom, dateTo]);

  // Infinite scroll: load the next page when a sentinel near the list bottom
  // scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!serverMode || !onLoadMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasMore && !loadingMore) onLoadMore(); },
      { rootMargin: '800px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [serverMode, onLoadMore, hasMore, loadingMore]);

  // ── Selection mode (mass delete) — jobs/clients pattern + shift-click range.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const lastPickRef = useRef<string | null>(null);
  const visibleOrder = sections.flatMap(sec => sec.data);
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); lastPickRef.current = null; };
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const handleSelectClick = (id: string, shiftKey: boolean) => {
    const anchor = lastPickRef.current;
    if (shiftKey && anchor && anchor !== id) {
      const a = visibleOrder.findIndex(i => i.id === anchor);
      const b = visibleOrder.findIndex(i => i.id === id);
      if (a >= 0 && b >= 0) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          visibleOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(i => next.add(i.id));
          return next;
        });
        return;
      }
    }
    lastPickRef.current = id;
    toggleSelect(id);
  };
  const allSelected = visibleOrder.length > 0 && visibleOrder.every(i => selectedIds.has(i.id));
  const toggleSelectAll = () =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (visibleOrder.every(i => prev.has(i.id))) visibleOrder.forEach(i => next.delete(i.id));
      else visibleOrder.forEach(i => next.add(i.id));
      return next;
    });
  const runBulkDelete = async () => {
    if (!onBulkDelete || selectedIds.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    await onBulkDelete(Array.from(selectedIds));
    setBulkDeleting(false);
    exitSelect();
  };
  const selectedCountText = (selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural)
    .replace('{{count}}', String(selectedIds.size));

  return (
    <div className={`p-6 lg:p-8 ${selectMode ? 'pb-28' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">{search.trim() || statuses.length || dateFrom || dateTo
              ? t.countFound.replace('{{count}}', String(serverMode ? (serverTotal ?? filtered.length) : filtered.length))
              : t.countTotal.replace('{{count}}', String(serverMode ? (serverTotal ?? invoices.length) : invoices.length))}</p>
        </div>
        <div className="flex items-center gap-2">
          {onPriceSheetPress ? (
            <button onClick={onPriceSheetPress} className="flex items-center gap-2 bg-card border border-border text-ink px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface shadow-sm">
              <DollarSign size={16} /> {full.dashboard.settings.priceSheet.title}
            </button>
          ) : null}
          {onNewInvoicePress ? (
            <button onClick={onNewInvoicePress} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90">
              <Plus size={16} /> {t.newInvoice}
            </button>
          ) : null}
        </div>
      </div>

      {/* Search + filter controls */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        {onBulkDelete ? (
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            title={t.selectButton}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              selectMode ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <ListChecks size={15} /> {t.selectButton}
          </button>
        ) : null}
        {dateActive ? (
          <button
            onClick={clearDate}
            title={tdate.clear}
            aria-label={tdate.clear}
            className="shrink-0 flex items-center justify-center p-2.5 rounded-2xl border border-red-200 bg-red-500/10 text-red-600 shadow-sm hover:bg-red-100 transition-colors"
          >
            <XCircle size={16} />
          </button>
        ) : null}
        {/* Date range */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setGroupMenuOpen(false); setDateOpen(o => !o); }}
            title={tdate.button}
            aria-label={tdate.button}
            className={`flex items-center justify-center p-2.5 rounded-2xl border shadow-sm transition-colors ${
              dateActive ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <Calendar size={16} />
          </button>
          {dateOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDateOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-72 bg-card rounded-2xl border border-border-soft shadow-lg p-4">
                <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-2">{tdate.title}</p>
                <label className="block text-xs font-medium text-muted mb-1">{tdate.from}</label>
                <input
                  type="date"
                  value={dateFrom ?? ''}
                  onChange={e => setDateFrom(e.target.value || null)}
                  className="w-full mb-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <label className="block text-xs font-medium text-muted mb-1">{tdate.to}</label>
                <input
                  type="date"
                  value={dateTo ?? ''}
                  onChange={e => setDateTo(e.target.value || null)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dateActive ? (
                  <button
                    onClick={clearDate}
                    className="mt-3 w-full py-2 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border"
                  >
                    {tdate.clear}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {/* Group by */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setDateOpen(false); setGroupMenuOpen(o => !o); }}
            title={tg.button}
            aria-label={tg.button}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              groupBy !== 'none' ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <Layers size={15} /> {tg.button}
          </button>
          {groupMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setGroupMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-card rounded-2xl border border-border-soft shadow-lg p-2">
                {groupOptions.map(o => {
                  const active = groupBy === o.key;
                  return (
                    <button
                      key={o.key}
                      onClick={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ${active ? 'bg-primary/10' : 'hover:bg-surface'}`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-primary text-white' : 'bg-border-soft text-muted'}`}>
                        <o.Icon size={16} />
                      </span>
                      <span className={`flex-1 text-sm ${active ? 'text-primary font-semibold' : 'text-ink'}`}>{o.label}</span>
                      {active ? <Check size={16} className="text-primary" /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Status tabs — multi-select; "all" is an icon reset. */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
        <button
          onClick={() => setStatuses([])}
          aria-label={t.filters.all}
          className={`flex items-center justify-center px-2.5 py-1.5 rounded-xl shrink-0 ${statuses.length === 0 ? 'bg-primary text-white' : 'bg-border-soft text-muted hover:text-ink'}`}
        >
          <List size={15} />
        </button>
        {STATUS_KEYS.map(k => {
          const on = statusSet.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleStatus(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${on ? 'bg-primary text-white' : 'bg-border-soft text-muted hover:text-ink'}`}
            >
              {statusLabels[k]}
              {counts[k] > 0 ? (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${on ? 'bg-white/20 text-white' : 'bg-border text-muted'}`}>{counts[k]}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Selection bar — fixed to the bottom of the screen (matches the Jobs
         list) so it doesn't push the list down. */}
      {selectMode ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 backdrop-blur px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{selectedCountText}</span>
            {visibleOrder.length > 0 ? (
              <button onClick={toggleSelectAll} className="text-xs font-semibold text-primary hover:underline">
                {allSelected ? full.dashboard.jobs.batchInvoice.deselectAll : t.selectAll}
              </button>
            ) : null}
            <div className="flex-1" />
            <button onClick={exitSelect} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted hover:bg-border-soft">
              {full.dashboard.jobs.batchInvoice.cancel}
            </button>
            <button
              onClick={runBulkDelete}
              disabled={bulkDeleting || selectedIds.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
            >
              <Trash2 size={15} /> {t.bulkDelete}{selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}
            </button>
          </div>
        </div>
      ) : null}

      {/* Summary */}
      {showTotal ? (
        <p className="text-xs text-muted mb-3">
          {t.summaryTotal}: <span className="text-ink font-bold">{fmt(total)}</span>
        </p>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <FileText size={40} className="text-faint" />
          <p className="text-sm text-faint mt-3">{t.empty}</p>
          {onNewInvoicePress ? (
            <button onClick={onNewInvoicePress} className="text-primary text-sm font-medium mt-1 hover:underline">{t.createFirst}</button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map(section => (
            <div key={section.title || '__all'}>
              {section.title ? (
                <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-2 px-1">
                  {section.title} · {section.data.length}
                </p>
              ) : null}
              <div className={`bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden ${selectMode ? 'select-none' : ''}`}>
                {section.data.map((inv) => {
                  const statusKey = inv.status as keyof typeof tStatus;
                  const statusLabel = tStatus[statusKey] ?? inv.status;
                  // Pill shows only the status word — the elapsed count goes next
                  // to the date (like "sent Nd ago"), not folded into the pill.
                  const pillLabel = statusLabel;
                  const pill = STATUS_PILL[inv.status] ?? 'bg-border-soft text-muted';
                  const client = inv.clientNames ?? t.noClient;
                  const due = inv.dueDate ? formatDateLong(inv.dueDate, t.dateLocale) : null;
                  // Elapsed info shown next to the date: "sent Nd ago" (open sent)
                  // or "overdue by Nd" (overdue).
                  const sentAgo = inv.status === 'sent' && inv.sentAt
                    ? (() => { const n = daysSince(inv.sentAt); return n === 0 ? t.sentToday : t.sentAgo.replace('{{n}}', String(n)); })()
                    : null;
                  const overdueAgo = inv.status === 'overdue' && daysOverdue(inv.dueDate) > 0
                    ? t.overdueAgo.replace('{{n}}', String(daysOverdue(inv.dueDate)))
                    : null;
                  return (
                    <button
                      key={inv.id}
                      // Lets the page's scroll restore find and re-center this
                      // exact row when the user returns from the detail.
                      data-scroll-anchor={inv.id}
                      onClick={(e) => (selectMode ? handleSelectClick(inv.id, e.shiftKey) : onInvoicePress(inv.id))}
                      className={`[content-visibility:auto] [contain-intrinsic-size:auto_72px] w-full flex items-center gap-4 px-5 py-4 border-b border-border-soft last:border-b-0 text-left transition-colors ${
                        selectMode && selectedIds.has(inv.id) ? 'bg-primary/5' : 'hover:bg-surface'
                      }`}
                    >
                      {selectMode ? (
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          selectedIds.has(inv.id) ? 'border-primary bg-primary' : 'border-border bg-card'
                        }`}>
                          {selectedIds.has(inv.id) ? <span className="text-white text-[10px] font-bold">✓</span> : null}
                        </span>
                      ) : null}
                      {/* Aligned columns: number | status | client | due | amount.
                         Fixed widths keep rows lined up; on narrow windows the
                         columns collapse back under the number. */}
                      <div className="flex-1 md:flex-none md:w-36 min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate">{inv.invoiceNumber}</span>
                        <span className="md:hidden flex items-center gap-2 flex-wrap mt-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill}`}>{pillLabel}</span>
                        </span>
                        <span className="md:hidden block text-xs text-faint mt-0.5 truncate">
                          {client}
                          {inv.company ? ` · ${inv.company}` : ''}
                          {due ? ` · ${t.dueShort.replace('{{date}}', due)}` : ''}
                          {sentAgo ? ` · ${sentAgo}` : ''}
                          {overdueAgo ? ` · ${overdueAgo}` : ''}
                        </span>
                      </div>
                      <span className="hidden md:flex w-36 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill}`}>{pillLabel}</span>
                      </span>
                      <span className="hidden md:block flex-1 min-w-0 truncate">
                        <span className="text-sm text-muted">{client}</span>
                        {inv.company ? <span className="text-xs text-faint"> · {inv.company}</span> : null}
                      </span>
                      <span className="hidden lg:block w-48 shrink-0 text-xs text-faint truncate">
                        {due ? t.dueShort.replace('{{date}}', due) : ''}
                        {sentAgo ? `${due ? ' · ' : ''}${sentAgo}` : ''}
                        {overdueAgo ? `${due ? ' · ' : ''}${overdueAgo}` : ''}
                      </span>
                      <span className="text-sm font-bold text-ink shrink-0 w-28 text-right">{fmt(inv.totalAmount)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Infinite-scroll footer: sentinel triggers the next page, spinner
             shows while it loads. */}
          {serverMode ? (
            <>
              {loadingMore ? (
                <div className="flex items-center justify-center py-6">
                  <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                </div>
              ) : null}
              <div ref={sentinelRef} className="h-1" />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
