'use client';

// Web-only ClientsListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as ClientsListScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { Fragment, memo, useEffect, useMemo, useState, type ReactNode, useRef } from 'react';
import { SkeletonRow } from '../../ui/Skeleton';
import { Plus, Search, Upload, Trash2, Phone, Mail, MapPin, Pencil, User, Users, X, Layers, Check, ListChecks,
  AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Calendar, UserPlus, Receipt, CircleDollarSign, AlertCircle, Briefcase, Moon, MailX,
} from 'lucide-react';
import { useLang } from '../../i18n';
import { cycleSort, sortTapClears } from '../../lib/sortCycle';
import { clientMatchesSearch, matchingContacts } from '../../lib/clientSearch';
import { groupClients, parseClientGroupKey, CLIENTS_GROUP_KEY, type ClientGroupKey } from '../../lib/clientSections';
import { usStateName } from '../../lib/usStates';
import { Tooltip } from '../../ui/Tooltip';
import { FilteredEmpty } from '../../ui/FilteredEmpty';
import { FilterBar, DateFilterPanel, dateRangeChipText, type BarFilter } from '../../ui/FilterBar.web';
import { buildHistoryRangePresets, rollDatePreset, toAppliedDatePreset, type AppliedDatePreset } from '../../lib/dateRangePresets';
import {
  CLIENT_SORT_KEYS,
  clientSortIsDesc,
  clientSortIsAlpha,
  clientSortCaption,
  type ClientDateField,
  type ClientQuickFilter,
  type ClientSortKey,
} from '../../lib/clientsQuery';
import { CLIENTS_FILTERS_KEY, parseClientsFilters, clientRowStat, type ClientRowStats } from '../../lib/clientsFilters';

export interface ClientListItem {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phoneDisplay: string | null;
  emailDisplay: string | null;
  city: string | null;
  state: string | null;
  /** Contact people for this client — surfaced in search + the matched row. */
  contacts?: { name: string; role: string | null }[];
  /** Custom field values (key → value) — used for "group by custom field". */
  customFields?: Record<string, string> | null;
  /** Activity stats (migration 252) — shown on the row for the active sort. */
  balanceDue?: ClientRowStats['balanceDue'];
  lifetimeBilled?: ClientRowStats['lifetimeBilled'];
  lastInvoiceDate?: ClientRowStats['lastInvoiceDate'];
  createdAt?: ClientRowStats['createdAt'];
}

/** What the screen reports up in server mode (same as the native screen). */
export interface ClientsFiltersChange {
  search: string;
  groupBy: ClientGroupKey;
  sortBy: ClientSortKey;
  sortDesc: boolean | null;
  quick: ClientQuickFilter[];
  dateField: ClientDateField;
  dateFrom: string | null;
  dateTo: string | null;
}

/** One-tap filters in the bar. */
const CLIENT_QUICK_CHIPS: { key: ClientQuickFilter; Icon: typeof User }[] = [
  { key: 'recent_added', Icon: UserPlus },
  { key: 'recent_invoiced', Icon: Receipt },
  { key: 'owes', Icon: CircleDollarSign },
  { key: 'overdue', Icon: AlertCircle },
  { key: 'active_jobs', Icon: Briefcase },
  { key: 'inactive', Icon: Moon },
  { key: 'no_email', Icon: MailX },
];

export interface ClientsListScreenProps {
  loading: boolean;
  clients: ClientListItem[];
  search: string;
  onSearchChange: (text: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Shift-click range add (web idiom). Optional — plain toggle without it. */
  onSelectMany?: (ids: string[]) => void;
  onToggleSelectAll: () => void;
  onClientPress: (id: string) => void;
  /** Omit to hide the per-row edit action — no edit permission. */
  onEditPress?: (id: string) => void;
  /** Omit to hide the per-row delete action — no delete permission. */
  onDeletePress?: (id: string) => void;
  /** Omit to hide the New button + empty-state create link — no create permission. */
  onNewClientPress?: () => void;
  onImportPress?: () => void;
  /** Omit to hide the multi-select toggle + bulk-delete bar — no delete permission. */
  onBulkDeletePress?: () => void;
  onClearSelection: () => void;
  bulkDeleting: boolean;
  /** Custom-field definitions, for the "group by custom field" menu options. */
  customFieldTemplates?: { field_key: string; field_label: string }[];
  bottomSlot?: ReactNode;
  /** Active business id — scopes the group-by choice per business. */
  businessId?: string;
  // ── Server mode (opt-in) — the wrapper does the search/count/paging in the DB.
  // On: this screen skips its own search filter, uses `serverTotal` for the
  // header, reports search+group changes via `onFiltersChange`, and asks for more
  // via `onLoadMore` near the bottom. Off = today's client-side behavior.
  serverMode?: boolean;
  /** Total clients matching the active search (for the header count). */
  serverTotal?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Set when the last fetch failed — rendered as an inline strip with a
   *  retry. The wrappers used to swallow these, so a broken query looked
   *  like "no results". */
  loadError?: boolean;
  onRetryLoad?: () => void;
  onFiltersChange?: (f: ClientsFiltersChange) => void;
}

export function ClientsListScreen({
  loading,
  clients,
  search,
  onSearchChange,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onToggleSelectAll,
  onClientPress,
  onEditPress,
  onDeletePress,
  onNewClientPress,
  onImportPress,
  onBulkDeletePress,
  onClearSelection,
  bulkDeleting,
  customFieldTemplates = [],
  bottomSlot,
  businessId,
  serverMode = false,
  serverTotal,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loadError = false,
  onRetryLoad,
  onFiltersChange,
}: ClientsListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;

  // Group-by control (mirrors the jobs list). 'name' = A–Z (default). The
  // choice persists across navigation + refresh via localStorage — but it's
  // restored AFTER mount (reading it during the initial render would diverge
  // from the server HTML and throw a hydration error).
  const [groupBy, setGroupBy] = useState<ClientGroupKey>('name');
  const [groupHydrated, setGroupHydrated] = useState(false);
  // Scope the group-by per business so it doesn't carry across companies.
  const groupKey = businessId ? `${CLIENTS_GROUP_KEY}.${businessId}` : CLIENTS_GROUP_KEY;
  // Sort, filters and date range (migration 252) — restored with the group.
  const [sortBy, setSortBy] = useState<ClientSortKey>('name');
  const [sortDesc, setSortDesc] = useState<boolean | null>(null);
  // Sort chips: tap → select, again → reverse, third tap → back to 'name' (sortCycle).
  const sortDefaultDesc = (k: ClientSortKey) => clientSortIsDesc(k, null);
  const applySortTap = (k: ClientSortKey) => {
    const n = cycleSort(k, sortBy, sortDesc, sortDefaultDesc, 'name');
    setSortBy(n.sortBy); setSortDesc(n.sortDesc);
  };
  const sortHint = sortTapClears(sortBy, sortDesc, sortDefaultDesc, 'name') ? full.common.filters.tapToClear : full.common.filters.tapToReverse;
  const [sortOpen, setSortOpen] = useState(false);
  const [quick, setQuick] = useState<ClientQuickFilter[]>([]);
  const [dateField, setDateField] = useState<ClientDateField>('added');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<AppliedDatePreset | null>(null);
  const filtersKey = businessId ? `${CLIENTS_FILTERS_KEY}.${businessId}` : CLIENTS_FILTERS_KEY;
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGroupBy(parseClientGroupKey(window.localStorage.getItem(groupKey)));
      let raw: string | null = null;
      try { raw = window.localStorage.getItem(filtersKey); } catch { /* private mode */ }
      const f = parseClientsFilters(raw);
      setSortBy(f.sortBy); setSortDesc(f.sortDesc); setQuick(f.quick);
      setDateField(f.dateField); setDateFrom(f.dateFrom); setDateTo(f.dateTo); setDatePreset(f.datePreset);
    }
    setGroupHydrated(true);
  }, [groupKey, filtersKey]);
  useEffect(() => {
    if (!groupHydrated) return;
    try {
      window.localStorage.setItem(filtersKey, JSON.stringify({ sortBy, sortDesc, quick, dateField, dateFrom, dateTo, datePreset }));
    } catch { /* private mode */ }
  }, [groupHydrated, filtersKey, sortBy, sortDesc, quick, dateField, dateFrom, dateTo, datePreset]);
  const tl = t.listTools;
  const tf = full.common.filters;
  const tdate = full.dashboard.jobs.dateFilter;
  const dateLocale = locale === 'es' ? 'es-MX' : 'en-US';
  const dateRangePresets = buildHistoryRangePresets(full.dashboard.reports.payroll.historyPresets);
  const rolledPreset = rollDatePreset(dateRangePresets, datePreset, dateFrom, dateTo);
  useEffect(() => {
    if (!rolledPreset) return;
    setDateFrom(rolledPreset.from); setDateTo(rolledPreset.to); setDatePreset(rolledPreset);
  }, [rolledPreset?.key, rolledPreset?.from, rolledPreset?.to]);
  const alpha = clientSortIsAlpha(sortBy, sortDesc);
  const dateActive = !!dateFrom || !!dateTo;
  const toggleQuick = (k: ClientQuickFilter) =>
    setQuick(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const barFilters: BarFilter[] = [
    {
      key: 'date',
      label: tf.date,
      Icon: Calendar,
      active: dateActive,
      value: `${tl.fields[dateField]} · ${dateRangeChipText(dateFrom, dateTo, dateRangePresets.find(p => p.key === datePreset?.key)?.label, dateLocale)}`,
      onRemove: () => { setDateFrom(null); setDateTo(null); setDatePreset(null); },
      panel: close => (
        <DateFilterPanel<ClientDateField>
          title={tf.date}
          fieldLabel={tl.dateField}
          fields={(['added', 'invoiced'] as ClientDateField[]).map(k => ({ key: k, label: tl.fields[k] }))}
          field={dateField}
          presets={dateRangePresets}
          from={dateFrom}
          to={dateTo}
          onApply={({ field, from, to, preset }) => {
            if (field) setDateField(field);
            setDateFrom(from); setDateTo(to); setDatePreset(toAppliedDatePreset(preset));
          }}
          onClose={close}
          labels={{ from: tdate.from, to: tdate.to, cancel: tf.cancel, apply: tf.apply }}
        />
      ),
    },
    ...CLIENT_QUICK_CHIPS.map(({ key, Icon }): BarFilter => ({
      key,
      label: tl.quick[key],
      Icon,
      active: quick.includes(key),
      onToggle: () => toggleQuick(key),
      onRemove: () => toggleQuick(key),
    })),
  ];
  useEffect(() => {
    if (!groupHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(groupKey, groupBy);
  }, [groupHydrated, groupKey, groupBy]);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupOptions = useMemo<{ key: ClientGroupKey; label: string }[]>(() => [
    { key: 'name', label: t.group.name },
    { key: 'company', label: t.group.company },
    { key: 'state', label: t.group.state },
    { key: 'city', label: t.group.city },
    ...customFieldTemplates.map(tpl => ({ key: `custom:${tpl.field_key}` as ClientGroupKey, label: tpl.field_label })),
  ], [t, customFieldTemplates]);
  const emptyLabel =
    groupBy === 'company' ? t.group.noCompany :
    groupBy === 'state' ? t.group.noState :
    groupBy === 'city' ? t.group.noCity :
    t.group.noValue;

  // In server mode `clients` is ALREADY the search-filtered page(s) from the DB,
  // so we don't re-filter — we only group the loaded rows. In client mode we
  // filter the full array (own fields + contact people; state name ↔ abbr
  // expansion is handled inside — see clientSearch / usStates).
  const filtered = useMemo(
    () => serverMode ? clients : clients.filter((c) => clientMatchesSearch(c, search)),
    [clients, search, serverMode],
  );

  const searching = search.trim().length > 0;

  // Server mode: report search + group changes UP so the wrapper re-queries.
  // Search is debounced so we don't fire a query per keystroke. Gated on
  // `groupHydrated` so the first query uses the restored group-by.
  // Search arrives as a PROP (container owns/persists it). Debounce only once
  // the user has actually typed — the container's async restore must apply
  // instantly or the list briefly shows unfiltered rows before "reapplying".
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTypedRef = useRef(false);
  useEffect(() => {
    if (!searchTypedRef.current) { setDebouncedSearch(search); return; }
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !groupHydrated) return;
    onFiltersChange({ search: debouncedSearch, groupBy, sortBy, sortDesc, quick, dateField, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, groupHydrated, debouncedSearch, groupBy, sortBy, sortDesc, quick, dateField, dateFrom, dateTo]);

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
  // Sections by the chosen group key; A–Z by default. Flat while searching.
  // Any sort but A–Z (with the default name grouping) keeps the server's order
  // as one flat list — letter sections would re-sort it by name.
  const flatOrdered = !alpha && groupBy === 'name';
  const sections = useMemo(
    () => flatOrdered
      ? (filtered.length ? [{ title: '', data: filtered }] : [])
      : groupClients(filtered, groupBy, searching, { emptyLabel, formatState: s => usStateName(s, locale) }),
    [filtered, groupBy, searching, emptyLabel, locale, flatOrdered],
  );

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedCountText = (selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural)
    .replace('{{count}}', String(selectedIds.size));
  // Never blank loaded rows during a refetch — loading only matters when empty.
  const showList = filtered.length > 0;

  // Selection mode — entered via the Seleccionar button (same pattern as the
  // jobs list). Checkboxes only render while it's on; no persistent controls.
  const [selectMode, setSelectMode] = useState(false);
  const lastPickRef = useRef<string | null>(null);
  const exitSelect = () => {
    setSelectMode(false);
    onClearSelection();
    lastPickRef.current = null;
  };
  // Shift-click selects the visible range between the last plain click and
  // this row (standard desktop multi-select). Order = rendered sections.
  const handleSelectClick = (id: string, shiftKey?: boolean) => {
    const anchor = lastPickRef.current;
    if (shiftKey && anchor && anchor !== id && onSelectMany) {
      const order = sections.flatMap(sec => sec.data);
      const a = order.findIndex(c => c.id === anchor);
      const b = order.findIndex(c => c.id === id);
      if (a >= 0 && b >= 0) {
        onSelectMany(order.slice(Math.min(a, b), Math.max(a, b) + 1).map(c => c.id));
        return; // anchor stays at the plain click
      }
    }
    lastPickRef.current = id;
    onToggleSelect(id);
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">
            {search.trim() || quick.length || dateActive
              ? t.countFound.replace('{{count}}', String(serverMode ? (serverTotal ?? filtered.length) : filtered.length))
              : t.countTotal.replace('{{count}}', String(serverMode ? (serverTotal ?? clients.length) : clients.length))}
          </p>
        </div>
        <div className="flex gap-2">
          {onImportPress ? (
            <Tooltip tip="importClients" labelled>
              <button onClick={onImportPress} className="flex items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl text-sm font-semibold text-ink hover:bg-surface">
                <Upload size={15} /> {t.importBtn}
              </button>
            </Tooltip>
          ) : null}
          {onNewClientPress ? (
            <button onClick={onNewClientPress} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90">
              <Plus size={15} /> {t.newClient}
            </button>
          ) : null}
        </div>
      </div>

      {/* Fetch failed — say so instead of showing stale rows silently. */}
      {loadError ? (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <p className="flex-1 text-xs text-ink">{full.common.listLoadFailed}</p>
          {onRetryLoad ? (
            <button onClick={onRetryLoad} className="text-xs font-semibold text-primary hover:underline">
              {full.common.loadError.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Search + view controls (jobs-layout pattern: controls beside the bar) */}
      <div className="flex items-start gap-2 mb-4">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input
          value={search}
          onChange={(e) => { searchTypedRef.current = true; onSearchChange(e.target.value); }}
          placeholder={t.searchPlaceholder}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-2xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
          {/* Sort — tap a new sort for its default direction, the selected one
              again to reverse it. */}
          <div className="relative">
            <button
              onClick={() => { setGroupMenuOpen(false); setSortOpen(o => !o); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                !alpha ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-ink hover:bg-surface'
              }`}
            >
              <ArrowUpDown size={15} /> {tl.sort[sortBy]}
            </button>
            {sortOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 mt-2 z-20 w-64 bg-card rounded-2xl border border-border-soft shadow-lg p-2">
                  <p className="text-[11px] font-semibold text-faint uppercase tracking-wider px-2 pt-1 pb-2">{tl.sortTitle}</p>
                  {CLIENT_SORT_KEYS.map(k => {
                    const selected = sortBy === k;
                    const desc = clientSortIsDesc(k, selected ? sortDesc : null);
                    return (
                      <button
                        key={k}
                        onClick={() => applySortTap(k)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left ${selected ? 'bg-primary/10' : 'hover:bg-surface'}`}
                      >
                        <span className="flex-1">
                          <span className={`block text-sm ${selected ? 'text-primary font-semibold' : 'text-ink'}`}>{tl.sort[k]}</span>
                          {selected ? <span className="block text-[11px] text-muted">{tl.dir[clientSortCaption(k, desc)]} · {sortHint}</span> : null}
                        </span>
                        {selected ? (desc ? <ArrowDown size={15} className="text-primary" /> : <ArrowUp size={15} className="text-primary" />) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
          {/* Group-by control — highlighted when not the default A–Z. */}
          <div className="relative">
            <button
              onClick={() => { setSortOpen(false); setGroupMenuOpen(o => !o); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                groupBy !== 'name' ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-ink hover:bg-surface'
              }`}
            >
              <Layers size={15} /> {t.group.button}
            </button>
            {groupMenuOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setGroupMenuOpen(false)} />
                <div className="absolute right-0 mt-2 z-20 bg-card rounded-2xl border border-border-soft shadow-lg p-3 w-64">
                  <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-2">{t.group.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {groupOptions.map(o => {
                      const selected = groupBy === o.key;
                      return (
                        <button
                          key={o.key}
                          onClick={() => { setGroupBy(groupBy === o.key ? 'name' : o.key); setGroupMenuOpen(false); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                            selected ? 'bg-primary border-primary text-white' : 'bg-card border-border text-muted hover:border-border'
                          }`}
                        >
                          {selected ? <Check size={12} /> : null}
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          {onBulkDeletePress ? (
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              title={t.selectButton}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                selectMode ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-ink hover:bg-surface'
              }`}
            >
              <ListChecks size={15} /> {t.selectButton}
            </button>
          ) : null}
      </div>

      {/* Filters — active ones as removable chips, "＋ Filter" adds more
          (mobile twin: the Filters sheet). */}
      <FilterBar filters={barFilters} addLabel={tf.add} clearAllLabel={tf.clearAll} className="mb-4" />

      {/* Selection bar — visible while select mode is on (jobs-list pattern). */}
      {selectMode ? (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-4">
          <button onClick={exitSelect} className="p-1 rounded text-primary hover:bg-primary/10">✕</button>
          <span className="text-sm font-medium text-primary">{selectedCountText}</span>
          {filtered.length > 0 ? (
            <button onClick={onToggleSelectAll} className="text-xs font-semibold text-primary hover:underline">
              {allSelected ? full.dashboard.jobs.batchInvoice.deselectAll : t.selectAll}
            </button>
          ) : null}
          <div className="flex-1" />
          {onBulkDeletePress ? (
            <button
              onClick={onBulkDeletePress}
              disabled={bulkDeleting || selectedIds.size === 0}
              className="flex items-center gap-1.5 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              <Trash2 size={14} /> {t.bulkDelete}{selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* List card — loading only skeletons when there are NO rows */}
      {loading && filtered.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 rounded-2xl border border-border-soft bg-card px-4 py-4">
              <div className="w-10 h-10 rounded-full bg-border-soft" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/5 rounded bg-border-soft" />
                <div className="h-3 w-2/5 rounded bg-border-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && searching ? (
        // Search is the only row-hiding filter here; grouping is kept.
        <FilteredEmpty onClear={() => onSearchChange('')} icon={<User size={40} className="text-faint" />} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <User size={40} className="text-faint" />
          <p className="text-sm text-faint mt-3">{t.emptyAll}</p>
          {onNewClientPress ? (
            <button onClick={onNewClientPress} className="text-primary text-sm font-medium mt-1 hover:underline">{t.addFirst}</button>
          ) : null}
        </div>
      ) : (
        <div className={`bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden ${selectMode ? 'select-none' : ''}`}>
          {sections.map((s) => (
            <Fragment key={s.title || 'results'}>
              {s.title ? (
                // top-14 clears the fixed mobile top bar; desktop sticks at 0.
                <div className="sticky top-14 md:top-0 z-10 bg-surface px-5 py-1 border-b border-border text-xs font-bold text-muted">
                  {s.title}
                </div>
              ) : null}
              {s.data.map((c) => (
                <ClientRow
                  key={c.id}
                  client={c}
                  search={search}
                  selectMode={selectMode}
                  isChecked={selectedIds.has(c.id)}
                  onToggleSelect={handleSelectClick}
                  onClientPress={onClientPress}
                  onEditPress={onEditPress}
                  onDeletePress={onDeletePress}
                  stat={clientRowStat(c, { sortBy, quick }, tl.stat, dateLocale)}
                />
              ))}
            </Fragment>
          ))}
          {/* Infinite-scroll footer: sentinel triggers the next page, spinner
             shows while it loads. */}
          {serverMode ? (
            <>
              {loadingMore ? (
                <>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="border-t border-border-soft">
                      <SkeletonRow />
                    </div>
                  ))}
                </>
              ) : null}
              <div ref={sentinelRef} className="h-1" />
            </>
          ) : null}
        </div>
      )}

      {showList ? <div className="h-2" /> : null}
      {bottomSlot}
    </div>
  );
}

const ClientRow = memo(function ClientRow({
  client: c,
  search,
  selectMode,
  isChecked,
  onToggleSelect,
  onClientPress,
  onEditPress,
  onDeletePress,
  stat,
}: {
  stat?: { text: string; tone: 'danger' | 'muted' } | null;
  client: ClientListItem;
  search: string;
  selectMode: boolean;
  isChecked: boolean;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  onClientPress: (id: string) => void;
  onEditPress?: (id: string) => void;
  onDeletePress?: (id: string) => void;
}) {
  const matchedContacts = matchingContacts(c, search);
  return (
    // content-visibility skips layout/paint for offscreen rows — keeps huge
    // client lists cheap. Intrinsic size ≈ row height so scrolling stays smooth.
    <div className={`[content-visibility:auto] [contain-intrinsic-size:auto_76px] group flex items-center gap-3 px-5 py-4 border-b border-b-border-soft last:border-b-0 ${isChecked ? 'bg-primary/5' : 'hover:bg-surface'}`}>
      {/* Checkbox only exists while selection mode is on (jobs-list pattern). */}
      {selectMode ? (
        <span
          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'border-primary bg-primary' : 'border-border bg-card'}`}
        >
          {isChecked ? <span className="text-white text-[10px] font-bold">✓</span> : null}
        </span>
      ) : null}
      <button
        // Lets the page's scroll restore find and re-center this exact row
        // when the user returns from the client detail.
        data-scroll-anchor={c.id}
        onClick={(e) => (selectMode ? onToggleSelect(c.id, e.shiftKey) : onClientPress(c.id))}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-primary text-sm font-bold">
            {(c.firstName || c.company || '?').charAt(0).toUpperCase()}{(c.lastName || '').charAt(0).toUpperCase()}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink truncate">
            {(c.firstName || c.lastName)
              ? <>{c.firstName} {c.lastName}{c.company ? <span className="text-faint font-normal"> · {c.company}</span> : null}</>
              : (c.company || '—')}
          </span>
          {/* Compact meta under the name only when the columns are hidden. */}
          <span className="md:hidden flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {c.phoneDisplay ? <span className="flex items-center gap-1 text-xs text-faint"><Phone size={11} /> {c.phoneDisplay}</span> : null}
            {c.emailDisplay ? (
              <span className="flex items-center gap-1 text-xs text-faint min-w-0">
                <Mail size={11} className="shrink-0" /> <span className="truncate">{c.emailDisplay}</span>
              </span>
            ) : null}
          </span>
          {matchedContacts.length > 0 ? (
            <span className="flex flex-col gap-0.5 mt-1">
              {matchedContacts.map((ct, i) => (
                <span key={i} className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Users size={11} /> {ct.name}{ct.role ? `  ·  ${ct.role}` : ''}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {/* Aligned columns across the row's width: phone | email | location.
           Fixed widths keep every row lined up; they drop off as the window
           narrows (xl → lg → md). */}
        <span className="hidden md:flex w-44 shrink-0 items-center gap-1 text-xs text-faint">
          {c.phoneDisplay ? (<><Phone size={11} className="shrink-0" /> {c.phoneDisplay}</>) : null}
        </span>
        <span className="hidden lg:flex w-64 shrink-0 items-center gap-1 text-xs text-faint min-w-0">
          {c.emailDisplay ? (<><Mail size={11} className="shrink-0" /> <span className="truncate">{c.emailDisplay}</span></>) : null}
        </span>
        <span className="hidden xl:flex w-44 shrink-0 items-center gap-1 text-xs text-faint min-w-0">
          {c.city ? (<><MapPin size={11} className="shrink-0" /> <span className="truncate">{c.city}{c.state ? `, ${c.state}` : ''}</span></>) : null}
        </span>
      </button>
      {stat ? (
        <span className={`shrink-0 text-xs font-semibold ${stat.tone === 'danger' ? 'text-red-500' : 'text-muted'}`}>{stat.text}</span>
      ) : null}
      {/* Hover actions — web idiom; hidden while selecting. Each button only
         renders when its callback is present (role gating). */}
      {onEditPress || onDeletePress ? (
        <div className={`flex items-center gap-1 opacity-0 transition-opacity shrink-0 ${selectMode ? '' : 'group-hover:opacity-100'}`}>
          {onEditPress ? (
            <button onClick={() => onEditPress(c.id)} className="p-2 rounded-lg text-faint hover:text-ink hover:bg-border-soft" aria-label="Edit">
              <Pencil size={15} />
            </button>
          ) : null}
          {onDeletePress ? (
            <button onClick={() => onDeletePress(c.id)} className="p-2 rounded-lg text-faint hover:text-red-600 hover:bg-red-500/10" aria-label="Delete">
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
