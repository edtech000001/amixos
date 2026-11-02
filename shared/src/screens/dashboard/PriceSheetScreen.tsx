// Price sheet editor (reached from the Facturas header) — mobile. Self-contained
// CRUD over price_sheet_items; the caller mounts it with a supabase client +
// businessId. A price has an optional unit (blank = flat price) and optional
// per-state / per-client overrides. Add/edit uses the correct bottom-sheet pattern
// (absolute backdrop BEHIND a plain-View card) so the sheet scrolls — see
// CLAUDE.md.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCachedThenFresh, writeCacheAndStamp } from '../../lib/swrCache';
import { useDataFingerprint } from '../../lib/dataFingerprint';
import { SkeletonList } from '../../ui/Skeleton';
import { FilteredEmpty } from '../../ui/FilteredEmpty';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal as RNModal, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { Plus, X, Trash2, Pencil, Copy, DollarSign, Search, ChevronDown, Check, ArrowUpDown, GripVertical, History } from 'lucide-react-native';
// Native-only screen (PriceSheetScreen.web.tsx is the web variant), so a
// React-Native-only package is safe to import here.
import Sortable from 'react-native-sortables';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { fetchAllById } from '../../lib/supabaseFetch';
import { usStateName } from '../../lib/usStates';
import { Select } from '../../ui/Select';
import { AutocompleteInput } from '../../ui/AutocompleteInput';
import {
  type PriceSheetItem,
  type PriceSheetRow,
  type PricingMode,
  rowToPriceSheetItem,
  groupPriceItemsByCategory,
  priceItemLabel,
  priceUnitSuggestions,
  priceCategorySuggestions,
} from '../../lib/priceSheet';
import { fetchPriceItemHistory, lastPriceChange, describePriceEntry, type PriceItemHistory } from '../../lib/priceHistory';
import { formatDateLong, formatRelativeLong } from '../../lib/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface PriceSheetScreenProps {
  supabase: SupabaseLike;
  businessId: string;
  canManage: boolean;
  /** Web-only "Generate sheet" action; ignored on mobile for now. */
  onGenerate?: () => void;
  /** Web only — mobile's price screen header is route-owned (facturas/precios). */
  onCopyToOthers?: () => void;
  /** businesses.price_section_order (migration 215) — the user's section order.
   *  Passed in rather than read here so the route's AppContext copy stays the
   *  single source, and the invoice sheet sees the same value. */
  sectionOrder?: string[] | null;
  /** Persist a new section order. Undefined = reordering unavailable. */
  onSectionOrderChange?: (next: string[]) => Promise<void> | void;
  /** This business mirrors another company's price sheet (auto-sync,
   *  migration 259): show a banner and make the sheet read-only — edits here
   *  would be overwritten. `onStop` (admins) disconnects it. */
  syncedFrom?: { name: string; onStop?: () => void } | null;
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

interface DraftState { state: string; rate: string }
interface Draft {
  id: string | null;
  name: string;
  category: string;
  pricingMode: PricingMode;
  unitLabel: string;
  rate: string;
  stateRates: DraftState[];
  clientRates: Array<{ clientId: string; rate: string }>;
  matchTerms: string;
  isAddon: boolean;
  addonInline: boolean;
}


/** Price-history entries shown before "Show all". */
const HISTORY_PREVIEW = 5;

const emptyDraft = (): Draft => ({
  id: null, name: '', category: '', pricingMode: 'per_unit', unitLabel: '', rate: '', stateRates: [], clientRates: [], matchTerms: '', isAddon: false, addonInline: false,
});

export function PriceSheetScreen({ supabase, businessId, canManage: canManageProp, sectionOrder, onSectionOrderChange, syncedFrom }: PriceSheetScreenProps) {
  // A mirrored sheet is read-only: the next sync from the source would undo edits.
  const canManage = canManageProp && !syncedFrom;
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.settings.priceSheet;

  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Item detail (tap a row): full pricing + price history (migration 258).
  // Shares the edit sheet's RNModal — iOS won't present a second one.
  const [viewing, setViewing] = useState<PriceSheetItem | null>(null);
  const [history, setHistory] = useState<PriceItemHistory | null>(null);
  // Price history shows the 5 most recent entries until expanded.
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const viewingIdRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Client roster for the per-client price picker (names only).
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = usePersistedSearch(businessId ? `search.priceSheet.${businessId}` : null);
  // In-sheet state picker (an absolute overlay, NOT a second RNModal — see
  // CLAUDE.md). Holds the stateRates row index being edited.
  const [statePickerFor, setStatePickerFor] = useState<number | null>(null);
  const [stateQuery, setStateQuery] = useState('');

  const loadClients = async () => {
    const rows = await fetchAllById<{ id: string; first_name: string | null; last_name: string | null; company: string | null }>(
      (afterId, pageSize) => {
        let q = supabase.from('clients').select('id, first_name, last_name, company')
          .eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
        if (afterId) q = q.gt('id', afterId);
        return q;
      },
    );
    setClients(rows.map((c) => ({
      id: c.id,
      name: [`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), c.company ?? ''].filter(Boolean).join(' · ') || c.id.slice(0, 8),
    })).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })));
  };

  // silent = refetch without the spinner so a post-save reload keeps scroll.
  // Price lists change rarely, so this screen is cache-first: the saved
  // rows paint immediately and the query only re-runs when the
  // data_fingerprint probe says price_sheet_items actually moved
  // (migration 208) — including edits made by a teammate.
  const cacheKey = businessId ? `price_sheet_${businessId}` : null;
  const fingerprint = useDataFingerprint(supabase, businessId, ['price_sheets']);

  const fetchRows = async (): Promise<PriceSheetRow[]> => {
    const { data } = await supabase
      .from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, client_rates, match_terms, is_addon, addon_inline, sort_order, active')
      .eq('business_id', businessId)
      .order('sort_order')
      .order('name');
    return (data ?? []) as PriceSheetRow[];
  };

  // silent = refetch WITHOUT the spinner, so a post-save reload doesn't swap
  // the list for a loader (which collapses the page height and resets
  // scroll to top). Always re-stamps the cache so the next open is instant.
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    // Stamp captured before the refetch — see writeCacheAndStamp for why the
    // order matters.
    const stamp = fingerprint ? await fingerprint().catch(() => null) : null;
    const rows = await fetchRows();
    setItems(rows.map(rowToPriceSheetItem));
    if (cacheKey) void writeCacheAndStamp(cacheKey, rows, stamp);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void loadCachedThenFresh<PriceSheetRow[]>({
      cacheKey,
      fingerprint,
      fetcher: fetchRows,
      cancelled: () => cancelled,
      apply: (rows) => { setItems(rows.map(rowToPriceSheetItem)); setLoading(false); },
    }).catch(() => setLoading(false));
    void loadClients();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [businessId]);

  // Pick-or-type dropdowns in the add/edit sheet.
  const unitSuggestions = useMemo(() => priceUnitSuggestions(items, locale), [items, locale]);
  const categorySuggestions = useMemo(() => priceCategorySuggestions(items), [items]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      i.matchTerms.some(m => m.includes(q)));
  }, [items, search]);

  // Section order comes from the business (migration 215) through the shared
  // helper, so the price sheet and the invoice "view prices" sheet can never
  // disagree — they used to, one sorting alphabetically and the other using
  // whatever order the query returned.
  const groups = useMemo(
    () => groupPriceItemsByCategory(visibleItems, sectionOrder).map(g => [g.category || '￿', g.items] as const),
    [visibleItems, sectionOrder],
  );

  // Dragging is only coherent against the FULL list — while a search is
  // filtering, the positions on screen are not the positions being written.
  const canReorder = canManage && !search.trim();
  const [sectionSheetOpen, setSectionSheetOpen] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  /**
   * Renumber sort_order across every item so the stored order matches what is
   * on screen. Items are ordered globally, not per section, so a change inside
   * one section still has to be written against the whole flattened list —
   * otherwise two sections end up sharing sort_order values and the order goes
   * unstable.
   *
   * Only rows whose number actually moved are written.
   */
  const persistItemOrder = async (nextGroups: ReadonlyArray<readonly [string, PriceSheetItem[]]>) => {
    const flat = nextGroups.flatMap(([, list]) => list);
    const changed = flat
      .map((it, idx) => ({ id: it.id, sort_order: idx, was: it.sortOrder }))
      .filter(u => u.was !== u.sort_order);
    if (!changed.length) return;
    // Optimistic: the list re-renders from `items`, so update it before the
    // round-trip or the row snaps back under the finger.
    setItems(prev => {
      const rank = new Map(flat.map((it, idx) => [it.id, idx]));
      return [...prev]
        .map(it => (rank.has(it.id) ? { ...it, sortOrder: rank.get(it.id)! } : it))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    });
    setSavingOrder(true);
    // ONE statement for the whole reorder: an upsert of just the moved rows
    // (id + the not-null columns it requires, unchanged). Row-by-row updates
    // were slow, and each one re-ran price auto-sync (migration 259) for every
    // mirrored company. On failure, reload so the screen shows the real order.
    const byId = new Map(flat.map(it => [it.id, it]));
    const { error } = await supabase.from('price_sheet_items').upsert(
      changed.map(u => ({ id: u.id, business_id: businessId, name: byId.get(u.id)!.name, sort_order: u.sort_order })),
      { onConflict: 'id' },
    );
    if (error) await load(true);
    setSavingOrder(false);
  };

  /** Named sections in display order — the ungrouped bucket has no name to
   *  drag, so it is excluded and always sinks last. */
  const sectionNames = useMemo(
    () => groups.map(([k]) => k).filter(k => k !== '￿'),
    [groups],
  );

  /** Reorder one section's items, leaving every other section untouched. */
  const reorderWithin = (key: string, nextList: PriceSheetItem[]) =>
    persistItemOrder(groups.map(([k, list]) => [k, k === key ? nextList : list] as const));

  // Keep the per-state rows alphabetical by state name; blank rows sink last.
  const sortStateRates = (rows: DraftState[]): DraftState[] =>
    [...rows].sort((a, b) => {
      if (!a.state && !b.state) return 0;
      if (!a.state) return 1;
      if (!b.state) return -1;
      return usStateName(a.state, locale).localeCompare(usStateName(b.state, locale));
    });

  const draftFromItem = (i: PriceSheetItem, id: string | null): Draft => ({
    id,
    name: id ? i.name : `${i.name} ${t.copySuffix}`,
    category: i.category ?? '',
    pricingMode: i.pricingMode,
    unitLabel: i.unitLabel ?? '',
    rate: String(i.rate),
    stateRates: sortStateRates(Object.entries(i.stateRates ?? {}).map(([state, rate]) => ({ state, rate: String(rate) }))),
    clientRates: Object.entries(i.clientRates ?? {}).map(([clientId, rate]) => ({ clientId, rate: String(rate) })),
    matchTerms: i.matchTerms.join(', '),
    isAddon: i.isAddon,
    addonInline: i.addonInline,
  });

  const openEdit = (i: PriceSheetItem) => setDraft(draftFromItem(i, i.id));
  const openDetail = (i: PriceSheetItem) => {
    viewingIdRef.current = i.id;
    setViewing(i);
    setHistory(null);
    setHistoryExpanded(false);
    void fetchPriceItemHistory(supabase, i.id)
      .catch(() => ({ createdAt: null, entries: [] }))
      .then(h => { if (viewingIdRef.current === i.id) setHistory(h); });
  };
  const closeSheet = () => { setDraft(null); setViewing(null); viewingIdRef.current = null; };
  const clientName = (id: string) => clients.find(cl => cl.id === id)?.name ?? '—';
  const duplicate = (i: PriceSheetItem) => setDraft(draftFromItem(i, null));

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    const stateRates: Record<string, number> = {};
    draft.stateRates.forEach(sr => {
      const st = sr.state.trim().toUpperCase();
      const r = parseFloat(sr.rate);
      if (st && Number.isFinite(r)) stateRates[st] = r;
    });
    const payload = {
      business_id: businessId,
      name: draft.name.trim(),
      category: draft.category.trim() || null,
      pricing_mode: draft.pricingMode,
      unit_label: draft.pricingMode === 'per_unit' ? (draft.unitLabel.trim() || null) : null,
      rate: parseFloat(draft.rate) || 0,
      state_rates: Object.keys(stateRates).length ? stateRates : null,
      client_rates: (() => {
        const cr: Record<string, number> = {};
        draft.clientRates.forEach(({ clientId, rate }) => {
          const r = parseFloat(rate);
          if (clientId && Number.isFinite(r)) cr[clientId] = r;
        });
        return Object.keys(cr).length ? cr : null;
      })(),
      match_terms: draft.matchTerms.trim() || null,
      is_addon: draft.isAddon,
      // Only a flat add-on can be inline; clear it otherwise.
      addon_inline: draft.isAddon && draft.pricingMode === 'flat' ? draft.addonInline : false,
    };
    if (draft.id) await supabase.from('price_sheet_items').update(payload).eq('id', draft.id);
    else await supabase.from('price_sheet_items').insert({ ...payload, sort_order: items.length });
    setDraft(null);
    setSaving(false);
    await load(true);
  };

  const toggleActive = async (i: PriceSheetItem) => {
    await supabase.from('price_sheet_items').update({ active: !i.active }).eq('id', i.id);
    await load(true);
  };
  const remove = (i: PriceSheetItem) => {
    Alert.alert('', t.deleteConfirm, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      { text: t.deactivate, style: 'destructive', onPress: async () => { await supabase.from('price_sheet_items').delete().eq('id', i.id); await load(true); } },
    ]);
  };

  const setDraftKey = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => (d ? { ...d, [k]: v } : d));

  const addAllStates = () => {
    if (!draft) return;
    const have = new Set(draft.stateRates.map(sr => sr.state.trim().toUpperCase()).filter(Boolean));
    // Add the state names with BLANK rates so you can fill them in and see at a
    // glance which are done. Blank rows aren't saved until you enter a price.
    const additions = US_STATES.filter(s => !have.has(s)).map(s => ({ state: s, rate: '' }));
    setDraftKey('stateRates', sortStateRates([...draft.stateRates, ...additions]));
  };

  const setRowState = (index: number, stateAbbr: string) => {
    setDraft(d => {
      if (!d) return d;
      const next = [...d.stateRates];
      next[index] = { ...next[index], state: stateAbbr };
      return { ...d, stateRates: sortStateRates(next) };
    });
    setStatePickerFor(null);
  };

  const filteredStates = useMemo(() => {
    const q = stateQuery.trim().toLowerCase();
    if (!q) return US_STATES;
    return US_STATES.filter(s => s.toLowerCase().includes(q) || usStateName(s, locale).toLowerCase().includes(q));
  }, [stateQuery, locale]);

  /** One price row. Shared by the static list and the sortable one so the two
   *  can never drift apart visually. */
  const renderPriceRow = (i: PriceSheetItem, idx: number, total: number) => (
    // The whole row opens the item's details (pricing + history); Edit lives
    // there. The action buttons are their own Pressables, so they win the tap.
    <Pressable key={i.id} onPress={() => openDetail(i)} className={`px-4 py-4 flex-row items-center gap-3 bg-card active:bg-surface ${idx < total - 1 ? 'border-b border-border-soft' : ''} ${!i.active ? 'opacity-50' : ''}`}>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-ink flex-shrink" numberOfLines={1}>{i.name}</Text>
          {i.isAddon ? <View className="px-1.5 py-0.5 rounded-full bg-amber-100"><Text className="text-[10px] font-semibold text-amber-700">{t.addonBadge}</Text></View> : null}
        </View>
        <Text className="text-xs text-muted mt-1">
          {i.isAddon ? '+' : ''}{priceItemLabel(i, t.flatWord)}
          {i.stateRates ? ` · ${Object.entries(i.stateRates).map(([st, r]) => `${usStateName(st, locale)} $${r}`).join(' · ')}` : ''}
        </Text>
      </View>
      {canManage ? (
        <View className="flex-row items-center gap-1">
          <Pressable onPress={() => toggleActive(i)} className="px-2 py-1 rounded-lg active:bg-border-soft">
            <Text className="text-xs font-semibold text-muted">{i.active ? t.deactivate : t.activate}</Text>
          </Pressable>
          <Pressable onPress={() => duplicate(i)} className="p-1.5 rounded-lg active:bg-primary/5"><Copy size={14} color={c.faint} /></Pressable>
          <Pressable onPress={() => remove(i)} className="p-1.5 rounded-lg active:bg-red-500/10"><Trash2 size={14} color={c.danger} /></Pressable>
        </View>
      ) : null}
    </Pressable>
  );

  const renderDetail = (v: PriceSheetItem) => {
    const td = t.detail;
    const rel = full.dashboard.clients.detail.commLog.rel;
    const last = history ? lastPriceChange(history) : null;
    const baseline = history?.entries.find(e => e.kind === 'baseline') ?? null;
    const clientRates = Object.entries(v.clientRates ?? {});
    const stateRates = Object.entries(v.stateRates ?? {})
      .sort((a, b) => usStateName(a[0], locale).localeCompare(usStateName(b[0], locale)));
    return (
      <>
        <View className="flex-row items-start justify-between gap-3 mb-1">
          <View className="flex-1 min-w-0">
            {v.category ? <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide">{v.category}</Text> : null}
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-lg font-bold text-ink">{v.name}</Text>
              {v.isAddon ? <View className="px-1.5 py-0.5 rounded-full bg-amber-100"><Text className="text-[10px] font-semibold text-amber-700">{t.addonBadge}</Text></View> : null}
              {!v.active ? <View className="px-1.5 py-0.5 rounded-full bg-border-soft"><Text className="text-[10px] text-faint">{t.inactiveBadge}</Text></View> : null}
            </View>
          </View>
          <Pressable onPress={closeSheet} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft"><X size={20} color={c.faint} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
          <Text className="text-2xl font-bold text-primary mt-2">{v.isAddon ? '+' : ''}{priceItemLabel(v, t.flatWord)}</Text>
          {history ? (
            <Text className="text-xs text-muted mt-1">
              {last && last.kind === 'updated'
                ? td.lastChanged.replace('{{date}}', formatDateLong(last.changedAt, locale)).replace('{{ago}}', formatRelativeLong(last.changedAt, rel))
                : last && last.kind === 'created'
                  ? td.unchangedSinceAdded.replace('{{ago}}', formatRelativeLong(last.changedAt, rel))
                  : baseline
                    ? td.noChangesSinceTracking.replace('{{date}}', formatDateLong(baseline.changedAt, locale))
                    : ''}
            </Text>
          ) : null}
          {history?.createdAt ? (
            <Text className="text-xs text-faint mt-0.5">{td.added.replace('{{date}}', formatDateLong(history.createdAt, locale))}</Text>
          ) : null}

          {stateRates.length ? (
            <View className="mt-4">
              <Text className="text-xs font-semibold text-ink mb-1">{t.stateRatesLabel}</Text>
              {stateRates.map(([st, r]) => (
                <View key={st} className="flex-row justify-between py-1.5 border-b border-border-soft">
                  <Text className="text-sm text-muted">{usStateName(st, locale)}</Text>
                  <Text className="text-sm text-ink font-medium">${r}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {clientRates.length ? (
            <View className="mt-4">
              <Text className="text-xs font-semibold text-ink mb-1">{t.clientRatesLabel}</Text>
              {clientRates.map(([id, r]) => (
                <View key={id} className="flex-row justify-between gap-3 py-1.5 border-b border-border-soft">
                  <Text className="text-sm text-muted flex-1" numberOfLines={1}>{clientName(id)}</Text>
                  <Text className="text-sm text-ink font-medium">${r}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {v.matchTerms.length ? (
            <View className="mt-4">
              <Text className="text-xs font-semibold text-ink mb-1">{t.matchTermsLabel}</Text>
              <Text className="text-sm text-muted">{v.matchTerms.join(', ')}</Text>
            </View>
          ) : null}

          <View className="mt-5">
            <View className="flex-row items-center gap-1.5 mb-2">
              <History size={13} color={c.ink} />
              <Text className="text-xs font-semibold text-ink">{td.historyTitle}</Text>
            </View>
            {!history ? (
              <Text className="text-xs text-faint">{td.historyLoading}</Text>
            ) : (historyExpanded ? history.entries : history.entries.slice(0, HISTORY_PREVIEW)).map((e, k, shown) => {
              const lines = describePriceEntry(e, { labels: { flatWord: t.flatWord, none: td.none }, locale, clientName });
              const isLast = k === shown.length - 1;
              return (
                <View key={e.id} className={`pl-4 border-l border-border-soft ${isLast ? '' : 'pb-3'}`}>
                  <View style={{ position: 'absolute', left: -4, top: 5, width: 8, height: 8, borderRadius: 4, backgroundColor: e.kind === 'updated' ? c.primary : c.border }} />
                  <Text className="text-[11px] text-faint">
                    {formatDateLong(e.changedAt, locale)} · {e.kind === 'updated' ? td.historyChanged : e.kind === 'created' ? td.historyAdded : td.historyBaseline}
                    {e.changedByName ? ` · ${td.by.replace('{{name}}', e.changedByName)}` : ''}
                  </Text>
                  {lines.map((l, j) => <Text key={j} className="text-sm text-ink">{l}</Text>)}
                </View>
              );
            })}
            {history && history.entries.length > HISTORY_PREVIEW ? (
              <Pressable onPress={() => setHistoryExpanded(x => !x)} hitSlop={8} className="self-start mt-2">
                <Text className="text-xs font-semibold text-primary">
                  {historyExpanded ? td.showLess : td.showAll.replace('{{count}}', String(history.entries.length))}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {canManage ? (
            // Swaps this sheet's content to the edit form — same RNModal.
            <Pressable onPress={() => { setViewing(null); viewingIdRef.current = null; openEdit(v); }}
              className="mt-5 flex-row items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-primary active:opacity-90">
              <Pencil size={15} color="#fff" />
              <Text className="text-sm font-semibold text-white">{td.editBtn}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </>
    );
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-start justify-between gap-3 mb-4">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{t.title}</Text>
          <Text className="text-xs text-faint mt-0.5">{t.subtitle}</Text>
        </View>
        {canReorder && onSectionOrderChange && groups.length > 1 ? (
          <Pressable
            onPress={() => setSectionSheetOpen(true)}
            accessibilityLabel={t.reorderSections}
            className="p-2 rounded-xl border border-border bg-card active:opacity-80"
          >
            <ArrowUpDown size={15} color={c.muted} />
          </Pressable>
        ) : null}
        {canManage ? (
          <Pressable onPress={() => setDraft(emptyDraft())} className="flex-row items-center gap-1.5 bg-primary px-3.5 py-2 rounded-xl active:opacity-90">
            <Plus size={15} color="#fff" />
            <Text className="text-sm font-semibold text-white">{t.addBtn}</Text>
          </Pressable>
        ) : null}
      </View>

      {syncedFrom ? (
        <View className="flex-row items-start gap-3 p-3.5 mb-4 rounded-2xl bg-primary/10 border border-primary/30">
          <View className="flex-1">
            <Text className="text-sm text-ink">{t.sync.syncedBanner.replace('{{company}}', syncedFrom.name)}</Text>
            {syncedFrom.onStop ? (
              <Pressable onPress={syncedFrom.onStop} hitSlop={8} className="self-start mt-2">
                <Text className="text-xs font-semibold text-primary">{t.sync.stopSync}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Search */}
      <View className="flex-row items-center rounded-2xl border border-border bg-card px-3 mb-4">
        <Search size={16} color={c.faint} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.searchPlaceholder} placeholderTextColor={c.faint}
          autoCapitalize="none" autoCorrect={false} className="flex-1 py-2.5 pl-2 text-ink" style={{ fontSize: 14 }} />
        {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><X size={16} color={c.faint} /></Pressable> : null}
      </View>


      {canReorder && groups.length > 0 ? (
        <Text className="text-[11px] text-faint mb-3 px-1">
          {savingOrder ? t.savingOrder : t.reorderHint}
        </Text>
      ) : null}

      {loading ? (
        <SkeletonList rows={6} />
      ) : items.length === 0 ? (
        <View className="items-center py-16">
          <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mb-3"><DollarSign size={20} color={c.primary} /></View>
          <Text className="text-sm text-faint text-center px-8">{t.empty}</Text>
        </View>
      ) : groups.length === 0 ? (
        // Items exist, so only the search can have emptied the list.
        <FilteredEmpty onClear={() => setSearch('')} title={t.noResults} compact />
      ) : (
        <View className="gap-5">
          {groups.map(([key, list]) => (
            <View key={key}>
              <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">
                {key === '￿' ? t.uncategorized : key}
                <Text className="font-bold text-primary">{`  ${list.length}`}</Text>
              </Text>
              <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
                {/* Long-press to drag. Only when the full list is showing: while
                    a search filters the rows, on-screen positions are not the
                    positions being written. */}
                {canReorder ? (
                  <Sortable.Grid
                    data={list}
                    columns={1}
                    rowGap={0}
                    keyExtractor={(it: PriceSheetItem) => it.id}
                    dragActivationDelay={220}
                    onDragEnd={({ data }: { data: PriceSheetItem[] }) => { void reorderWithin(key, data); }}
                    renderItem={({ item: i, index: idx }: { item: PriceSheetItem; index: number }) =>
                      renderPriceRow(i, idx, list.length)}
                  />
                ) : list.map((i, idx) => renderPriceRow(i, idx, list.length))}
              </View>
            </View>
          ))}
        </View>
      )}
      {/* Section order. A separate sheet rather than dragging headers inline:
          nesting one sortable list inside another is unreliable, and a flat
          list of names is easier to reason about than dragging a whole block
          of prices. */}
      <RNModal visible={sectionSheetOpen} transparent animationType="fade" onRequestClose={() => setSectionSheetOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setSectionSheetOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
          />
          <View className="bg-card rounded-t-3xl px-5 pt-4 pb-10 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-lg font-bold text-ink">{t.reorderSections}</Text>
              <Pressable onPress={() => setSectionSheetOpen(false)} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft">
                <X size={20} color={c.faint} />
              </Pressable>
            </View>
            <Text className="text-xs text-faint mb-3">{t.sectionOrderHint}</Text>
            <Sortable.Grid
              data={sectionNames}
              columns={1}
              rowGap={8}
              keyExtractor={(name: string) => name}
              dragActivationDelay={180}
              onDragEnd={({ data }: { data: string[] }) => { void onSectionOrderChange?.(data); }}
              renderItem={({ item: name }: { item: string }) => (
                <View className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card">
                  <GripVertical size={16} color={c.faint} />
                  <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>{name}</Text>
                </View>
              )}
            />
          </View>
        </View>
      </RNModal>

      {/* Add/edit sheet — absolute backdrop BEHIND a plain-View card (scrolls). */}
      <RNModal visible={!!draft || !!viewing} transparent animationType="fade" onRequestClose={closeSheet}>
        {/* KeyboardAvoidingView: this sheet is anchored to the bottom, exactly
            where the keyboard opens, so the lower fields (price, terms) were
            underneath it. Padding behaviour shrinks the container, and the
            card's max-h is relative to that — so the whole card lands above
            the keyboard and scrolls internally rather than being clipped. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end"
        >
          <Pressable onPress={closeSheet} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[90%]">
            {draft ? (
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-ink">{t.title}</Text>
                <Pressable onPress={closeSheet} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft"><X size={20} color={c.faint} /></Pressable>
              </View>
            ) : null}
            {!draft && viewing ? renderDetail(viewing) : null}
            {draft ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
                {/* Tap on blank space = unfocus the field, which closes an open
                    unit/category dropdown. The ScrollView only does this itself
                    while the soft keyboard is up (not with a hardware keyboard,
                    or once it's been hidden). Controls inside still handle their
                    own taps — the deepest Pressable wins — and scrolling is
                    unaffected, since the Pressable sits INSIDE the ScrollView. */}
                <Pressable onPress={Keyboard.dismiss} accessible={false} className="flex-1">
                <Text className="text-sm font-semibold text-ink mb-1">{t.nameLabel}</Text>
                <TextInput value={draft.name} onChangeText={v => setDraftKey('name', v)} placeholder={t.namePlaceholder} placeholderTextColor={c.faint}
                  className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5 text-ink" style={{ fontSize: 16 }} />

                <View className="mb-3">
                  <AutocompleteInput browse label={t.categoryLabel} value={draft.category}
                    onChangeText={v => setDraftKey('category', v)} placeholder={t.categoryPlaceholder}
                    suggestions={categorySuggestions} autoCapitalize="words" />
                </View>

                <Text className="text-sm font-semibold text-ink mb-1">{t.modeLabel}</Text>
                <View className="flex-row gap-2 mb-3">
                  {(['per_unit', 'flat'] as PricingMode[]).map(m => (
                    <Pressable key={m} onPress={() => setDraftKey('pricingMode', m)}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${draft.pricingMode === m ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}>
                      <Text className={`text-xs font-semibold ${draft.pricingMode === m ? 'text-primary' : 'text-muted'}`}>{m === 'per_unit' ? t.modePerUnit : t.modeFlat}</Text>
                    </Pressable>
                  ))}
                </View>

                {draft.pricingMode === 'per_unit' ? (
                  <>
                    <View className="mb-3">
                      <AutocompleteInput browse label={t.unitLabel} value={draft.unitLabel}
                        onChangeText={v => setDraftKey('unitLabel', v)} placeholder={t.unitPlaceholder}
                        suggestions={unitSuggestions} hint={t.unitHint} autoCapitalize="none" autoCorrect={false} />
                    </View>
                  </>
                ) : null}

                <Pressable onPress={() => setDraftKey('isAddon', !draft.isAddon)} className="flex-row items-start gap-2.5 mb-4">
                  <View className={`mt-0.5 w-5 h-5 rounded border items-center justify-center ${draft.isAddon ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                    {draft.isAddon ? <Check size={14} color="#fff" /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink">{t.addonLabel}</Text>
                    <Text className="text-[11px] text-faint">{t.addonHint}</Text>
                  </View>
                </Pressable>

                {/* Flat add-ons only: own line (default) vs folded into the job's line. */}
                {draft.isAddon && draft.pricingMode === 'flat' ? (
                  <Pressable onPress={() => setDraftKey('addonInline', !draft.addonInline)} className="flex-row items-start gap-2.5 mb-4 ml-7 rounded-xl border border-border bg-surface p-3">
                    <View className={`mt-0.5 w-5 h-5 rounded border items-center justify-center ${draft.addonInline ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                      {draft.addonInline ? <Check size={14} color="#fff" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink">{t.addonInlineLabel}</Text>
                      <Text className="text-[11px] text-faint">{t.addonInlineHint}</Text>
                    </View>
                  </Pressable>
                ) : null}

                <Text className="text-sm font-semibold text-ink mb-1">{t.rateLabel}</Text>
                <View className="flex-row items-center rounded-xl border border-border bg-card px-3 mb-4">
                  <Text className="text-faint">$</Text>
                  <TextInput value={draft.rate} onChangeText={v => setDraftKey('rate', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.faint}
                    className="flex-1 py-2.5 pl-1 text-ink" style={{ fontSize: 16 }} />
                </View>

                {/* Per-CLIENT price overrides — the picked client always pays
                    this rate for the item (beats state pricing). */}
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-ink">{t.clientRatesLabel}</Text>
                  <Text className="text-[11px] text-faint mt-0.5 mb-2">{t.clientRatesHint}</Text>
                  {draft.clientRates.map((cr, idx) => (
                    <View key={idx} className="flex-row items-center gap-2 mb-2">
                      <View className="flex-1">
                        <Select
                          value={cr.clientId}
                          onValueChange={(v) => setDraftKey('clientRates', draft.clientRates.map((x, j) => (j === idx ? { ...x, clientId: v } : x)))}
                          placeholder={t.clientPickPlaceholder}
                          options={clients
                            .filter((cl) => cl.id === cr.clientId || !draft.clientRates.some((x) => x.clientId === cl.id))
                            .map((cl) => ({ value: cl.id, label: cl.name }))}
                          searchable
                        />
                      </View>
                      <View className="w-28 flex-row items-center rounded-xl border border-border bg-card px-3">
                        <Text className="text-faint">$</Text>
                        <TextInput value={cr.rate}
                          onChangeText={(v) => setDraftKey('clientRates', draft.clientRates.map((x, j) => (j === idx ? { ...x, rate: v.replace(/[^0-9.]/g, '') } : x)))}
                          keyboardType="decimal-pad" placeholder={String(draft.rate || '0.00')} placeholderTextColor={c.faint} className="flex-1 py-2.5 pl-1 text-ink" style={{ fontSize: 16 }} />
                      </View>
                      <Pressable onPress={() => setDraftKey('clientRates', draft.clientRates.filter((_, j) => j !== idx))} className="p-1.5">
                        <X size={16} color={c.faint} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable onPress={() => setDraftKey('clientRates', [...draft.clientRates, { clientId: '', rate: '' }])} className="py-1 self-start">
                    <Text className="text-xs font-semibold text-primary">{t.addClientRate}</Text>
                  </Pressable>
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-ink mb-1">{t.matchTermsLabel}</Text>
                  <Text className="text-[11px] text-faint mb-1.5">{t.matchTermsHint}</Text>
                  <TextInput value={draft.matchTerms} onChangeText={v => setDraftKey('matchTerms', v)} placeholder={t.matchTermsPlaceholder} placeholderTextColor={c.faint}
                    multiline numberOfLines={2} className="rounded-xl border border-border bg-card px-3 py-2.5 text-ink" style={[{ fontSize: 16 }, { minHeight: 56, textAlignVertical: 'top' }]} />
                </View>

                <View className="mb-4">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-sm font-semibold text-ink">{t.stateRatesLabel}</Text>
                    <View className="flex-row items-center gap-4">
                      <Pressable onPress={addAllStates}><Text className="text-xs font-semibold text-primary">{t.addAllStates}</Text></Pressable>
                      <Pressable onPress={() => setDraftKey('stateRates', [...draft.stateRates, { state: '', rate: '' }])}>
                        <Text className="text-xs font-semibold text-primary">+ {t.addStateRate}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text className="text-[11px] text-faint mb-2">{t.stateRatesHint}</Text>
                  {draft.stateRates.map((sr, i) => (
                    <View key={i} className="flex-row items-center gap-2 mb-2">
                      <Pressable onPress={() => { setStateQuery(''); setStatePickerFor(i); }}
                        className="w-40 flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <Text className={`text-base flex-1 ${sr.state ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
                          {sr.state ? usStateName(sr.state, locale) : t.selectStatePlaceholder}
                        </Text>
                        <ChevronDown size={16} color={c.faint} />
                      </Pressable>
                      <View className="flex-1 flex-row items-center rounded-xl border border-border bg-card px-3">
                        <Text className="text-faint">$</Text>
                        <TextInput value={sr.rate} onChangeText={v => { const next = [...draft.stateRates]; next[i] = { ...sr, rate: v.replace(/[^0-9.]/g, '') }; setDraftKey('stateRates', next); }}
                          keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.faint} className="flex-1 py-2.5 pl-1 text-ink" style={{ fontSize: 16 }} />
                      </View>
                      <Pressable onPress={() => setDraftKey('stateRates', draft.stateRates.filter((_, j) => j !== i))} className="p-1.5"><X size={16} color={c.faint} /></Pressable>
                    </View>
                  ))}
                </View>

                <Pressable onPress={save} disabled={saving || !draft.name.trim()}
                  className={`py-3.5 rounded-2xl items-center ${saving || !draft.name.trim() ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}>
                  <Text className="text-sm font-semibold text-white">{t.saveBtn}</Text>
                </Pressable>
                </Pressable>
              </ScrollView>
            ) : null}

            {/* State picker — absolute overlay inside the sheet card (NOT a
                second RNModal, which iOS would refuse to present). */}
            {statePickerFor !== null ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} className="bg-card rounded-t-3xl px-5 pt-5">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-lg font-bold text-ink">{t.selectStatePlaceholder}</Text>
                  <Pressable onPress={() => setStatePickerFor(null)} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft"><X size={20} color={c.faint} /></Pressable>
                </View>
                <View className="flex-row items-center rounded-2xl border border-border bg-card px-3 mb-3">
                  <Search size={16} color={c.faint} />
                  <TextInput value={stateQuery} onChangeText={setStateQuery} placeholder={t.searchPlaceholder} placeholderTextColor={c.faint}
                    autoFocus autoCorrect={false} autoCapitalize="none" className="flex-1 py-2.5 pl-2 text-ink" style={{ fontSize: 16 }} />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" className="mb-4">
                  {filteredStates.map(s => {
                    const isSel = draft.stateRates[statePickerFor!]?.state === s;
                    return (
                      <Pressable key={s} onPress={() => setRowState(statePickerFor!, s)}
                        className={`flex-row items-center justify-between px-2 py-3.5 rounded-xl active:bg-surface ${isSel ? 'bg-primary/5' : ''}`}>
                        <Text className={`text-base flex-1 ${isSel ? 'text-primary font-semibold' : 'text-ink'}`}>{usStateName(s, locale)}</Text>
                        {isSel ? <Check size={16} color={c.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </View>
  );
}
