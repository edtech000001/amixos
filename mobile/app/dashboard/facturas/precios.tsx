// Facturas → Lista de precios (price sheet). Reached from the invoices header
// $ button. Its own stacked page with a back header + scroll.
//
// The header's printer button generates the client-facing price-sheet PDF
// (shared buildPriceSheetHtml → expo-print → OS share sheet) — the mobile
// counterpart of the web /precios/generar page: pick a client (uses their
// state + client prices) or a state, then share.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal as RNModal, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronUp, Printer, Sliders, X, GripVertical, Eye, EyeOff } from 'lucide-react-native';
import Sortable from 'react-native-sortables';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { can } from '@amixos/shared/lib/permissions';
import { PriceSheetScreen } from '@amixos/shared/screens/dashboard/PriceSheetScreen';
import { Select } from '@amixos/shared/ui';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { formatDateLong } from '@amixos/shared/lib/format';
import { usStateName, US_STATE_ABBR_TO_NAME } from '@amixos/shared/lib/usStates';
import { rowToPriceSheetItem, type PriceSheetItem, type PriceSheetRow } from '@amixos/shared/lib/priceSheet';
import {
  normalizePriceSheetTemplate,
  orderCategories,
  PRICE_SHEET_DESIGNS,
  type PriceSheetDesign,
  type PriceSheetTemplateConfig,
} from '@amixos/shared/lib/priceSheetTemplate';
import { buildPriceSheetHtml } from '@amixos/shared/lib/priceSheetHtml';

interface ClientLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  state: string | null;
}

const UNCAT = '__uncategorized__';
const ADDONS = '__additional_charges__';
// Swatch palette for mobile (no native color input) — the web page's free
// color picker still accepts anything; these cover the common brands.
const ACCENT_SWATCHES = ['#4F46E5', '#2563EB', '#0D9488', '#16A34A', '#D97706', '#EA580C', '#DC2626', '#DB2777', '#7C3AED', '#475569'];

export default function FacturasPreciosPage() {
  const router = useRouter();
  // Deep-link from client detail: ?client=<id> preselects that client and
  // opens the generate sheet right away (mirrors web /precios/generar?client=).
  const { client: clientParam } = useLocalSearchParams<{ client?: string }>();
  const { t: full, locale } = useLang();
  const { business, currentRole, refetchBusiness } = useApp();
  const c = useThemeColors();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const t = full.dashboard.settings.priceSheet;

  // ── Generate PDF sheet ──────────────────────────────────────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [mode, setMode] = useState<'client' | 'state'>('client');
  const [clientId, setClientId] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<PriceSheetItem[]>([]);
  const [biz, setBiz] = useState<{ name?: string; logo_url?: string | null; address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; phone?: string | null; email?: string | null; price_sheet_template?: unknown } | null>(null);
  const [template, setTemplate] = useState<PriceSheetTemplateConfig | null>(null);
  // Customize (design + accent + section order) — persisted business-wide,
  // same businesses.price_sheet_template the web generator uses.
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftDesign, setDraftDesign] = useState<PriceSheetDesign>('classic');
  const [draftAccent, setDraftAccent] = useState('#4F46E5');
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  // Exclusions, not inclusions: a category or price added later prints by
  // default. An inclusion list would silently drop everything new.
  const [draftHiddenCats, setDraftHiddenCats] = useState<string[]>([]);
  const [draftHiddenItems, setDraftHiddenItems] = useState<string[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    if (typeof clientParam === 'string' && clientParam) {
      setMode('client');
      setClientId(clientParam);
      setGenOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientParam]);

  useEffect(() => {
    if (!business || !genOpen || clients.length) return;
    void fetchAllById<ClientLite>((afterId, pageSize) => {
      let q = supabase.from('clients').select('id, first_name, last_name, company, state')
        .eq('business_id', business.id).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }).then(rows => setClients(rows)).catch(() => {});
    void (async () => {
      const [{ data: itemRows }, { data: bizRow }] = await Promise.all([
        supabase.from('price_sheet_items')
          .select('id, name, category, pricing_mode, unit_label, rate, state_rates, client_rates, match_terms, is_addon, addon_inline, sort_order, active')
          .eq('business_id', business.id).eq('active', true).order('sort_order').order('name'),
        supabase.from('businesses')
          .select('name, logo_url, address, city, state, postal_code, phone, email, price_sheet_template')
          .eq('id', business.id).single(),
      ]);
      setItems(((itemRows ?? []) as PriceSheetRow[]).map(rowToPriceSheetItem));
      const bz = (bizRow ?? {}) as NonNullable<typeof biz>;
      setBiz(bz);
      setTemplate(normalizePriceSheetTemplate(bz.price_sheet_template));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, genOpen]);

  const clientName = (cl: ClientLite) => {
    const person = `${cl.first_name ?? ''} ${cl.last_name ?? ''}`.trim();
    return [person, cl.company?.trim()].filter(Boolean).join(' · ') || '—';
  };
  const clientOptions = useMemo(
    () => [...clients]
      .sort((a, b) => clientName(a).localeCompare(clientName(b), 'es', { sensitivity: 'base' }))
      .map(cl => ({ value: cl.id, label: `${clientName(cl)}${cl.state ? ` (${cl.state})` : ''}` })),
    [clients],
  );
  const stateOptions = useMemo(
    () => Object.keys(US_STATE_ABBR_TO_NAME)
      .sort((a, b) => usStateName(a, locale).localeCompare(usStateName(b, locale)))
      .map(s => ({ value: s, label: usStateName(s, locale) })),
    [locale],
  );

  // Current display order of category sections (matches the sheet), addons
  // included, uncategorized always last (excluded from reordering).
  const sectionKeys = useMemo(() => {
    const keys = new Set<string>();
    items.forEach(i => keys.add(i.isAddon ? ADDONS : ((i.category ?? '').trim() || UNCAT)));
    return orderCategories(Array.from(keys), template?.categoryOrder ?? [], UNCAT).filter(k => k !== UNCAT);
  }, [items, template]);

  const openCustomize = () => {
    const tpl = template ?? normalizePriceSheetTemplate(null);
    setDraftDesign(tpl.design);
    setDraftAccent(tpl.accentColor);
    setDraftOrder(sectionKeys);
    setDraftHiddenCats(tpl.hiddenCategories);
    setDraftHiddenItems(tpl.hiddenItemIds);
    setExpandedCat(null);
    setCustomizeOpen(true);
  };
  /** Prices per section — the customize sheet needs them to offer per-price
   *  exclusion when a section is expanded. */
  const sectionItems = useMemo(() => {
    const by = new Map<string, typeof items>();
    items.forEach(i => {
      const key = i.isAddon ? ADDONS : ((i.category ?? '').trim() || UNCAT);
      (by.get(key) ?? by.set(key, []).get(key)!).push(i);
    });
    return by;
  }, [items]);

  const toggleCatHidden = (cat: string) =>
    setDraftHiddenCats(prev => (prev.includes(cat) ? prev.filter(x => x !== cat) : [...prev, cat]));
  const toggleItemHidden = (id: string) =>
    setDraftHiddenItems(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

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
    const cfg: PriceSheetTemplateConfig = {
      design: draftDesign,
      accentColor: draftAccent,
      categoryOrder: draftOrder,
      hiddenCategories: draftHiddenCats,
      hiddenItemIds: draftHiddenItems,
    };
    const { error } = await supabase.from('businesses').update({ price_sheet_template: cfg }).eq('id', business.id);
    if (!error) {
      setTemplate(cfg);
      setCustomizeOpen(false);
    }
    setSavingTpl(false);
  };

  const generate = async () => {
    if (!business || !biz) return;
    setBusy(true);
    try {
      const selClient = clients.find(x => x.id === clientId) ?? null;
      const ctx = mode === 'client'
        ? { state: selClient?.state ?? null, clientId: selClient?.id ?? null }
        : { state: stateCode || null, clientId: null };
      const b = biz;
      const html = buildPriceSheetHtml({
        items,
        ctx,
        businessName: b.name ?? business.name,
        logoUrl: b.logo_url,
        businessLines: [
          [[b.city, b.state].filter(Boolean).join(', '), b.postal_code ?? ''].filter(Boolean).join(' '),
          b.address ?? '',
          b.phone ?? '',
          b.email ?? '',
        ],
        template: template ?? b.price_sheet_template,
        labels: {
          sheetTitle: t.sheetTitle,
          generatedOn: t.generatedOn,
          preparedFor: t.preparedFor,
          flatWord: t.flatWord,
          additionalCharges: t.additionalCharges,
          uncategorized: t.uncategorized,
        },
        stateLabel: ctx.state ? usStateName(ctx.state, locale) : t.allStatesLabel,
        preparedFor: mode === 'client' && selClient ? clientName(selClient) : null,
        todayStr: formatDateLong(new Date(), locale),
      });
      const { uri } = await Print.printToFileAsync({ html });
      setGenOpen(false);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: t.sheetTitle });
      }
    } catch { /* keep sheet open on failure */ }
    setBusy(false);
  };

  if (!business) return null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-2 flex-1 text-lg font-bold text-ink">{t.title}</Text>
        <Pressable onPress={() => setGenOpen(true)} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft" accessibilityLabel={t.generateTitle}>
          <Printer size={20} color={c.muted} />
        </Pressable>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-5 pb-44">
        <PriceSheetScreen
          supabase={supabase}
          businessId={business.id}
          canManage={can.manageBusinessSettings(currentRole)}
          sectionOrder={(business as { price_section_order?: string[] | null }).price_section_order ?? null}
          onSectionOrderChange={async (next) => {
            // Written straight to the business row, then refetched so the
            // invoice "view prices" sheet — which reads the same column via
            // AppContext — picks the new order up without a reload.
            await supabase.from('businesses').update({ price_section_order: next }).eq('id', business.id);
            await refetchBusiness();
          }}
        />
      </ScrollView>

      {/* Generate sheet — pick client/state, render PDF, OS share sheet. */}
      <RNModal visible={genOpen} transparent animationType="fade" onRequestClose={() => setGenOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <View className="flex-1 justify-end">
            {/* Inline style, not `absolute inset-0 bg-black/50`: the class-based
                form was not producing a dim at all, leaving the sheet floating
                over a fully-lit screen. Every other sheet in the app uses this
                inline shape for the same reason. */}
            <Pressable
              onPress={() => setGenOpen(false)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
            />
            <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10" style={{ maxHeight: '88%' }}>
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-ink">{t.generateTitle}</Text>
                <Pressable onPress={() => setGenOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                  <X size={22} color={c.faint} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row gap-2 mb-4">
                {(['client', 'state'] as const).map(m => (
                  <Pressable key={m} onPress={() => setMode(m)}
                    className={`px-3.5 py-2 rounded-full border ${mode === m ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                    <Text className={`text-sm font-medium ${mode === m ? 'text-white' : 'text-ink'}`}>
                      {m === 'client' ? t.forClient : t.forState}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {mode === 'client' ? (
                clients.length === 0 ? (
                  <View className="py-3 items-center"><ActivityIndicator color={c.primary} /></View>
                ) : (
                  <Select value={clientId} onValueChange={setClientId}
                    placeholder={t.searchClientPlaceholder} options={clientOptions} searchable />
                )
              ) : (
                <Select value={stateCode} onValueChange={setStateCode}
                  placeholder={t.allStatesLabel}
                  options={[{ value: '', label: t.allStatesLabel }, ...stateOptions]} searchable />
              )}
              {/* Customize — same businesses.price_sheet_template the web
                  generator edits (design/accent/section order). */}
              <Pressable
                onPress={() => (customizeOpen ? setCustomizeOpen(false) : openCustomize())}
                className="mt-4 flex-row items-center justify-between bg-surface rounded-xl px-3.5 py-3 active:opacity-80"
              >
                <View className="flex-row items-center gap-2">
                  <Sliders size={16} color={c.muted} />
                  <Text className="text-sm font-medium text-ink">{t.customizeBtn}</Text>
                </View>
                {customizeOpen ? <ChevronUp size={16} color={c.faint} /> : <ChevronDown size={16} color={c.faint} />}
              </Pressable>
              {customizeOpen ? (
                <View className="mt-3 gap-4">
                  <View>
                    <Text className="text-sm font-semibold text-ink mb-2">{t.designLabel}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {PRICE_SHEET_DESIGNS.map(d => (
                        <Pressable key={d} onPress={() => setDraftDesign(d)}
                          className={`px-3 py-1.5 rounded-full border ${draftDesign === d ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                          <Text className={`text-xs font-medium ${draftDesign === d ? 'text-white' : 'text-ink'}`}>
                            {d === 'classic' ? t.designClassic : d === 'cards' ? t.designCards : d === 'bold' ? t.designBold : d === 'elegant' ? t.designElegant : t.designMinimal}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View>
                    <Text className="text-sm font-semibold text-ink mb-2">{t.accentColorLabel}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {ACCENT_SWATCHES.map(hex => (
                        <Pressable key={hex} onPress={() => setDraftAccent(hex)}
                          style={{ backgroundColor: hex, width: 34, height: 34, borderRadius: 17, borderWidth: draftAccent.toUpperCase() === hex ? 3 : 0, borderColor: c.ink }}
                        />
                      ))}
                    </View>
                  </View>
                  {draftOrder.length > 0 ? (
                    <View>
                      <Text className="text-sm font-semibold text-ink mb-1">{t.sectionOrderLabel}</Text>
                      <Text className="text-xs text-faint mb-2">{t.sectionOrderHint}</Text>
                      <View className="rounded-xl border border-border-soft overflow-hidden">
                        <Sortable.Grid
                          data={draftOrder}
                          columns={1}
                          rowGap={0}
                          keyExtractor={(cat: string) => cat}
                          dragActivationDelay={180}
                          onDragEnd={({ data }: { data: string[] }) => setDraftOrder(data)}
                          renderItem={({ item: cat }: { item: string }) => {
                            const hidden = draftHiddenCats.includes(cat);
                            const rows = sectionItems.get(cat) ?? [];
                            const open = expandedCat === cat;
                            return (
                              <View className="border-b border-border-soft bg-card">
                                <View className={`flex-row items-center gap-2 px-3 py-2.5 ${hidden ? 'opacity-45' : ''}`}>
                                  <GripVertical size={15} color={c.faint} />
                                  {/* Expanding is what reveals per-price control,
                                      so the row is the toggle, not a lone caret. */}
                                  <Pressable
                                    onPress={() => setExpandedCat(open ? null : cat)}
                                    className="flex-row items-center gap-1.5 flex-1"
                                  >
                                    <ChevronDown size={14} color={c.faint} style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }} />
                                    <Text className={`text-sm flex-1 ${hidden ? 'text-muted line-through' : 'text-ink'}`} numberOfLines={1}>
                                      {cat === ADDONS ? t.additionalCharges : cat}
                                    </Text>
                                    <Text className="text-[11px] text-faint">{rows.length}</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => toggleCatHidden(cat)}
                                    hitSlop={8}
                                    accessibilityLabel={hidden ? t.includeSection : t.excludeSection}
                                    className="p-1 active:opacity-60"
                                  >
                                    {hidden ? <EyeOff size={16} color={c.faint} /> : <Eye size={16} color={c.muted} />}
                                  </Pressable>
                                </View>
                                {open ? (
                                  <View className="pl-9 pr-3 pb-2">
                                    {rows.map(it => {
                                      // A hidden section takes its prices with
                                      // it, so the per-price control reads as off
                                      // and does nothing until the section is on.
                                      const itemHidden = hidden || draftHiddenItems.includes(it.id);
                                      return (
                                        <View key={it.id} className={`flex-row items-center gap-2 py-1 ${itemHidden ? 'opacity-45' : ''}`}>
                                          <Text className={`text-xs flex-1 ${itemHidden ? 'text-muted line-through' : 'text-ink'}`} numberOfLines={1}>{it.name}</Text>
                                          <Pressable
                                            onPress={() => { if (!hidden) toggleItemHidden(it.id); }}
                                            hitSlop={8}
                                            className={`p-1 ${hidden ? 'opacity-40' : 'active:opacity-60'}`}
                                          >
                                            {itemHidden ? <EyeOff size={14} color={c.faint} /> : <Eye size={14} color={c.muted} />}
                                          </Pressable>
                                        </View>
                                      );
                                    })}
                                    {rows.length === 0 ? <Text className="text-xs text-faint py-1">{t.sectionEmpty}</Text> : null}
                                  </View>
                                ) : null}
                              </View>
                            );
                          }}
                        />
                      </View>
                    </View>
                  ) : null}
                  <Pressable onPress={saveCustomize} disabled={savingTpl}
                    className="py-3 rounded-2xl bg-border-soft items-center active:opacity-80 disabled:opacity-50">
                    {savingTpl ? <ActivityIndicator color={c.primary} /> : (
                      <Text className="text-sm font-semibold text-ink">{t.saveBtn}</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <Pressable onPress={generate} disabled={busy}
                className="mt-4 py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Printer size={16} color="#fff" />
                    <Text className="text-sm font-semibold text-white">{t.printBtn}</Text>
                  </View>
                )}
              </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </SafeAreaView>
  );
}
