'use client';

// Price sheet editor (reached from the Facturas header → "Lista de precios").
// Self-contained CRUD over price_sheet_items — the caller just mounts it with a
// supabase client + businessId. Items group by category; each has a price, an
// optional unit (blank = flat price), and optional per-state / per-client
// overrides that autoprice reads via applicableRate().

import { useEffect, useMemo, useState } from 'react';
import { loadCachedThenFresh, writeCacheAndStamp } from '../../lib/swrCache';
import { useDataFingerprint } from '../../lib/dataFingerprint';
import { SkeletonList } from '../../ui/Skeleton';
import { Plus, X, Trash2, Pencil, Copy, DollarSign, FileText, Search, ArrowUpDown, GripVertical } from 'lucide-react';
import { SortableList } from '../../ui/SortableList';
import { useLang } from '../../i18n';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { fetchAllById } from '../../lib/supabaseFetch';
import { confirm } from '../../ui/confirmBus';
import { usStateName } from '../../lib/usStates';
import {
  type PriceSheetItem,
  type PriceSheetRow,
  type PricingMode,
  rowToPriceSheetItem,
  priceItemLabel,
  groupPriceItemsByCategory,
} from '../../lib/priceSheet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface PriceSheetScreenProps {
  supabase: SupabaseLike;
  businessId: string;
  canManage: boolean;
  /** When provided, shows a "Generate sheet" header button (client-facing
   *  price-sheet PDF). Web-only for now. */
  onGenerate?: () => void;
  /** businesses.price_section_order (migration 215) — the user's section order. */
  sectionOrder?: string[] | null;
  /** Persist a new section order. Undefined = reordering unavailable. */
  onSectionOrderChange?: (next: string[]) => Promise<void> | void;
}

// 50 states + DC, USPS order — full names come from usStateName(abbr).
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


const emptyDraft = (): Draft => ({
  id: null, name: '', category: '', pricingMode: 'per_unit', unitLabel: '', rate: '', stateRates: [], clientRates: [], matchTerms: '', isAddon: false, addonInline: false,
});

export function PriceSheetScreen({ supabase, businessId, canManage, onGenerate, sectionOrder, onSectionOrderChange }: PriceSheetScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.priceSheet;

  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Client roster for the per-client price picker (names only).
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = usePersistedSearch(businessId ? `search.priceSheet.${businessId}` : null);

  const loadClients = async () => {
    const rows = await fetchAllById<{ id: string; first_name: string | null; last_name: string | null; company: string | null }>(
      (afterId, pageSize) => {
        let q = supabase.from('clients').select('id, first_name, last_name, company')
          .eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
        if (afterId) q = q.gt('id', afterId);
        return q;
      },
    );
    setClients(rows.map(c => ({
      id: c.id,
      name: [`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), c.company ?? ''].filter(Boolean).join(' · ') || c.id.slice(0, 8),
    })).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })));
  };

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

  // Search filter across name, category, and match terms.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      i.matchTerms.some(m => m.includes(q)));
  }, [items, search]);

  // Section order comes from the business (migration 215) through the shared
  // helper, so this and the invoice "view prices" sheet can never disagree —
  // they used to, one sorting alphabetically and the other using whatever order
  // the query returned. Uncategorized always sinks last.
  const groups = useMemo(
    () => groupPriceItemsByCategory(visibleItems, sectionOrder).map(g => [g.category || '￿', g.items] as const),
    [visibleItems, sectionOrder],
  );

  // Dragging is only coherent against the FULL list — while a search filters
  // the rows, on-screen positions are not the positions being written.
  const canReorder = canManage && !search.trim();
  const [sectionSheetOpen, setSectionSheetOpen] = useState(false);

  /**
   * Renumber sort_order across every item so the stored order matches the
   * screen. Items are ordered globally, not per section, so a change inside one
   * section still has to be written against the whole flattened list —
   * otherwise sections end up sharing sort_order values and the order goes
   * unstable. Only rows whose number moved are written.
   */
  const persistItemOrder = async (nextGroups: ReadonlyArray<readonly [string, PriceSheetItem[]]>) => {
    const flat = nextGroups.flatMap(([, list]) => list);
    const changed = flat
      .map((it, idx) => ({ id: it.id, sort_order: idx, was: it.sortOrder }))
      .filter(u => u.was !== u.sort_order);
    if (!changed.length) return;
    // Optimistic: the list renders from `items`, so update before the
    // round-trip or the row snaps back after the drop.
    setItems(prev => {
      const rank = new Map(flat.map((it, idx) => [it.id, idx]));
      return [...prev]
        .map(it => (rank.has(it.id) ? { ...it, sortOrder: rank.get(it.id)! } : it))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    });
    for (const u of changed) {
      await supabase.from('price_sheet_items').update({ sort_order: u.sort_order }).eq('id', u.id);
    }
  };

  const reorderWithin = (key: string, nextList: PriceSheetItem[]) =>
    persistItemOrder(groups.map(([k, list]) => [k, k === key ? nextList : list] as const));

  /** Named sections in display order — the ungrouped bucket has no name to
   *  drag, so it is excluded and always sinks last. */
  const sectionNames = useMemo(() => groups.map(([k]) => k).filter(k => k !== '￿'), [groups]);

  // Keep the per-state rows alphabetical by state name; blank (unchosen) rows
  // sink to the bottom so a freshly-added row stays put until you pick a state.
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

  const openNew = () => setDraft(emptyDraft());
  const openEdit = (i: PriceSheetItem) => setDraft(draftFromItem(i, i.id));
  // Duplicate → open a NEW draft (id null) prefilled from the item, name "(copy)".
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
      // Only a flat add-on can be inline; clear it otherwise so a per-unit or
      // non-add-on item never carries a stale inline flag.
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
  const remove = async (i: PriceSheetItem) => {
    if (!(await confirm({ message: t.deleteConfirm, destructive: true }))) return;
    await supabase.from('price_sheet_items').delete().eq('id', i.id);
    await load(true);
  };

  // "Add all states" — append a row for every state not already present, each
  // pre-filled with the base rate so they're editable/meaningful right away.
  const addAllStates = () => {
    if (!draft) return;
    const have = new Set(draft.stateRates.map(sr => sr.state.trim().toUpperCase()).filter(Boolean));
    // Add the state names with BLANK rates so you can fill them in and see at a
    // glance which are done. Blank rows aren't saved until you enter a price.
    const additions = US_STATES.filter(s => !have.has(s)).map(s => ({ state: s, rate: '' }));
    setDraft({ ...draft, stateRates: sortStateRates([...draft.stateRates, ...additions]) });
  };

  /** One price row. Shared by the static list and the sortable one so the two
   *  cannot drift apart visually. `handle` carries dnd-kit's drag props when
   *  reordering is on. */
  const renderPriceRow = (
    i: PriceSheetItem,
    idx: number,
    total: number,
    handle?: { attributes?: Record<string, unknown>; listeners?: Record<string, unknown> },
  ) => (
    <div key={i.id} className={`px-4 py-4 flex items-center gap-3 bg-card ${idx < total - 1 ? 'border-b border-border-soft' : ''} ${!i.active ? 'opacity-50' : ''}`}>
      {handle ? (
        <span
          {...(handle.attributes ?? {})}
          {...(handle.listeners ?? {})}
          className="shrink-0 cursor-grab active:cursor-grabbing text-faint hover:text-muted"
          aria-label={t.reorderSections}
        >
          <GripVertical size={15} />
        </span>
      ) : null}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ink truncate">{i.name}</p>
          {i.isAddon ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{t.addonBadge}</span> : null}
          {!i.active ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-border-soft text-faint">{t.inactiveBadge}</span> : null}
        </div>
        <p className="text-xs text-muted mt-1">
          {i.isAddon ? '+' : ''}{priceItemLabel(i, t.flatWord)}
          {i.stateRates ? ` · ${Object.entries(i.stateRates).map(([st, r]) => `${usStateName(st, locale)} $${r}`).join(' · ')}` : ''}
        </p>
      </div>
      {canManage ? (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => toggleActive(i)} className="px-2 py-1 rounded-lg text-xs font-semibold text-muted hover:bg-border-soft">
            {i.active ? t.deactivate : t.activate}
          </button>
          <button type="button" onClick={() => openEdit(i)} className="p-1.5 rounded-lg text-faint hover:text-primary hover:bg-primary/5"><Pencil size={14} /></button>
          <button type="button" onClick={() => duplicate(i)} title={t.duplicate} className="p-1.5 rounded-lg text-faint hover:text-primary hover:bg-primary/5"><Copy size={14} /></button>
          <button type="button" onClick={() => remove(i)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-500/10"><Trash2 size={14} /></button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canReorder && onSectionOrderChange && sectionNames.length > 1 ? (
            <button
              type="button"
              onClick={() => setSectionSheetOpen(true)}
              title={t.reorderSections}
              className="flex items-center gap-1.5 bg-card border border-border px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:bg-surface"
            >
              <ArrowUpDown size={15} />
            </button>
          ) : null}
          {onGenerate ? (
            <button type="button" onClick={onGenerate}
              className="flex items-center gap-1.5 bg-card border border-border px-4 py-2.5 rounded-xl text-sm font-semibold text-ink hover:bg-surface">
              <FileText size={16} /> {t.generateBtn}
            </button>
          ) : null}
          {canManage ? (
            <button type="button" onClick={openNew}
              className="flex items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90">
              <Plus size={16} /> {t.addBtn}
            </button>
          ) : null}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPlaceholder}
          autoCapitalize="none" autoCorrect="off"
          className="w-full rounded-2xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        {search ? (
          <button type="button" onClick={() => setSearch('')} aria-label="×"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"><X size={16} /></button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList rows={6} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3"><DollarSign size={20} className="text-primary" /></div>
          <p className="text-sm text-faint max-w-xs">{t.empty}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-sm text-faint">{t.noResults}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, list]) => (
            <div key={key}>
              <p className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">
                {key === '￿' ? t.uncategorized : key}
              </p>
              <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
                {canReorder ? (
                  <SortableList
                    items={list}
                    onReorder={next => { void reorderWithin(key, next); }}
                    renderItem={(i, idx, handle) => renderPriceRow(i, idx, list.length, handle)}
                  />
                ) : list.map((i, idx) => renderPriceRow(i, idx, list.length))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section order. A separate modal rather than dragging headers inline:
          nesting one sortable list inside another is unreliable, and a flat
          list of names is easier to reason about than dragging a whole block
          of prices. */}
      {sectionSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSectionSheetOpen(false)} />
          <div className="relative bg-card rounded-2xl w-full max-w-sm p-5 max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-base font-bold text-ink">{t.reorderSections}</h2>
              <button type="button" onClick={() => setSectionSheetOpen(false)} className="p-1 -mr-1 text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-faint mb-3">{t.sectionOrderHint}</p>
            <SortableList
              items={sectionNames.map(name => ({ id: name }))}
              onReorder={next => { void onSectionOrderChange?.(next.map(x => x.id)); }}
              renderItem={(row, _idx, handle) => (
                <div key={row.id} className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl border border-border bg-card">
                  <span
                    {...(handle.attributes ?? {})}
                    {...(handle.listeners ?? {})}
                    className="cursor-grab active:cursor-grabbing text-faint hover:text-muted"
                  >
                    <GripVertical size={15} />
                  </span>
                  <span className="text-sm font-medium text-ink truncate">{row.id}</span>
                </div>
              )}
            />
          </div>
        </div>
      ) : null}

      {/* Add/edit modal. Backdrop click deliberately does NOT close — a
          mis-click mustn't discard an in-progress price edit. Close via the
          X (or Cancel). */}
      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-lg font-bold text-ink">{t.title}</p>
              <button type="button" onClick={() => setDraft(null)} className="p-1.5 rounded-lg hover:bg-border-soft"><X size={18} className="text-faint" /></button>
            </div>

            <label className="block text-sm font-semibold text-ink mb-1">{t.nameLabel}</label>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t.namePlaceholder}
              className="w-full mb-3 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />

            <label className="block text-sm font-semibold text-ink mb-1">{t.categoryLabel}</label>
            <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder={t.categoryPlaceholder}
              list="price-categories"
              className="w-full mb-3 rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <datalist id="price-categories">{Array.from(new Set(items.map(i => i.category).filter(Boolean))).map(c => <option key={c} value={c!} />)}</datalist>

            <label className="block text-sm font-semibold text-ink mb-1">{t.modeLabel}</label>
            <div className="flex gap-2 mb-3">
              {(['per_unit', 'flat'] as PricingMode[]).map(m => (
                <button key={m} type="button" onClick={() => setDraft({ ...draft, pricingMode: m })}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${draft.pricingMode === m ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'}`}>
                  {m === 'per_unit' ? t.modePerUnit : t.modeFlat}
                </button>
              ))}
            </div>

            {draft.pricingMode === 'per_unit' ? (
              <>
                <label className="block text-sm font-semibold text-ink mb-1">{t.unitLabel}</label>
                <input value={draft.unitLabel} onChange={e => setDraft({ ...draft, unitLabel: e.target.value })} placeholder={t.unitPlaceholder}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-[11px] text-faint mt-1 mb-3">{t.unitHint}</p>
              </>
            ) : null}

            <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
              <input type="checkbox" checked={draft.isAddon} onChange={e => setDraft({ ...draft, isAddon: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              <span>
                <span className="block text-sm font-semibold text-ink">{t.addonLabel}</span>
                <span className="block text-[11px] text-faint">{t.addonHint}</span>
              </span>
            </label>

            {/* Flat add-ons only: own line (default) vs folded into the job's line. */}
            {draft.isAddon && draft.pricingMode === 'flat' ? (
              <label className="flex items-start gap-2.5 mb-4 ml-6 -mt-2 cursor-pointer rounded-xl border border-border bg-surface/50 p-3">
                <input type="checkbox" checked={draft.addonInline} onChange={e => setDraft({ ...draft, addonInline: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{t.addonInlineLabel}</span>
                  <span className="block text-[11px] text-faint">{t.addonInlineHint}</span>
                </span>
              </label>
            ) : null}

            <label className="block text-sm font-semibold text-ink mb-1">{t.rateLabel}</label>
            <div className="mb-4 flex items-center rounded-xl border border-border px-3 focus-within:ring-2 focus-within:ring-primary">
              <span className="text-faint text-sm">$</span>
              <input value={draft.rate} onChange={e => setDraft({ ...draft, rate: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="0.00"
                className="w-full py-2 pl-1 text-sm focus:outline-none" />
            </div>

            {/* Per-CLIENT price overrides — the picked client always pays this
                rate for the item (beats state pricing). */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-ink">{t.clientRatesLabel}</label>
              <p className="text-[11px] text-faint mt-0.5 mb-2">{t.clientRatesHint}</p>
              {draft.clientRates.map((cr, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <select value={cr.clientId}
                    onChange={e => setDraft({ ...draft, clientRates: draft.clientRates.map((x, j) => j === idx ? { ...x, clientId: e.target.value } : x) })}
                    className="flex-1 min-w-0 rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">{t.clientPickPlaceholder}</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}
                        disabled={c.id !== cr.clientId && draft.clientRates.some(x => x.clientId === c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="w-32 flex items-center rounded-xl border border-border px-3 focus-within:ring-2 focus-within:ring-primary">
                    <span className="text-faint text-sm">$</span>
                    <input value={cr.rate}
                      onChange={e => setDraft({ ...draft, clientRates: draft.clientRates.map((x, j) => j === idx ? { ...x, rate: e.target.value.replace(/[^0-9.]/g, '') } : x) })}
                      inputMode="decimal" placeholder={String(draft.rate || '0.00')} className="w-full py-2 pl-1 text-sm focus:outline-none" />
                  </div>
                  <button type="button"
                    onClick={() => setDraft({ ...draft, clientRates: draft.clientRates.filter((_, j) => j !== idx) })}
                    className="p-1.5 rounded-lg text-faint hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
              <button type="button"
                onClick={() => setDraft({ ...draft, clientRates: [...draft.clientRates, { clientId: '', rate: '' }] })}
                className="text-xs font-semibold text-primary hover:bg-primary/5 px-2 py-1 rounded-lg">
                {t.addClientRate}
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-ink mb-1">{t.matchTermsLabel}</label>
              <p className="text-[11px] text-faint mb-1.5">{t.matchTermsHint}</p>
              <textarea value={draft.matchTerms} onChange={e => setDraft({ ...draft, matchTerms: e.target.value })} placeholder={t.matchTermsPlaceholder} rows={2}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-ink">{t.stateRatesLabel}</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={addAllStates} className="text-xs font-semibold text-primary hover:underline">{t.addAllStates}</button>
                  <button type="button" onClick={() => setDraft({ ...draft, stateRates: [...draft.stateRates, { state: '', rate: '' }] })}
                    className="text-xs font-semibold text-primary hover:underline">+ {t.addStateRate}</button>
                </div>
              </div>
              <p className="text-[11px] text-faint mb-2">{t.stateRatesHint}</p>
              {draft.stateRates.map((sr, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={sr.state} onChange={e => { const next = [...draft.stateRates]; next[i] = { ...sr, state: e.target.value }; setDraft({ ...draft, stateRates: sortStateRates(next) }); }}
                    className="w-40 rounded-xl border border-border px-2 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">{t.selectStatePlaceholder}</option>
                    {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
                  </select>
                  <div className="flex-1 flex items-center rounded-xl border border-border px-3 focus-within:ring-2 focus-within:ring-primary">
                    <span className="text-faint text-sm">$</span>
                    <input value={sr.rate} onChange={e => { const next = [...draft.stateRates]; next[i] = { ...sr, rate: e.target.value.replace(/[^0-9.]/g, '') }; setDraft({ ...draft, stateRates: next }); }}
                      inputMode="decimal" placeholder="0.00" className="w-full py-2 pl-1 text-sm focus:outline-none" />
                  </div>
                  <button type="button" onClick={() => setDraft({ ...draft, stateRates: draft.stateRates.filter((_, j) => j !== i) })} className="p-1.5 rounded-lg text-faint hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
            </div>

            <button type="button" onClick={save} disabled={saving || !draft.name.trim()}
              className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">{t.saveBtn}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
