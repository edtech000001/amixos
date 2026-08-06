'use client';

// Web-only ClientsListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as ClientsListScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { Fragment, memo, useEffect, useMemo, useState, type ReactNode, useRef } from 'react';
import { Plus, Search, Upload, Trash2, Phone, Mail, MapPin, Pencil, User, Users, X, Layers, Check, ListChecks } from 'lucide-react';
import { useLang } from '../../i18n';
import { clientMatchesSearch, matchingContacts } from '../../lib/clientSearch';
import { groupClients, parseClientGroupKey, CLIENTS_GROUP_KEY, type ClientGroupKey } from '../../lib/clientSections';
import { usStateName } from '../../lib/usStates';

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
}

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
  onFiltersChange?: (f: { search: string; groupBy: ClientGroupKey }) => void;
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
  useEffect(() => {
    if (typeof window !== 'undefined') setGroupBy(parseClientGroupKey(window.localStorage.getItem(groupKey)));
    setGroupHydrated(true);
  }, [groupKey]);
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !groupHydrated) return;
    onFiltersChange({ search: debouncedSearch, groupBy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, groupHydrated, debouncedSearch, groupBy]);

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
  const sections = useMemo(
    () => groupClients(filtered, groupBy, searching, { emptyLabel, formatState: s => usStateName(s, locale) }),
    [filtered, groupBy, searching, emptyLabel, locale],
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
            {search.trim()
              ? t.countFound.replace('{{count}}', String(serverMode ? (serverTotal ?? filtered.length) : filtered.length))
              : t.countTotal.replace('{{count}}', String(serverMode ? (serverTotal ?? clients.length) : clients.length))}
          </p>
        </div>
        <div className="flex gap-2">
          {onImportPress ? (
            <button onClick={onImportPress} className="flex items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl text-sm font-semibold text-ink hover:bg-surface">
              <Upload size={15} /> {t.importBtn}
            </button>
          ) : null}
          {onNewClientPress ? (
            <button onClick={onNewClientPress} className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90">
              <Plus size={15} /> {t.newClient}
            </button>
          ) : null}
        </div>
      </div>

      {/* Search + view controls (jobs-layout pattern: controls beside the bar) */}
      <div className="flex items-start gap-2 mb-4">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
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
          {/* Group-by control — highlighted when not the default A–Z. */}
          <div className="relative">
            <button
              onClick={() => setGroupMenuOpen(o => !o)}
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
                          onClick={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
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
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <User size={40} className="text-faint" />
          <p className="text-sm text-faint mt-3">{search ? t.emptyNoMatch : t.emptyAll}</p>
          {!search && onNewClientPress ? (
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
                />
              ))}
            </Fragment>
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
}: {
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
