'use client';

// Price sheet editor (Ajustes → Precios). Self-contained CRUD over
// price_sheet_items — the caller just mounts it with a supabase client +
// businessId. Items group by category; each has a pricing mode, rate, and
// optional per-state overrides that autoprice reads via applicableRate().

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Trash2, Pencil, DollarSign } from 'lucide-react';
import { useLang } from '../../i18n';
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
}

interface DraftState { state: string; rate: string }
interface Draft {
  id: string | null;
  name: string;
  category: string;
  pricingMode: PricingMode;
  unitLabel: string;
  rate: string;
  stateRates: DraftState[];
  tierRates: Record<string, string>;
  matchTerms: string;
}

interface PriceTier { id: string; name: string }

const emptyDraft = (): Draft => ({
  id: null, name: '', category: '', pricingMode: 'per_unit', unitLabel: '', rate: '', stateRates: [], tierRates: {}, matchTerms: '',
});

export function PriceSheetScreen({ supabase, businessId, canManage }: PriceSheetScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.priceSheet;

  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [newTier, setNewTier] = useState('');

  const loadTiers = async () => {
    const { data } = await supabase.from('price_tiers').select('id, name').eq('business_id', businessId).order('sort_order');
    setTiers((data ?? []) as PriceTier[]);
  };
  const addTier = async () => {
    if (!newTier.trim()) return;
    await supabase.from('price_tiers').insert({ business_id: businessId, name: newTier.trim(), sort_order: tiers.length });
    setNewTier('');
    await loadTiers();
  };
  const renameTier = async (id: string, name: string) => {
    await supabase.from('price_tiers').update({ name }).eq('id', id);
    setTiers(prev => prev.map(x => x.id === id ? { ...x, name } : x));
  };
  const removeTier = async (id: string) => {
    if (!window.confirm(t.deleteTierConfirm)) return;
    await supabase.from('price_tiers').delete().eq('id', id);
    await Promise.all([loadTiers(), load()]);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('price_sheet_items')
      .select('id, name, category, pricing_mode, unit_label, rate, state_rates, tier_rates, match_terms, sort_order, active')
      .eq('business_id', businessId)
      .order('sort_order')
      .order('name');
    setItems(((data ?? []) as PriceSheetRow[]).map(rowToPriceSheetItem));
    setLoading(false);
  };
  useEffect(() => { void load(); void loadTiers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [businessId]);

  // Group by category, "uncategorized" last.
  const groups = useMemo(() => {
    const by = new Map<string, PriceSheetItem[]>();
    items.forEach(i => {
      const key = (i.category ?? '').trim() || '￿';
      (by.get(key) ?? by.set(key, []).get(key)!).push(i);
    });
    return Array.from(by.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const openNew = () => setDraft(emptyDraft());
  const openEdit = (i: PriceSheetItem) => setDraft({
    id: i.id,
    name: i.name,
    category: i.category ?? '',
    pricingMode: i.pricingMode,
    unitLabel: i.unitLabel ?? '',
    rate: String(i.rate),
    stateRates: Object.entries(i.stateRates ?? {}).map(([state, rate]) => ({ state, rate: String(rate) })),
    tierRates: Object.fromEntries(Object.entries(i.tierRates ?? {}).map(([k, v]) => [k, String(v)])),
    matchTerms: i.matchTerms.join(', '),
  });

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
      tier_rates: (() => {
        const tr: Record<string, number> = {};
        Object.entries(draft.tierRates).forEach(([tid, v]) => { const r = parseFloat(v); if (Number.isFinite(r)) tr[tid] = r; });
        return Object.keys(tr).length ? tr : null;
      })(),
      match_terms: draft.matchTerms.trim() || null,
    };
    if (draft.id) await supabase.from('price_sheet_items').update(payload).eq('id', draft.id);
    else await supabase.from('price_sheet_items').insert({ ...payload, sort_order: items.length });
    setDraft(null);
    setSaving(false);
    await load();
  };

  const toggleActive = async (i: PriceSheetItem) => {
    await supabase.from('price_sheet_items').update({ active: !i.active }).eq('id', i.id);
    await load();
  };
  const remove = async (i: PriceSheetItem) => {
    if (!window.confirm(t.deleteConfirm)) return;
    await supabase.from('price_sheet_items').delete().eq('id', i.id);
    await load();
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{t.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{t.subtitle}</p>
        </div>
        {canManage ? (
          <button type="button" onClick={openNew}
            className="flex items-center gap-1.5 bg-primary px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 shrink-0">
            <Plus size={15} /> {t.addBtn}
          </button>
        ) : null}
      </div>

      {/* Tiers manager — pricing models assigned to clients. */}
      {canManage ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-900">{t.tiersTitle}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{t.tiersHint}</p>
          <div className="flex flex-col gap-2">
            {tiers.map(tier => (
              <div key={tier.id} className="flex items-center gap-2">
                <input value={tier.name} onChange={e => renameTier(tier.id, e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <button type="button" onClick={() => removeTier(tier.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500"><X size={14} /></button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input value={newTier} onChange={e => setNewTier(e.target.value)} placeholder={t.tierNamePlaceholder}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addTier(); } }}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button type="button" onClick={addTier} disabled={!newTier.trim()} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-40">+ {t.addTier}</button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3"><DollarSign size={20} className="text-primary" /></div>
          <p className="text-sm text-gray-400 max-w-xs">{t.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, list]) => (
            <div key={key}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {key === '￿' ? t.uncategorized : key}
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {list.map((i, idx) => (
                  <div key={i.id} className={`px-4 py-3 flex items-center gap-3 ${idx < list.length - 1 ? 'border-b border-gray-50' : ''} ${!i.active ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{i.name}</p>
                        {!i.active ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">{t.inactiveBadge}</span> : null}
                      </div>
                      <p className="text-xs text-gray-500">
                        {priceItemLabel(i, t.flatWord)}
                        {i.stateRates ? ` · ${Object.entries(i.stateRates).map(([st, r]) => `${st} $${r}`).join(' · ')}` : ''}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => toggleActive(i)} className="px-2 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100">
                          {i.active ? t.deactivate : t.activate}
                        </button>
                        <button type="button" onClick={() => openEdit(i)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5"><Pencil size={14} /></button>
                        <button type="button" onClick={() => remove(i)} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/edit modal */}
      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDraft(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-lg font-bold text-gray-900">{t.title}</p>
              <button type="button" onClick={() => setDraft(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-400" /></button>
            </div>

            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.nameLabel}</label>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t.namePlaceholder}
              className="w-full mb-3 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />

            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.categoryLabel}</label>
            <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder={t.categoryPlaceholder}
              list="price-categories"
              className="w-full mb-3 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <datalist id="price-categories">{Array.from(new Set(items.map(i => i.category).filter(Boolean))).map(c => <option key={c} value={c!} />)}</datalist>

            <label className="block text-sm font-semibold text-gray-700 mb-1">{t.modeLabel}</label>
            <div className="flex gap-2 mb-3">
              {(['per_unit', 'flat'] as PricingMode[]).map(m => (
                <button key={m} type="button" onClick={() => setDraft({ ...draft, pricingMode: m })}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${draft.pricingMode === m ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {m === 'per_unit' ? t.modePerUnit : t.modeFlat}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mb-3">
              <label className="flex-1 text-sm font-semibold text-gray-700">
                {t.rateLabel}
                <div className="mt-1 flex items-center rounded-xl border border-gray-200 px-3 focus-within:ring-2 focus-within:ring-primary">
                  <span className="text-gray-400 text-sm">$</span>
                  <input value={draft.rate} onChange={e => setDraft({ ...draft, rate: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="0.00"
                    className="w-full py-2 pl-1 text-sm focus:outline-none" />
                </div>
              </label>
              {draft.pricingMode === 'per_unit' ? (
                <label className="flex-1 text-sm font-semibold text-gray-700">
                  {t.unitLabel}
                  <input value={draft.unitLabel} onChange={e => setDraft({ ...draft, unitLabel: e.target.value })} placeholder={t.unitPlaceholder}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
              ) : null}
            </div>

            {tiers.length > 0 ? (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t.tierRatesLabel}</label>
                {tiers.map(tier => (
                  <div key={tier.id} className="flex items-center gap-2 mb-2">
                    <span className="w-28 text-sm text-gray-600 truncate">{tier.name}</span>
                    <div className="flex-1 flex items-center rounded-xl border border-gray-200 px-3 focus-within:ring-2 focus-within:ring-primary">
                      <span className="text-gray-400 text-sm">$</span>
                      <input value={draft.tierRates[tier.id] ?? ''} onChange={e => setDraft({ ...draft, tierRates: { ...draft.tierRates, [tier.id]: e.target.value.replace(/[^0-9.]/g, '') } })}
                        inputMode="decimal" placeholder={String(draft.rate || '0.00')} className="w-full py-2 pl-1 text-sm focus:outline-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t.matchTermsLabel}</label>
              <p className="text-[11px] text-gray-400 mb-1.5">{t.matchTermsHint}</p>
              <textarea value={draft.matchTerms} onChange={e => setDraft({ ...draft, matchTerms: e.target.value })} placeholder={t.matchTermsPlaceholder} rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-700">{t.stateRatesLabel}</label>
                <button type="button" onClick={() => setDraft({ ...draft, stateRates: [...draft.stateRates, { state: '', rate: '' }] })}
                  className="text-xs font-semibold text-primary hover:underline">+ {t.addStateRate}</button>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">{t.stateRatesHint}</p>
              {draft.stateRates.map((sr, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input value={sr.state} onChange={e => { const next = [...draft.stateRates]; next[i] = { ...sr, state: e.target.value.toUpperCase().slice(0, 2) }; setDraft({ ...draft, stateRates: next }); }}
                    placeholder={t.statePlaceholder} className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <div className="flex-1 flex items-center rounded-xl border border-gray-200 px-3 focus-within:ring-2 focus-within:ring-primary">
                    <span className="text-gray-400 text-sm">$</span>
                    <input value={sr.rate} onChange={e => { const next = [...draft.stateRates]; next[i] = { ...sr, rate: e.target.value.replace(/[^0-9.]/g, '') }; setDraft({ ...draft, stateRates: next }); }}
                      inputMode="decimal" placeholder="0.00" className="w-full py-2 pl-1 text-sm focus:outline-none" />
                  </div>
                  <button type="button" onClick={() => setDraft({ ...draft, stateRates: draft.stateRates.filter((_, j) => j !== i) })} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500"><X size={14} /></button>
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
