// Price sheet editor (reached from the Facturas header) — mobile. Self-contained
// CRUD over price_sheet_items; the caller mounts it with a supabase client +
// businessId. A price has an optional unit (blank = flat price) and optional
// per-state / per-client overrides. Add/edit uses the correct bottom-sheet pattern
// (absolute backdrop BEHIND a plain-View card) so the sheet scrolls — see
// CLAUDE.md.

import { useEffect, useMemo, useState } from 'react';
import { loadCachedThenFresh, writeCacheAndStamp } from '../../lib/swrCache';
import { useDataFingerprint } from '../../lib/dataFingerprint';
import { SkeletonList } from '../../ui/Skeleton';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal as RNModal } from 'react-native';
import { Plus, X, Trash2, Pencil, Copy, DollarSign, Search, ChevronDown, Check } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { fetchAllById } from '../../lib/supabaseFetch';
import { usStateName } from '../../lib/usStates';
import { Select } from '../../ui/Select';
import {
  type PriceSheetItem,
  type PriceSheetRow,
  type PricingMode,
  rowToPriceSheetItem,
  priceItemLabel,
} from '../../lib/priceSheet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface PriceSheetScreenProps {
  supabase: SupabaseLike;
  businessId: string;
  canManage: boolean;
  /** Web-only "Generate sheet" action; ignored on mobile for now. */
  onGenerate?: () => void;
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


const emptyDraft = (): Draft => ({
  id: null, name: '', category: '', pricingMode: 'per_unit', unitLabel: '', rate: '', stateRates: [], clientRates: [], matchTerms: '', isAddon: false, addonInline: false,
});

export function PriceSheetScreen({ supabase, businessId, canManage }: PriceSheetScreenProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.settings.priceSheet;

  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
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

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      i.matchTerms.some(m => m.includes(q)));
  }, [items, search]);

  const groups = useMemo(() => {
    const by = new Map<string, PriceSheetItem[]>();
    visibleItems.forEach(i => {
      const key = (i.category ?? '').trim() || '￿';
      (by.get(key) ?? by.set(key, []).get(key)!).push(i);
    });
    return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleItems]);

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

  return (
    <View className="flex-1">
      <View className="flex-row items-start justify-between gap-3 mb-4">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{t.title}</Text>
          <Text className="text-xs text-faint mt-0.5">{t.subtitle}</Text>
        </View>
        {canManage ? (
          <Pressable onPress={() => setDraft(emptyDraft())} className="flex-row items-center gap-1.5 bg-primary px-3.5 py-2 rounded-xl active:opacity-90">
            <Plus size={15} color="#fff" />
            <Text className="text-sm font-semibold text-white">{t.addBtn}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Search */}
      <View className="flex-row items-center rounded-2xl border border-border bg-card px-3 mb-4">
        <Search size={16} color={c.faint} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.searchPlaceholder} placeholderTextColor={c.faint}
          autoCapitalize="none" autoCorrect={false} className="flex-1 py-2.5 pl-2 text-sm text-ink" />
        {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><X size={16} color={c.faint} /></Pressable> : null}
      </View>


      {loading ? (
        <SkeletonList rows={6} />
      ) : items.length === 0 ? (
        <View className="items-center py-16">
          <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mb-3"><DollarSign size={20} color={c.primary} /></View>
          <Text className="text-sm text-faint text-center px-8">{t.empty}</Text>
        </View>
      ) : groups.length === 0 ? (
        <View className="items-center py-16"><Text className="text-sm text-faint">{t.noResults}</Text></View>
      ) : (
        <View className="gap-5">
          {groups.map(([key, list]) => (
            <View key={key}>
              <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">
                {key === '￿' ? t.uncategorized : key}
              </Text>
              <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
                {list.map((i, idx) => (
                  <View key={i.id} className={`px-4 py-4 flex-row items-center gap-3 ${idx < list.length - 1 ? 'border-b border-border-soft' : ''} ${!i.active ? 'opacity-50' : ''}`}>
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
                        <Pressable onPress={() => openEdit(i)} className="p-1.5 rounded-lg active:bg-primary/5"><Pencil size={14} color={c.faint} /></Pressable>
                        <Pressable onPress={() => duplicate(i)} className="p-1.5 rounded-lg active:bg-primary/5"><Copy size={14} color={c.faint} /></Pressable>
                        <Pressable onPress={() => remove(i)} className="p-1.5 rounded-lg active:bg-red-500/10"><Trash2 size={14} color={c.danger} /></Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add/edit sheet — absolute backdrop BEHIND a plain-View card (scrolls). */}
      <RNModal visible={!!draft} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <View className="flex-1 justify-end">
          <Pressable onPress={() => setDraft(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[90%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-ink">{t.title}</Text>
              <Pressable onPress={() => setDraft(null)} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft"><X size={20} color={c.faint} /></Pressable>
            </View>
            {draft ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text className="text-sm font-semibold text-ink mb-1">{t.nameLabel}</Text>
                <TextInput value={draft.name} onChangeText={v => setDraftKey('name', v)} placeholder={t.namePlaceholder} placeholderTextColor={c.faint}
                  className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />

                <Text className="text-sm font-semibold text-ink mb-1">{t.categoryLabel}</Text>
                <TextInput value={draft.category} onChangeText={v => setDraftKey('category', v)} placeholder={t.categoryPlaceholder} placeholderTextColor={c.faint}
                  className="mb-3 rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />

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
                    <Text className="text-sm font-semibold text-ink mb-1">{t.unitLabel}</Text>
                    <TextInput value={draft.unitLabel} onChangeText={v => setDraftKey('unitLabel', v)} placeholder={t.unitPlaceholder} placeholderTextColor={c.faint}
                      className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />
                    <Text className="text-[11px] text-faint mt-1 mb-3">{t.unitHint}</Text>
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
                    className="flex-1 py-2.5 pl-1 text-base text-ink" />
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
                          keyboardType="decimal-pad" placeholder={String(draft.rate || '0.00')} placeholderTextColor={c.faint} className="flex-1 py-2.5 pl-1 text-base text-ink" />
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
                    multiline numberOfLines={2} className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" style={{ minHeight: 56, textAlignVertical: 'top' }} />
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
                          keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.faint} className="flex-1 py-2.5 pl-1 text-base text-ink" />
                      </View>
                      <Pressable onPress={() => setDraftKey('stateRates', draft.stateRates.filter((_, j) => j !== i))} className="p-1.5"><X size={16} color={c.faint} /></Pressable>
                    </View>
                  ))}
                </View>

                <Pressable onPress={save} disabled={saving || !draft.name.trim()}
                  className={`py-3.5 rounded-2xl items-center ${saving || !draft.name.trim() ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}>
                  <Text className="text-sm font-semibold text-white">{t.saveBtn}</Text>
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
                    autoFocus autoCorrect={false} autoCapitalize="none" className="flex-1 py-2.5 pl-2 text-base text-ink" />
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
        </View>
      </RNModal>
    </View>
  );
}
