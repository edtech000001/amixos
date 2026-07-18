'use client';

export const dynamic = 'force-dynamic';

// Client-facing price sheet generator. Pick a client (uses their state + price
// tier) or a state directly; every item re-prices via applicableRate (tier →
// state → base, so items with no state rate just show the base and land on
// every sheet). Preview on screen, then Print / Save as PDF (browser print,
// print-only CSS hides the app chrome). A "Customize" panel controls the accent
// color, section order, and per-unit price label — persisted per business.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ArrowLeft, Sliders, ChevronUp, ChevronDown } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Modal } from '@/components/ui/Modal';
import { alertMessage } from '@amixos/shared/ui/confirmBus';
import {
  rowToPriceSheetItem,
  applicableRate,
  type PriceSheetItem,
  type PriceSheetRow,
} from '@amixos/shared/lib/priceSheet';
import { usStateName, US_STATE_ABBR_TO_NAME } from '@amixos/shared/lib/usStates';
import {
  normalizePriceSheetTemplate,
  PRICE_SHEET_DESIGNS,
  type PriceSheetTemplateConfig,
  type PriceSheetDesign,
} from '@amixos/shared/lib/priceSheetTemplate';

interface ClientLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  state: string | null;
  price_tier_id: string | null;
}

const STATE_CODES = Object.keys(US_STATE_ABBR_TO_NAME);
// Reserved section keys — plain ASCII so they're safe inside the categoryOrder
// JSONB (a control char makes Postgres reject the whole value).
const UNCAT = '__uncategorized__'; // uncategorized bucket (always sorts last)
const ADDONS = '__additional_charges__'; // the "Additional charges" section

export default function GenerarPreciosPage() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business, refetchBusiness } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.priceSheet;

  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [mode, setMode] = useState<'client' | 'state'>('client');
  const [clientId, setClientId] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [loading, setLoading] = useState(true);

  // Style/order config (businesses.price_sheet_template). Local so the preview
  // updates live; saved from the Customize modal. Only re-seed from the business
  // when the business itself changes — NOT on every reference churn (a post-save
  // refetch would otherwise snap the freshly-saved value back).
  const [template, setTemplate] = useState<PriceSheetTemplateConfig>(() => normalizePriceSheetTemplate(business?.price_sheet_template));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTemplate(normalizePriceSheetTemplate(business?.price_sheet_template)); }, [business?.id]);
  const accent = template.accentColor;

  useEffect(() => {
    if (!business) return;
    const bid = business.id;
    (async () => {
      setLoading(true);
      const [itemRes, clientRes] = await Promise.all([
        supabase.from('price_sheet_items')
          .select('id, name, category, pricing_mode, unit_label, rate, state_rates, tier_rates, match_terms, is_addon, sort_order, active')
          .eq('business_id', bid).eq('active', true).order('sort_order').order('name'),
        supabase.from('clients')
          .select('id, first_name, last_name, company, state, price_tier_id')
          .eq('business_id', bid).order('company', { ascending: true }).order('last_name', { ascending: true }),
      ]);
      setItems(((itemRes.data ?? []) as PriceSheetRow[]).map(rowToPriceSheetItem));
      setClients((clientRes.data ?? []) as ClientLite[]);
      setLoading(false);
    })();
  }, [business, supabase]);

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);
  const ctx = useMemo(() => (
    mode === 'client'
      ? { state: selectedClient?.state ?? null, tierId: selectedClient?.price_tier_id ?? null }
      : { state: stateCode || null, tierId: null }
  ), [mode, selectedClient, stateCode]);

  const clientName = (c: ClientLite) => (c.company?.trim() || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—');
  const preparedFor = mode === 'client' && selectedClient ? clientName(selectedClient) : null;
  const stateLabel = ctx.state ? usStateName(ctx.state, locale) : t.allStatesLabel;

  // Items grouped into sections: one per category (keyed by name, uncategorized
  // under UNCAT) plus the ADDONS section for surcharges.
  const sectionItems = useMemo(() => {
    const by = new Map<string, PriceSheetItem[]>();
    items.forEach(i => {
      const key = i.isAddon ? ADDONS : ((i.category ?? '').trim() || UNCAT);
      (by.get(key) ?? by.set(key, []).get(key)!).push(i);
    });
    return by;
  }, [items]);

  // Sections the user can reorder (named categories + Additional charges);
  // uncategorized is excluded (it always sinks last).
  const orderableSections = useMemo(
    () => Array.from(sectionItems.keys()).filter(k => k !== UNCAT),
    [sectionItems],
  );

  // Section keys in display order: those listed in categoryOrder first (in that
  // order), then unlisted ones — with UNCAT, and Additional charges when it
  // wasn't explicitly placed, sinking to the bottom.
  const orderedSectionKeys = useMemo(() => {
    const keys = Array.from(sectionItems.keys());
    const idx = new Map(template.categoryOrder.map((c, i) => [c, i]));
    const sink = (k: string) => (k === UNCAT || (k === ADDONS && !idx.has(ADDONS))) ? 1 : 0;
    return keys.sort((a, b) => {
      if (sink(a) !== sink(b)) return sink(a) - sink(b);
      const ao = idx.has(a) ? idx.get(a)! : Infinity;
      const bo = idx.has(b) ? idx.get(b)! : Infinity;
      if (ao !== bo) return ao - bo;
      return a.localeCompare(b);
    });
  }, [sectionItems, template.categoryOrder]);

  const sectionLabel = (k: string) => (k === ADDONS ? t.additionalCharges : k === UNCAT ? t.uncategorized : k);

  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const priceDisplay = (item: PriceSheetItem, plus = false) => {
    const m = `${plus ? '+ ' : ''}${money(applicableRate(item, ctx))}`;
    if (item.pricingMode === 'flat') return `${m} ${t.flatWord}`;
    // Each item's own unit label ("$4 / ft", "$0.43 / lb") — set per item.
    return item.unitLabel ? `${m} / ${item.unitLabel}` : m;
  };

  // Theme → visual tokens. Distinct looks for different trades.
  const design = template.design;
  const theme = useMemo(() => {
    switch (design) {
      case 'cards':   return { font: '', centered: false, outerGap: 'gap-6', card: true,  header: 'plain'     as const, rowDivider: true,  rowPad: 'py-1.5', textSize: 'text-sm' };
      case 'bold':    return { font: '', centered: false, outerGap: 'gap-5', card: false, header: 'bar'       as const, rowDivider: true,  rowPad: 'py-1.5', textSize: 'text-sm' };
      case 'elegant': return { font: 'font-serif', centered: true, outerGap: 'gap-7', card: false, header: 'underline' as const, rowDivider: false, rowPad: 'py-2', textSize: 'text-[15px]' };
      case 'minimal': return { font: '', centered: false, outerGap: 'gap-5', card: false, header: 'light'     as const, rowDivider: false, rowPad: 'py-1', textSize: 'text-sm' };
      default:        return { font: '', centered: false, outerGap: 'gap-6', card: false, header: 'plain'     as const, rowDivider: true,  rowPad: 'py-1.5', textSize: 'text-sm' };
    }
  }, [design]);

  const groupWrapCls = theme.card ? 'break-inside-avoid rounded-xl border border-gray-100 p-4' : 'break-inside-avoid';
  const rowCls = `flex items-baseline justify-between gap-4 ${theme.rowPad} print:py-0.5 ${theme.rowDivider ? 'border-b border-gray-50 last:border-0' : ''}`;
  const nameCls = `text-gray-800 ${theme.textSize}`;
  const priceBaseCls = `font-semibold whitespace-nowrap ${theme.textSize}`;

  // Section header rendered per theme.
  const sectionHeader = (label: string) => {
    if (theme.header === 'bar') return <div className="mb-2 rounded-md px-3 py-1.5" style={{ backgroundColor: accent }}><span className="text-xs font-bold uppercase tracking-wide text-white">{label}</span></div>;
    if (theme.header === 'underline') return <p className="mb-2 pb-1 text-sm font-semibold uppercase tracking-[0.12em] border-b" style={{ color: accent, borderColor: accent }}>{label}</p>;
    if (theme.header === 'light') return <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>;
    return <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>{label}</p>;
  };

  const businessLines = business ? [
    `${business.city ?? ''}${business.state ? `, ${business.state}` : ''}${business.postal_code ? ` ${business.postal_code}` : ''}`,
    business.address ?? '',
    business.phone ?? '',
    business.email ?? '',
    business.website ?? '',
  ].map(s => s.trim()).filter(Boolean) : [];

  const todayStr = new Date().toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Customize modal ──────────────────────────────────────────────────────
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftDesign, setDraftDesign] = useState<PriceSheetDesign>(template.design);
  const [draftAccent, setDraftAccent] = useState(accent);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [savingTpl, setSavingTpl] = useState(false);

  const openCustomize = () => {
    setDraftDesign(template.design);
    setDraftAccent(template.accentColor);
    // Seed the reorder list from the CURRENT display order (so it matches the
    // sheet), excluding the always-last uncategorized bucket.
    setDraftOrder(orderedSectionKeys.filter(k => k !== UNCAT));
    setCustomizeOpen(true);
  };
  const moveCat = (i: number, dir: -1 | 1) => {
    setDraftOrder(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const saveCustomize = async () => {
    if (!business) return;
    setSavingTpl(true);
    const cfg: PriceSheetTemplateConfig = { design: draftDesign, accentColor: draftAccent, categoryOrder: draftOrder };
    const { error } = await supabase.from('businesses').update({ price_sheet_template: cfg }).eq('id', business.id);
    if (error) { setSavingTpl(false); await alertMessage({ message: error.message }); return; }
    setTemplate(cfg);
    void refetchBusiness();
    setSavingTpl(false);
    setCustomizeOpen(false);
  };

  return (
    <div className="min-h-screen print:min-h-0 bg-gray-50 print:bg-white p-6 lg:p-8 print:p-0">
      {/* Tight, full-width single page when printing. */}
      <style>{`@media print { @page { size: letter portrait; margin: 0.4in; } html, body { background: #fff; } }`}</style>
      {/* Controls — hidden on print */}
      <div className="max-w-3xl mx-auto mb-5 print:hidden">
        <button type="button" onClick={() => router.back()} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft size={16} /> {t.title}
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t.generateTitle}</label>
            <div className="flex gap-2">
              <div className="inline-flex gap-1 bg-gray-100 p-1 rounded-xl">
                {(['client', 'state'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                    {m === 'client' ? t.forClient : t.forState}
                  </button>
                ))}
              </div>
              {mode === 'client' ? (
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">{t.selectClientPlaceholder}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{clientName(c)}{c.state ? ` (${c.state})` : ''}</option>)}
                </select>
              ) : (
                <select value={stateCode} onChange={e => setStateCode(e.target.value)}
                  className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">{t.allStatesLabel}</option>
                  {STATE_CODES.slice().sort((a, b) => usStateName(a, locale).localeCompare(usStateName(b, locale)))
                    .map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={openCustomize}
              className="flex items-center justify-center gap-1.5 bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <Sliders size={16} /> {t.customizeBtn}
            </button>
            <button type="button" onClick={() => window.print()}
              className="flex items-center justify-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90">
              <Printer size={16} /> {t.printBtn}
            </button>
          </div>
        </div>
      </div>

      {/* Document — the printout */}
      <div className={`max-w-3xl print:max-w-full mx-auto bg-white rounded-2xl print:rounded-none border border-gray-100 print:border-0 shadow-sm print:shadow-none p-8 print:p-0 ${theme.font}`}>
        {/* Header — split (default) or centered (elegant) */}
        {theme.centered ? (
          <div className="text-center pb-5 print:pb-2 border-b border-gray-100">
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt="" className="w-16 h-16 rounded-xl object-contain border border-gray-100 mx-auto mb-2" />
            ) : null}
            <p className="text-2xl font-bold text-gray-900">{business?.name ?? ''}</p>
            {businessLines.map((l, i) => <p key={i} className="text-xs text-gray-500 leading-relaxed">{l}</p>)}
            <p className="text-lg font-semibold mt-3" style={{ color: accent }}>{t.sheetTitle} · {stateLabel}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {t.generatedOn} {todayStr}{preparedFor ? ` · ${t.preparedFor}: ${preparedFor}` : ''}
            </p>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-6 pb-5 print:pb-2 border-b border-gray-100">
            <div className="flex items-start gap-3">
              {business?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.logo_url} alt="" className="w-14 h-14 rounded-xl object-contain border border-gray-100" />
              ) : null}
              <div>
                <p className="text-lg font-bold text-gray-900">{business?.name ?? ''}</p>
                {businessLines.map((l, i) => <p key={i} className="text-xs text-gray-500 leading-relaxed">{l}</p>)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-bold" style={{ color: accent }}>{t.sheetTitle}</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: accent }}>{stateLabel}</p>
              <p className="text-xs text-gray-400 mt-1">{t.generatedOn} {todayStr}</p>
              {preparedFor ? <p className="text-xs text-gray-500 mt-1">{t.preparedFor}: <span className="font-semibold text-gray-700">{preparedFor}</span></p> : null}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-12">…</p>
        ) : (
          <div className={`pt-5 print:pt-3 flex flex-col ${theme.outerGap} print:gap-2`}>
            {orderedSectionKeys.map(key => {
              const secItems = sectionItems.get(key) ?? [];
              const isAddon = key === ADDONS;
              return (
                <div key={key} className={groupWrapCls}>
                  {sectionHeader(sectionLabel(key))}
                  <div className="flex flex-col">
                    {secItems.map(item => (
                      <div key={item.id} className={rowCls}>
                        <span className={nameCls}>{item.name}</span>
                        <span className={`${priceBaseCls} ${isAddon ? 'text-amber-600' : 'text-gray-900'}`}>{priceDisplay(item, isAddon)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Customize modal */}
      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title={t.customizeTitle} size="lg">
        <div className="flex flex-col gap-5">
          {/* Design preset */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.designLabel}</label>
            <div className="grid grid-cols-3 gap-2">
              {PRICE_SHEET_DESIGNS.map(d => (
                <button key={d} type="button" onClick={() => setDraftDesign(d)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${draftDesign === d ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {d === 'classic' ? t.designClassic : d === 'cards' ? t.designCards : d === 'bold' ? t.designBold : d === 'elegant' ? t.designElegant : t.designMinimal}
                </button>
              ))}
            </div>
          </div>

          {/* Accent color */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.accentColorLabel}</label>
            <div className="flex items-center gap-3">
              <input type="color" value={draftAccent} onChange={e => setDraftAccent(e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer bg-white" />
              <input value={draftAccent} onChange={e => setDraftAccent(e.target.value)}
                className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Section order */}
          {draftOrder.length > 0 ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t.sectionOrderLabel}</label>
              <p className="text-xs text-gray-400 mb-2">{t.sectionOrderHint}</p>
              <div className="rounded-xl border border-gray-100 max-h-56 overflow-y-auto">
                {draftOrder.map((cat, i) => (
                  <div key={cat} className={`flex items-center justify-between gap-2 px-3 py-2 ${i < draftOrder.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <span className="text-sm text-gray-800 truncate">{cat === ADDONS ? t.additionalCharges : cat}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => moveCat(i, -1)} disabled={i === 0}
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronUp size={16} /></button>
                      <button type="button" onClick={() => moveCat(i, 1)} disabled={i === draftOrder.length - 1}
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronDown size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="sticky bottom-0 -mx-7 px-7 -mb-6 pb-6 pt-3 bg-white">
            <button type="button" onClick={saveCustomize} disabled={savingTpl}
              className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">{t.saveBtn}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
