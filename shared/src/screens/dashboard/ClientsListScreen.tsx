import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  View,
  ActivityIndicator,
  Text,
  Pressable,
  FlatList,
  type ViewToken,
} from 'react-native';
import {
  Search,
  Phone,
  Mail,
  MapPin,
  Trash2,
  User,
  Users,
  Upload,
  X,
  ArrowUp,
  ArrowDown,
  UserPlus,
  Receipt,
  CircleDollarSign,
  AlertCircle,
  Briefcase,
  Moon,
  MailX,
  ListChecks,
  AlertTriangle,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { cycleSort, sortTapClears } from '../../lib/sortCycle';
import { useThemeColors } from '../../theme';
import { Input } from '../../ui/Input';
import { Fab } from '../../ui/Fab';
import { FilteredEmpty } from '../../ui/FilteredEmpty';
import { SkeletonList, SkeletonRow } from '../../ui/Skeleton';
import { clientMatchesSearch, matchingContacts } from '../../lib/clientSearch';
import { groupClients, parseClientGroupKey, CLIENTS_GROUP_KEY, type ClientSection, type ClientGroupKey } from '../../lib/clientSections';
import { usStateName } from '../../lib/usStates';
import { ScreenTitle } from '../../ui/ScreenTitle';
import { FilterSheet, FilterSection, Segmented, FilterChip, ChipWrap, DateRangeFields, FilterButton, showResultsLabel } from '../../ui/FilterSheet';
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
import { CLIENTS_FILTERS_KEY, DEFAULT_CLIENTS_FILTERS, parseClientsFilters, clientRowStat, type ClientRowStats } from '../../lib/clientsFilters';

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

/** What the screen reports up in server mode. */
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

/** "Show only" chips in the Filters sheet / web filter bar. */
export const CLIENT_QUICK_CHIPS: { key: ClientQuickFilter; Icon: typeof User }[] = [
  { key: 'recent_added', Icon: UserPlus },
  { key: 'recent_invoiced', Icon: Receipt },
  { key: 'owes', Icon: CircleDollarSign },
  { key: 'overdue', Icon: AlertCircle },
  { key: 'active_jobs', Icon: Briefcase },
  { key: 'inactive', Icon: Moon },
  { key: 'no_email', Icon: MailX },
];

export interface ClientsListScreenProps {
  /** Mobile: shown as a ← before the title when opened from Más. */
  onBack?: () => void;
  loading: boolean;
  clients: ClientListItem[];
  search: string;
  onSearchChange: (text: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Shift-click range add — web-only idiom; unused on native. */
  onSelectMany?: (ids: string[]) => void;
  onToggleSelectAll: () => void;
  onClientPress: (id: string) => void;
  /** Omit to hide per-row edit (web) — no edit permission. */
  onEditPress?: (id: string) => void;
  /** Omit to hide per-row delete (web) — no delete permission. */
  onDeletePress?: (id: string) => void;
  /** Omit to hide the New/Fab + empty-state create link — no create permission. */
  onNewClientPress?: () => void;
  onImportPress?: () => void;
  /** Omit to hide the multi-select toggle + bulk-delete pill — no delete permission. */
  onBulkDeletePress?: () => void;
  onClearSelection: () => void;
  bulkDeleting: boolean;
  /** Custom-field definitions, for the "group by custom field" menu options. */
  customFieldTemplates?: { field_key: string; field_label: string }[];
  /** Optional slot rendered at the bottom (e.g. modals on web). */
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
  /** Server mode only: reload the list starting at `letter` ('#' = names that
   *  do not begin with A–Z). Without this the A–Z index can only reach rows
   *  that happen to be loaded, which with 50-row pages is the first two or
   *  three letters. */
  onJumpToLetter?: (letter: string) => void;
}

/** The index is the whole alphabet in server mode, not just the letters that
 *  turned up in the loaded pages — the point of the control is to reach rows
 *  you have NOT loaded. '#' collects anything not starting with A–Z. */
const FULL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('#');

type Section = ClientSection<ClientListItem>;

// Flattened FlatList rows: a single leading list-header (title/search/bulk
// bar), then a sticky letter header + client rows per section, then a footer.
// Every row carries its `letter` so the active-letter indicator can read it
// straight off the topmost visible item.
type Row =
  | { type: 'listheader'; key: string; letter: '' }
  | { type: 'header'; key: string; letter: string }
  | { type: 'client'; key: string; letter: string; client: ClientListItem; isLast: boolean }
  | { type: 'footer'; key: string; letter: '' };

export function ClientsListScreen({
  onBack,
  loading,
  clients,
  search,
  onSearchChange,
  selectedIds,
  onToggleSelect,
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
  onJumpToLetter,
}: ClientsListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;
  const c = useThemeColors();

  // Multi-select (select mode + bulk delete) only makes sense when the caller
  // can actually delete — hide the toggle, long-press entry, and pill otherwise.
  const canBulkDelete = !!onBulkDeletePress;

  // Group-by control (mirrors the jobs list). 'name' = A–Z (default). The
  // choice persists across navigation + refresh via AsyncStorage.
  const [groupBy, setGroupBy] = useState<ClientGroupKey>('name');
  // Sort, filters and date range (migration 252) — all in the Filters sheet.
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ClientSortKey>('name');
  const [sortDesc, setSortDesc] = useState<boolean | null>(null);
  // Sort chips: tap → select, again → reverse, third tap → back to 'name' (sortCycle).
  const sortDefaultDesc = (k: ClientSortKey) => clientSortIsDesc(k, null);
  const applySortTap = (k: ClientSortKey) => {
    const n = cycleSort(k, sortBy, sortDesc, sortDefaultDesc, 'name');
    setSortBy(n.sortBy); setSortDesc(n.sortDesc);
  };
  const sortHint = sortTapClears(sortBy, sortDesc, sortDefaultDesc, 'name') ? full.common.filters.tapToClear : full.common.filters.tapToReverse;
  const [quick, setQuick] = useState<ClientQuickFilter[]>([]);
  const [dateField, setDateField] = useState<ClientDateField>('added');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<AppliedDatePreset | null>(null);
  const groupHydrated = useRef(false);
  // A state mirror of groupHydrated so the server-mode report effect (below)
  // re-runs once hydration finishes — a ref alone wouldn't trigger it.
  const [ready, setReady] = useState(false);
  // Scope the group-by per business so it doesn't carry across companies.
  const groupKey = businessId ? `${CLIENTS_GROUP_KEY}.${businessId}` : CLIENTS_GROUP_KEY;
  const filtersKey = businessId ? `${CLIENTS_FILTERS_KEY}.${businessId}` : CLIENTS_FILTERS_KEY;
  useEffect(() => {
    let cancelled = false;
    groupHydrated.current = false;
    Promise.all([AsyncStorage.getItem(groupKey), AsyncStorage.getItem(filtersKey)])
      .then(([rawGroup, rawFilters]) => {
        if (cancelled) return;
        setGroupBy(parseClientGroupKey(rawGroup));
        const f = parseClientsFilters(rawFilters);
        setSortBy(f.sortBy); setSortDesc(f.sortDesc); setQuick(f.quick);
        setDateField(f.dateField); setDateFrom(f.dateFrom); setDateTo(f.dateTo); setDatePreset(f.datePreset);
      })
      .catch(() => {})
      .finally(() => { groupHydrated.current = true; setReady(true); });
    return () => { cancelled = true; };
  }, [groupKey, filtersKey]);
  useEffect(() => {
    if (!groupHydrated.current) return;
    void AsyncStorage.setItem(groupKey, groupBy).catch(() => {});
  }, [groupKey, groupBy]);
  useEffect(() => {
    if (!groupHydrated.current) return;
    void AsyncStorage.setItem(filtersKey, JSON.stringify({ sortBy, sortDesc, quick, dateField, dateFrom, dateTo, datePreset })).catch(() => {});
  }, [filtersKey, sortBy, sortDesc, quick, dateField, dateFrom, dateTo, datePreset]);

  const tl = t.listTools;
  const tf = full.common.filters;
  const tdate = full.dashboard.jobs.dateFilter;
  const dateRangePresets = buildHistoryRangePresets(full.dashboard.reports.payroll.historyPresets);
  // A picked relative preset ("This month") rolls forward with the calendar.
  const rolledPreset = rollDatePreset(dateRangePresets, datePreset, dateFrom, dateTo);
  useEffect(() => {
    if (!rolledPreset) return;
    setDateFrom(rolledPreset.from); setDateTo(rolledPreset.to); setDatePreset(rolledPreset);
  }, [rolledPreset?.key, rolledPreset?.from, rolledPreset?.to]);
  const alpha = clientSortIsAlpha(sortBy, sortDesc);
  const dateActive = !!dateFrom || !!dateTo;
  // Badge on the Filters button: one per active section / quick filter.
  const filterCount = (alpha ? 0 : 1) + (groupBy !== 'name' ? 1 : 0) + (dateActive ? 1 : 0) + quick.length;
  const resetFilters = () => {
    setGroupBy('name');
    const d = DEFAULT_CLIENTS_FILTERS;
    setSortBy(d.sortBy); setSortDesc(d.sortDesc); setQuick(d.quick);
    setDateField(d.dateField); setDateFrom(null); setDateTo(null); setDatePreset(null);
  };
  const toggleQuick = (k: ClientQuickFilter) =>
    setQuick(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
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
  //
  // EXCEPT while the server search is still on its way (debounce window or the
  // request in flight): then the rows on screen belong to the PREVIOUS search,
  // so we filter them locally for instant feedback instead of leaving the old
  // list up looking frozen. The server's complete results replace them on
  // arrival. Declared before `filtered` — see serverSearchPending below.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const serverSearchPending = serverMode && !!search.trim() && (loading || search !== debouncedSearch);
  const filtered = useMemo(
    () => (!serverMode || serverSearchPending)
      ? clients.filter(c => clientMatchesSearch(c, search))
      : clients,
    [clients, search, serverMode, serverSearchPending],
  );

  const searching = search.trim().length > 0;

  // Server mode: report search + group changes UP so the wrapper re-queries.
  // Search is debounced so we don't fire a query per keystroke. Gated on `ready`
  // so the first query uses the restored group-by.
  // Search arrives as a PROP (container owns/persists it). Debounce only once
  // the user has actually typed — the container's async restore must apply
  // instantly or the list briefly shows unfiltered rows before "reapplying".
  const searchTypedRef = useRef(false);
  useEffect(() => {
    if (!searchTypedRef.current) { setDebouncedSearch(search); return; }
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !ready) return;
    onFiltersChange({ search: debouncedSearch, groupBy, sortBy, sortDesc, quick, dateField, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, ready, debouncedSearch, groupBy, sortBy, sortDesc, quick, dateField, dateFrom, dateTo]);
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
  const serverJump = serverMode && !!onJumpToLetter;
  const letters = useMemo(
    () => (serverJump ? FULL_ALPHABET : sections.map(s => s.title).filter(Boolean)),
    [serverJump, sections],
  );

  // Selection mode: entered via the header Seleccionar button (same pattern
  // as the jobs list) or by long-pressing a row; exited via the ✕ in the bar.
  // No persistent checkboxes.
  const [selectMode, setSelectMode] = useState(false);
  const selectionMode = selectMode || selectedIds.size > 0;
  // Stable identity — passed into the memo'd ClientRow (long-press exit).
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    onClearSelection();
  }, [onClearSelection]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedCountText = (
    selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural
  ).replace('{{count}}', String(selectedIds.size));

  // Never blank loaded rows during a refetch — loading only matters when empty.
  const showList = filtered.length > 0;
  const lastSection = sections.length > 0 ? sections[sections.length - 1] : null;
  const lastClientId = lastSection ? lastSection.data[lastSection.data.length - 1].id : null;

  // Flatten the sections into a single row list so we can drive a plain
  // FlatList. SectionList's scrollToLocation can't reach unrendered sections
  // and its imperative scroll node is unreliable; a flat list with fixed-height
  // rows lets us supply getItemLayout, so scrollToIndex jumps land exactly.
  // Sticky letter headers come from stickyHeaderIndices.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ type: 'listheader', key: '__listheader', letter: '' }];
    if (showList) {
      for (const s of sections) {
        if (s.title) out.push({ type: 'header', key: `__h_${s.title}`, letter: s.title });
        for (const client of s.data) {
          out.push({
            type: 'client',
            key: client.id,
            letter: s.title,
            client,
            isLast: client.id === lastClientId,
          });
        }
      }
    }
    out.push({ type: 'footer', key: '__footer', letter: '' });
    return out;
  }, [sections, showList, lastClientId]);

  const stickyHeaderIndices = useMemo(
    () => rows.reduce<number[]>((acc, r, i) => (r.type === 'header' ? (acc.push(i), acc) : acc), []),
    [rows],
  );
  const headerIndexByLetter = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.type === 'header') m.set(r.letter, i);
    });
    return m;
  }, [rows]);

  // Letter the list is currently scrolled to — highlighted in the scrubber.
  // Functional set bails out when unchanged so scrolling within a section
  // doesn't re-render anything.
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems.find(v => (v.item as Row | undefined)?.letter);
      const letter = (first?.item as Row | undefined)?.letter;
      if (letter) setActiveLetter(prev => (prev === letter ? prev : letter));
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const listRef = useRef<FlatList<Row>>(null);

  // Exact, failure-proof jumps need deterministic offsets. In alphabetical mode
  // every row is a fixed height (CLIENT_ROW_H / LETTER_HEADER_H / CARD_EDGE_H);
  // only the leading list-header varies, so we measure it. With a real
  // getItemLayout, scrollToIndex always lands on the precise section — no
  // estimate drift (which undershot big sections) and no scrollToIndex bailing
  // to the top (which is what made taps jump back to A).
  const [listHeaderH, setListHeaderH] = useState(LIST_HEADER_H);

  const rowHeight = (r: Row) =>
    r.type === 'listheader'
      ? listHeaderH
      : r.type === 'header'
        ? LETTER_HEADER_H
        : r.type === 'footer'
          ? CARD_EDGE_H
          : CLIENT_ROW_H;

  const offsets = useMemo(() => {
    const arr = new Array<number>(rows.length + 1);
    let y = 0;
    for (let i = 0; i < rows.length; i++) {
      arr[i] = y;
      y += rowHeight(rows[i]);
    }
    arr[rows.length] = y;
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, listHeaderH]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Row> | null | undefined, index: number) => ({
      length: rowHeight(rows[index]),
      offset: offsets[index],
      index,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, offsets, listHeaderH],
  );

  const jumpToLetterIndex = (letterIdx: number) => {
    const letter = letters[letterIdx];
    const target = headerIndexByLetter.get(letter);
    if (target != null) {
      listRef.current?.scrollToIndex({ index: target, viewPosition: 0, animated: false });
      return;
    }
    // Not in the loaded pages. In server mode that is the normal case for most
    // of the alphabet, so refetch from there and go back to the top — the new
    // first row IS the letter. Client-side mode has everything loaded already,
    // so a miss there means the letter genuinely has no clients: do nothing
    // rather than scrolling somewhere arbitrary.
    if (!serverJump) return;
    onJumpToLetter?.(letter);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  // Leading list row — title, search, bulk bar, and the loading / empty
  // states. The top inset lives here (pt-6) rather than on the list's
  // contentContainer, so getItemLayout offsets can start cleanly at 0. The
  // FlatList's paddingHorizontal handles the side inset.
  const header = (
    <View className="pt-6">
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <ScreenTitle title={t.title} onBack={onBack} />
          <Text className="text-sm text-muted mt-0.5">
            {search.trim() || quick.length || dateActive
              ? t.countFound.replace('{{count}}', String(serverMode ? (serverTotal ?? filtered.length) : filtered.length))
              : t.countTotal.replace('{{count}}', String(serverMode ? (serverTotal ?? clients.length) : clients.length))}
          </Text>
        </View>
        <View className="flex-row gap-2">
          {/* Select-mode toggle — same entry point as the jobs list. Hidden
             when the caller can't bulk-delete. */}
          {canBulkDelete ? (
            <Pressable
              onPress={() => (selectionMode ? exitSelect() : setSelectMode(true))}
              accessibilityLabel={t.selectButton}
              className={`items-center justify-center px-3 py-2.5 rounded-xl border active:opacity-80 ${
                selectionMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'
              }`}
            >
              <ListChecks size={15} color={selectionMode ? c.primary : c.muted} />
            </Pressable>
          ) : null}
          {/* Filters — sort, group, date and quick filters in one sheet
              (FilterSheet at the screen root). */}
          <FilterButton count={filterCount} onPress={() => setFilterOpen(true)} label={tf.button} />
          {onImportPress ? (
            <Pressable
              onPress={onImportPress}
              className="flex-row items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl active:bg-surface"
            >
              <Upload size={15} color={c.muted} />
              <Text className="text-sm font-semibold text-ink">{t.importBtn}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Fetch failed — say so instead of showing stale rows silently. */}
      {loadError ? (
        <View className="flex-row items-center gap-3 mb-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle size={16} color="#f59e0b" />
          <Text className="flex-1 text-xs text-ink">{full.common.listLoadFailed}</Text>
          {onRetryLoad ? (
            <Pressable onPress={onRetryLoad} hitSlop={8}>
              <Text className="text-xs font-semibold text-primary">{full.common.loadError.retry}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="mb-4">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={(v) => { searchTypedRef.current = true; onSearchChange(v); }}
          onClear={() => onSearchChange('')}
          // Spinner while the server search runs, so a slow connection reads
          // as "searching", not "stuck".
          leftIcon={serverSearchPending
            ? <ActivityIndicator size="small" color={c.primary} />
            : <Search size={16} color={c.faint} />}
          // Search is case-insensitive — turn off iOS smart-capitalize +
          // autocorrect so the input doesn't start each query with a
          // capital letter or try to "correct" partial names.
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {selectionMode ? (
        // gap-2 + shrinkable count text + short "Todos" label: everything has
        // to fit a 375pt screen without pushing Eliminar past the bar's edge.
        <View className="flex-row items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 mb-4">
          <Pressable onPress={exitSelect} className="p-1 rounded">
            <X size={14} className="text-primary" />
          </Pressable>
          <Text
            className="text-sm font-medium text-primary flex-shrink"
            numberOfLines={1}
          >
            {selectedCountText}
          </Text>
          <View className="flex-1" />
          {!allSelected ? (
            <Pressable onPress={onToggleSelectAll} className="px-2 py-1.5 rounded-lg active:bg-primary/10">
              <Text className="text-xs font-semibold text-primary">{t.selectAllShort}</Text>
            </Pressable>
          ) : null}
          {/* Delete lives in the floating bottom pill (jobs pattern). */}
        </View>
      ) : null}

      {showList ? (
        // Rounded top edge of the white card; section headers + rows continue
        // the frame below it (mirrors the footer strip).
        <View className="bg-card rounded-t-2xl h-3" />
      ) : null}

      {loading && filtered.length === 0 ? (
        <SkeletonList rows={8} />
      ) : filtered.length === 0 && searching ? (
        // Search is the only row-hiding filter here; grouping is kept.
        <FilteredEmpty onClear={() => onSearchChange('')} icon={<User size={40} color={c.faint} />} />
      ) : filtered.length === 0 ? (
        <View className="items-center py-20">
          <User size={40} color={c.faint} />
          <Text className="text-sm text-faint mt-3">{t.emptyAll}</Text>
          {onNewClientPress ? (
            <Pressable onPress={onNewClientPress} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: Row; index: number }) => {
    if (item.type === 'listheader') {
      // The only variable-height row — measure it so getItemLayout stays exact.
      return (
        <View onLayout={e => setListHeaderH(Math.max(1, e.nativeEvent.layout.height))}>
          {header}
        </View>
      );
    }
    if (item.type === 'header') {
      return (
        <View
          className="bg-surface px-5 justify-center border-b border-b-border-soft"
          style={{ height: LETTER_HEADER_H }}
        >
          <Text className="text-xs font-bold text-muted">{item.letter}</Text>
        </View>
      );
    }
    if (item.type === 'client') {
      return (
        <ClientRow
          client={item.client}
          search={search}
          selectionMode={selectionMode}
          isChecked={selectedIds.has(item.client.id)}
          isLast={item.isLast}
          // Fixed height in alphabetical mode keeps getItemLayout exact; while
          // searching, rows size to content (matched contacts expand them).
          fixedHeight={searching ? undefined : CLIENT_ROW_H}
          canSelect={canBulkDelete}
          onToggleSelect={onToggleSelect}
          onClientPress={onClientPress}
          onExitSelect={exitSelect}
          stat={clientRowStat(item.client, { sortBy, quick }, tl.stat, locale === 'es' ? 'es-MX' : 'en-US')}
        />
      );
    }
    return (
      <>
        {showList ? (
          <View className="bg-card rounded-b-2xl h-3" />
        ) : null}
        {bottomSlot}
      </>
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={item => item.key}
        renderItem={renderRow}
        // Letter headers pin to the top as you scroll past them.
        stickyHeaderIndices={stickyHeaderIndices}
        // Exact section offsets — only in alphabetical mode, where rows are a
        // fixed height. While searching, rows size to content, so we let the
        // list measure them normally (no scrubber/jumps then anyway).
        getItemLayout={showList && !searching ? getItemLayout : undefined}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // 12px side inset so rows are visibly wider but the card still has a
        // small breathing margin from the screen edges. Top inset is on the
        // header row (pt-6) so getItemLayout offsets start at 0.
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: selectMode ? 256 : 144 }}
        // Tuning for long lists — keep the visible window small, recycle
        // aggressively. (No removeClippedSubviews: it glitches sticky headers
        // on Android.)
        initialNumToRender={15}
        windowSize={7}
        maxToRenderPerBatch={10}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (serverMode && hasMore && !loadingMore) onLoadMore?.(); }}
        ListFooterComponent={
          serverMode && loadingMore ? (
            <View>
              {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
            </View>
          ) : null
        }
      />

      {/* A–Z index — only meaningful for the alphabetical (name) grouping.
         Hugs the right edge (the Fab sits 20px in, no overlap). */}
      {showList && !searching && groupBy === 'name' && alpha && letters.length > 1 ? (
        <AlphabetScrubber
          letters={letters}
          activeLetter={activeLetter}
          onJump={jumpToLetterIndex}
        />
      ) : null}

      {/* New client — floating action, bottom-right thumb reach. Hidden while
         selecting so the delete pill owns the bottom edge (jobs pattern), and
         hidden entirely when the caller can't create. */}
      {selectionMode || !onNewClientPress ? null : <Fab onPress={onNewClientPress} />}

      {/* Bulk-delete pill — bottom-left, same as the jobs list. */}
      {selectionMode && onBulkDeletePress ? (
        <Pressable
          onPress={onBulkDeletePress}
          disabled={selectedIds.size === 0 || bulkDeleting}
          className="absolute bottom-32 left-5 flex-row items-center gap-2 px-5 h-14 rounded-full"
          style={{
            backgroundColor: selectedIds.size === 0 || bulkDeleting ? '#D1D5DB' : '#DC2626',
            elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Trash2 size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold">
            {`${t.bulkDelete}${selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}`}
          </Text>
        </Pressable>
      ) : null}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={tf.title}
        resetLabel={tf.reset}
        onReset={resetFilters}
        canReset={filterCount > 0}
        showLabel={showResultsLabel(tf, serverMode ? (serverTotal ?? filtered.length) : filtered.length)}
      >
        <FilterSection
          title={tf.sortBy}
          right={<Text className="text-xs text-faint">{tl.dir[clientSortCaption(sortBy, clientSortIsDesc(sortBy, sortDesc))]}</Text>}
        >
          <ChipWrap>
            {CLIENT_SORT_KEYS.map(k => {
              const selected = sortBy === k;
              const desc = clientSortIsDesc(k, selected ? sortDesc : null);
              return (
                <FilterChip
                  key={k}
                  label={tl.sort[k]}
                  on={selected}
                  // New sort → its default direction; the selected one again → reverse.
                  onPress={() => applySortTap(k)}
                  leading={selected ? (desc ? <ArrowDown size={15} color={c.primary} /> : <ArrowUp size={15} color={c.primary} />) : undefined}
                />
              );
            })}
          </ChipWrap>
          <Text className="text-xs text-faint mt-2">{sortHint}</Text>
        </FilterSection>

        <FilterSection title={tf.groupBy}>
          <ChipWrap>
            {groupOptions.map(o => (
              <FilterChip key={o.key} label={o.label} on={groupBy === o.key} onPress={() => setGroupBy(groupBy === o.key ? 'name' : o.key)} />
            ))}
          </ChipWrap>
        </FilterSection>

        <FilterSection title={tf.date}>
          <View className="gap-3">
            <Segmented<ClientDateField>
              options={(['added', 'invoiced'] as ClientDateField[]).map(k => ({ key: k, label: tl.fields[k] }))}
              value={dateField}
              onChange={setDateField}
            />
            <DateRangeFields
              presets={dateRangePresets}
              from={dateFrom}
              to={dateTo}
              onChange={({ from, to, preset }) => { setDateFrom(from); setDateTo(to); setDatePreset(toAppliedDatePreset(preset)); }}
              fromLabel={tdate.from}
              toLabel={tdate.to}
            />
          </View>
        </FilterSection>

        <FilterSection title={tf.showOnly}>
          <ChipWrap>
            {CLIENT_QUICK_CHIPS.map(({ key, Icon }) => (
              <FilterChip key={key} check label={tl.quick[key]} Icon={Icon} on={quick.includes(key)} onPress={() => toggleQuick(key)} />
            ))}
          </ChipWrap>
        </FilterSection>
      </FilterSheet>
    </View>
  );
}

// Nominal slot height per letter; the real value is derived from the measured
// strip height at runtime (the rendered glyph slot isn't exactly this), so the
// dot and drag math stay aligned regardless of font metrics / density.
const LETTER_H = 16;
const DOT_SIZE = 16;

// Fixed row heights for alphabetical mode — make section offsets deterministic
// so scrubber jumps land exactly (see getItemLayout). Client rows clip to this
// height; it fits the common avatar + name + two meta lines.
const CLIENT_ROW_H = 88;
const LETTER_HEADER_H = 28;
const CARD_EDGE_H = 8; // the rounded-bottom card strip (footer row)
const LIST_HEADER_H = 200; // initial estimate for the leading row until measured

/**
 * Vertical letter strip for jumping between sections — drag or tap a letter.
 * Only letters that actually have clients are shown. A primary dot slides to
 * the letter the list is scrolled to; while dragging, a bubble shows the
 * letter under the finger.
 */
function AlphabetScrubber({
  letters,
  activeLetter,
  onJump,
}: {
  letters: string[];
  activeLetter: string | null;
  onJump: (sectionIndex: number) => void;
}) {
  const lastIndex = useRef(-1);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Finger Y within the strip — drives the bubble position so it sits exactly
  // at the touch (no index→pixel mismatch).
  const [dragY, setDragY] = useState(0);
  const stripH = useRef(1);
  // Real per-letter height = measured strip height / letter count. Using this
  // instead of a hardcoded LETTER_H keeps the dot centered on its letter all
  // the way down the alphabet (a fixed guess drifts as the index grows).
  const [letterH, setLetterH] = useState(LETTER_H);
  const bubbleAnim = useRef(new Animated.Value(0)).current;

  // While dragging, the finger wins; otherwise follow the scroll position.
  const highlighted = dragIndex != null ? letters[dragIndex] : activeLetter;


  const handle = (y: number) => {
    const clamped = Math.min(stripH.current, Math.max(0, y));
    setDragY(clamped);
    const idx = Math.min(letters.length - 1, Math.max(0, Math.floor(clamped / letterH)));
    setDragIndex(prev => (prev === idx ? prev : idx));
    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      onJump(idx);
    }
  };

  const startDrag = (y: number) => {
    handle(y);
    Animated.spring(bubbleAnim, {
      toValue: 1,
      speed: 30,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  };

  const endDrag = () => {
    lastIndex.current = -1;
    Animated.timing(bubbleAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(
      () => setDragIndex(null),
    );
  };

  return (
    <View className="absolute right-0 top-0 bottom-32 justify-center" pointerEvents="box-none">
      <View pointerEvents="box-none">
        {/* Drag bubble — floats left of the strip, centered on the finger */}
        {dragIndex != null ? (
          <Animated.View
            pointerEvents="none"
            className="absolute right-9 w-12 h-12 rounded-full bg-primary items-center justify-center"
            style={{
              top: dragY - 24,
              opacity: bubbleAnim,
              transform: [
                { scale: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
              elevation: 4,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Text className="text-white text-xl font-bold">{letters[dragIndex]}</Text>
          </Animated.View>
        ) : null}

        <View
          className="px-1"
          hitSlop={{ left: 8, right: 4 }}
          onLayout={e => {
            const h = Math.max(1, e.nativeEvent.layout.height);
            stripH.current = h;
            setLetterH(h / letters.length);
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={e => startDrag(e.nativeEvent.locationY)}
          onResponderMove={e => handle(e.nativeEvent.locationY)}
          onResponderRelease={endDrag}
          onResponderTerminate={endDrag}
        >
          {/* The active letter's circle is its OWN background, sized exactly
              to the letter slot, with a line height equal to that slot — so
              the letter is always dead-centre. (A separate sliding dot,
              placed by measured-height maths and a springy animation, landed
              slightly off the glyph.) */}
          {letters.map(l => {
            const on = l === highlighted;
            return (
              <View key={l} className={`w-4 h-4 items-center justify-center rounded-full ${on ? 'bg-primary' : ''}`}>
                <Text
                  className={`text-[9px] font-bold text-center ${on ? 'text-white' : 'text-faint'}`}
                  style={{ lineHeight: DOT_SIZE, height: DOT_SIZE, includeFontPadding: false, textAlignVertical: 'center' }}
                >
                  {l}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

interface ClientRowProps {
  client: ClientListItem;
  search: string;
  selectionMode: boolean;
  isChecked: boolean;
  isLast: boolean;
  /** Fixed row height for alphabetical mode (keeps getItemLayout exact). */
  fixedHeight?: number;
  /** Whether long-press may enter selection mode (only when bulk-delete is available). */
  canSelect?: boolean;
  onToggleSelect: (id: string) => void;
  onClientPress: (id: string) => void;
  onExitSelect: () => void;
  /** Right-side stat for the active sort/filter ("Owes $1,240"). */
  stat?: { text: string; tone: 'danger' | 'muted' } | null;
}

const ClientRow = memo(function ClientRow({
  client: c,
  search,
  selectionMode,
  isChecked,
  isLast,
  fixedHeight,
  canSelect,
  onToggleSelect,
  onClientPress,
  onExitSelect,
  stat,
}: ClientRowProps) {
  const tc = useThemeColors();
  const matchedContacts = matchingContacts(c, search);
  return (
    <Pressable
      // Tap opens the client; long-press enters selection mode, and a second
      // long-press anywhere EXITS it (an accidental hold shouldn't force a
      // scroll back to the header toggle). While in selection mode the whole
      // row is the toggle target (no tiny checkbox to aim for).
      onPress={() => (selectionMode ? onToggleSelect(c.id) : onClientPress(c.id))}
      onLongPress={() => (selectionMode ? onExitSelect() : canSelect ? onToggleSelect(c.id) : undefined)}
      delayLongPress={300}
      // Row sits inside the white card; border-x continues the card frame.
      // border-b-gray-200 keeps the divider readable (the original gray-50
      // was nearly invisible against the white card). With a fixedHeight the
      // content is vertically centered and clipped to keep rows uniform;
      // otherwise py-4 sizes the row to its content (search mode).
      style={fixedHeight ? { height: fixedHeight, overflow: 'hidden' } : undefined}
      className={`flex-row items-center px-5 ${fixedHeight ? '' : 'py-4'} bg-card ${
        isLast ? '' : 'border-b border-b-border-soft'
      } ${isChecked ? 'bg-primary/5' : 'active:bg-surface'}`}
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        {selectionMode ? (
          <View
            className={`w-5 h-5 rounded-full border ${
              isChecked ? 'border-primary bg-primary' : 'border-border bg-card'
            } items-center justify-center`}
          >
            {isChecked ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
          </View>
        ) : null}
        <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
          <Text className="text-primary text-sm font-bold">
            {(c.firstName || c.company || '?').charAt(0).toUpperCase()}
            {(c.lastName || '').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
            {(c.firstName || c.lastName) ? (
              <>{c.firstName} {c.lastName}{c.company ? <Text className="text-faint font-normal"> · {c.company}</Text> : null}</>
            ) : (c.company || '—')}
          </Text>
          <View className="flex-row flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {c.phoneDisplay ? (
              <View className="flex-row items-center gap-1">
                <Phone size={11} color={tc.faint} />
                <Text className="text-xs text-faint">{c.phoneDisplay}</Text>
              </View>
            ) : null}
            {c.emailDisplay ? (
              // flex-shrink + numberOfLines: a long email truncates in place
              // instead of wrapping the meta line and making rows uneven.
              <View className="flex-row items-center gap-1 flex-shrink min-w-0">
                <Mail size={11} color={tc.faint} />
                <Text className="text-xs text-faint flex-shrink" numberOfLines={1}>
                  {c.emailDisplay}
                </Text>
              </View>
            ) : null}
            {c.city ? (
              <View className="flex-row items-center gap-1">
                <MapPin size={11} color={tc.faint} />
                <Text className="text-xs text-faint">
                  {c.city}
                  {c.state ? `, ${c.state}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
          {matchedContacts.length > 0 ? (
            <View className="mt-1 gap-0.5">
              {matchedContacts.map((ct, i) => (
                <View key={i} className="flex-row items-center gap-1">
                  <Users size={11} color={tc.primary} />
                  <Text className="text-xs font-medium text-primary" numberOfLines={1}>
                    {ct.name}
                    {ct.role ? `  ·  ${ct.role}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {stat ? (
        <Text className={`ml-2 text-xs font-semibold ${stat.tone === 'danger' ? 'text-red-500' : 'text-muted'}`} numberOfLines={1}>
          {stat.text}
        </Text>
      ) : null}
    </Pressable>
  );
});
