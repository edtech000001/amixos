// Facturas → Lista de precios (price sheet). Reached from the invoices header
// $ button. Its own stacked page with a back header + scroll.
//
// The header's printer button generates the client-facing price-sheet PDF
// (shared buildPriceSheetHtml → expo-print → OS share sheet) — the mobile
// counterpart of the web /precios/generar page: pick a client (uses their
// state + client prices) or a state, then share.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal as RNModal, ActivityIndicator, Platform, KeyboardAvoidingView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronUp, Printer, Sliders, X, GripVertical, Eye, EyeOff, Mail, Search } from 'lucide-react-native';
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
import { CLIENT_EMAIL_SELECT, clientOwnEmails } from '@amixos/shared/lib/clientRecipients';
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
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';

interface ClientLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  state: string | null;
  // Needed to email a sheet. clientOwnEmails() respects the per-address
  // "include in emails" flags from migration 231, so a client who opted an
  // address out of email never receives one there.
  email: string | null;
  email_office: string | null;
  email_home: string | null;
  email_office_included: boolean | null;
  email_home_included: boolean | null;
}

const UNCAT = '__uncategorized__';
const ADDONS = '__additional_charges__';

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
  const [biz, setBiz] = useState<{ name?: string; logo_url?: string | null; address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; phone?: string | null; email?: string | null; price_sheet_template?: unknown; invoice_template?: unknown } | null>(null);
  const [template, setTemplate] = useState<PriceSheetTemplateConfig | null>(null);
  // Customize (design + accent + section order) — persisted business-wide,
  // same businesses.price_sheet_template the web generator uses.
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftDesign, setDraftDesign] = useState<PriceSheetDesign>('classic');
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  // Exclusions, not inclusions: a category or price added later prints by
  // default. An inclusion list would silently drop everything new.
  const [draftHiddenCats, setDraftHiddenCats] = useState<string[]>([]);
  const [draftHiddenItems, setDraftHiddenItems] = useState<string[]>([]);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [emailPickOpen, setEmailPickOpen] = useState(false);
  const [emailPickQuery, setEmailPickQuery] = useState('');

  useEffect(() => {
    if (typeof clientParam === 'string' && clientParam) {
      setMode('client');
      setClientId(clientParam);
      setGenOpen(true);
      // CONSUME the param. It is a one-shot trigger, not state: closing the
      // sheet leaves ?client=abc in the route, so arriving again for the SAME
      // client is abc -> abc, this effect never re-runs, and the sheet refuses
      // to open with no way for the user to tell why. Clearing it makes the
      // next arrival undefined -> abc, which fires.
      router.setParams({ client: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientParam]);

  // Reopening the Generate sheet starts from the saved default again. Without
  // this, hiding a section for one customer silently carried into the next
  // sheet, with the panel collapsed so there was nothing to notice.
  useEffect(() => {
    if (!genOpen || !template) return;
    setDraftHiddenCats(template.hiddenCategories);
    setDraftHiddenItems(template.hiddenItemIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genOpen]);

  useEffect(() => {
    if (!business || !genOpen || clients.length) return;
    void fetchAllById<ClientLite>((afterId, pageSize) => {
      let q = supabase.from('clients').select(`id, first_name, last_name, company, state, ${CLIENT_EMAIL_SELECT}`)
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
          .select('name, logo_url, address, city, state, postal_code, phone, email, price_sheet_template, invoice_template')
          .eq('id', business.id).single(),
      ]);
      setItems(((itemRows ?? []) as PriceSheetRow[]).map(rowToPriceSheetItem));
      const bz = (bizRow ?? {}) as NonNullable<typeof biz>;
      setBiz(bz);
      const tpl0 = normalizePriceSheetTemplate(bz.price_sheet_template);
      setTemplate(tpl0);
      // Seed the exclusion drafts here too, NOT only in openCustomize. They
      // are what the sheet prints now, so they must be valid before Customize
      // has ever been expanded — an empty draft would read as "nothing
      // hidden" and quietly ignore the saved default.
      setDraftHiddenCats(tpl0.hiddenCategories);
      setDraftHiddenItems(tpl0.hiddenItemIds);
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
    setDraftOrder(sectionKeys);
    // Exclusions are deliberately NOT re-seeded here — they are live state
    // now, and resetting them on every reopen would discard the choice just
    // made for this sheet.
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


  // Is there anything to save? Mirrors web. `template` can be null here until
  // the business row loads, and nothing is dirty before there is a baseline to
  // compare against.
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every(x => b.includes(x));
  const templateDirty = !!template && (
    draftDesign !== template.design ||
    draftOrder.length !== template.categoryOrder.length ||
    draftOrder.some((k, i) => k !== template.categoryOrder[i]) ||
    !sameSet(draftHiddenCats, template.hiddenCategories) ||
    !sameSet(draftHiddenItems, template.hiddenItemIds)
  );

  /** First address this client actually accepts mail at, or null. */
  const clientEmail = (c: ClientLite | null) => clientOwnEmails(c)[0] ?? null;

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
      // Preserved as stored; the picker is gone and the invoice theme rules.
      accentColor: template.accentColor ?? '#4F46E5',
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

  /** Renders the sheet to a PDF and returns its file URI. Shared by Print and
   *  Email so the two can never drift into producing different documents. */
  const renderPdf = async (forClient: ClientLite | null): Promise<string | null> => {
    if (!business || !biz) return null;
    const ctx = forClient
      ? { state: forClient.state ?? null, clientId: forClient.id }
      : { state: stateCode || null, clientId: null };
    const b = biz;
    const html = buildPriceSheetHtml({
      items,
      ctx,
      businessName: b.name ?? business.name,
      logoUrl: b.logo_url,
      businessLines: [
        b.address ?? '',
        [[b.city, b.state].filter(Boolean).join(', '), b.postal_code ?? ''].filter(Boolean).join(' '),
        b.phone ?? '',
        b.email ?? '',
      ],
      // Exclusions come from the live drafts, not the saved template: the
      // eye toggles used to do nothing until Save, and Save then hid that
      // section for every client forever.
      template: {
        ...(template ?? normalizePriceSheetTemplate(b.price_sheet_template)),
        hiddenCategories: draftHiddenCats,
        hiddenItemIds: draftHiddenItems,
      },
      // Chrome — logo, font, accent, density — from the invoice theme, so a
      // client who has seen an invoice recognises this document.
      invoiceTemplate: b.invoice_template ?? null,
      labels: {
        sheetTitle: t.sheetTitle,
        generatedOn: t.generatedOn,
        preparedFor: t.preparedFor,
        flatWord: t.flatWord,
        additionalCharges: t.additionalCharges,
        uncategorized: t.uncategorized,
      },
      stateLabel: ctx.state ? usStateName(ctx.state, locale) : t.allStatesLabel,
      preparedFor: forClient ? clientName(forClient) : null,
      todayStr: formatDateLong(new Date(), locale),
    });
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
  };

  const generate = async () => {
    if (!business || !biz) return;
    setBusy(true);
    try {
      const selClient = mode === 'client' ? (clients.find(x => x.id === clientId) ?? null) : null;
      const uri = await renderPdf(selClient);
      if (!uri) return;
      setGenOpen(false);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: t.sheetTitle });
      }
    } catch { /* keep sheet open on failure */ }
    setBusy(false);
  };

  /** Emails the sheet to one client, PDF attached.
   *
   *  Addressed to the client the sheet was BUILT for — so the prices in the
   *  attachment and the recipient always agree. In state mode there is no such
   *  client, so the picker below asks for one and the sheet is re-rendered for
   *  them; emailing a Colorado sheet to a Kansas customer would be worse than
   *  refusing. */
  const emailTo = async (target: ClientLite) => {
    const to = clientEmail(target);
    if (!to || !business) return;
    setBusy(true);
    try {
      const uri = await renderPdf(target);
      const subject = t.emailSubject.replace('{{business}}', business.name ?? 'Amixos');
      const body = t.emailBody
        .replace('{{name}}', (target.first_name ?? '').trim() || clientName(target))
        .replace(/\{\{business\}\}/g, business.name ?? 'Amixos');

      // Lazily required, as in facturas/[id].tsx: a dev client without the
      // native module compiled in must fall back rather than crash on import.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let MailComposer: any = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        MailComposer = require('expo-mail-composer');
      } catch { MailComposer = null; }
      let available = false;
      if (MailComposer) {
        try { available = await MailComposer.isAvailableAsync(); } catch { available = false; }
      }

      setGenOpen(false);
      setEmailPickOpen(false);
      if (MailComposer && available) {
        await MailComposer.composeAsync({
          recipients: [to],
          subject,
          body,
          attachments: uri ? [uri] : [],
        });
        return;
      }
      // No composer: mailto cannot carry an attachment, so hand over the PDF
      // through the share sheet instead of sending an email with nothing in it.
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: t.sheetTitle });
      }
    } catch { /* swallow — the sheet stays usable */ }
    setBusy(false);
  };

  /** Clients that can actually receive this. Filtering here rather than
   *  showing everyone and failing on tap: an empty row you cannot select is a
   *  worse answer than not listing it. */
  const emailableClients = useMemo(
    () => clients.filter(c => !!clientEmail(c)),
    [clients],
  );

  const onEmailPress = () => {
    const sel = mode === 'client' ? (clients.find(x => x.id === clientId) ?? null) : null;
    if (sel && clientEmail(sel)) { void emailTo(sel); return; }
    // State mode, or a client with no address on file — ask who it goes to.
    setEmailPickQuery('');
    setEmailPickOpen(true);
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
            {/* SHEET_BACKDROP, not `absolute inset-0 bg-black/50`: the class-based
                form was not producing a dim at all on native. */}
            <Pressable
              onPress={() => setGenOpen(false)}
              style={SHEET_BACKDROP}
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
                  <Pressable key={m} onPress={() => {
                  // Switching to state mode carries the selected client's state
                  // across: picking a client already answered "which state",
                  // and re-picking it from a 50-item list is busywork. Only
                  // seeds when the field is still empty, so a state chosen by
                  // hand is never overwritten by toggling back and forth.
                    const sel = clients.find(x => x.id === clientId) ?? null;
                    if (m === 'state' && !stateCode && sel?.state) setStateCode(sel.state);
                    setMode(m);
                  }}
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
                  {/* The accent swatches used to live here — accent now comes
                      from the INVOICE theme so every document matches. */}
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
                  <Pressable onPress={saveCustomize} disabled={savingTpl || !templateDirty}
                    className={`py-3 rounded-2xl items-center ${templateDirty ? 'bg-primary active:opacity-80' : 'bg-border-soft'} disabled:opacity-50`}>
                    {savingTpl ? <ActivityIndicator color={c.white} /> : (
                      <Text className={`text-sm font-semibold ${templateDirty ? 'text-white' : 'text-faint'}`}>{t.saveBtn}</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {/* Email sits ABOVE Print: sending it is the usual intent, and
                  printing is what you do when email will not reach them. */}
              {/* Explicit muted styling rather than `disabled:opacity-50` —
                  that variant does not reliably reach a Pressable under
                  NativeWind, so a dead button looked tappable. */}
              <Pressable onPress={onEmailPress} disabled={busy || !emailableClients.length}
                className={`mt-4 py-3.5 rounded-2xl border items-center ${
                  emailableClients.length && !busy
                    ? 'border-border bg-card active:opacity-80'
                    : 'border-border-soft bg-card opacity-50'
                }`}>
                <View className="flex-row items-center gap-2">
                  <Mail size={16} color={emailableClients.length ? c.primary : c.faint} />
                  <Text className={`text-sm font-semibold ${emailableClients.length ? 'text-primary' : 'text-faint'}`}>
                    {t.emailBtn}
                  </Text>
                </View>
              </Pressable>

              <Pressable onPress={generate} disabled={busy}
                className="mt-2 py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Printer size={16} color="#fff" />
                    <Text className="text-sm font-semibold text-white">{t.printBtn}</Text>
                  </View>
                )}
              </Pressable>
              </ScrollView>

              {/* Who gets this sheet. An absolute overlay INSIDE this modal,
                  not a second RNModal: iOS silently refuses to present one
                  modal over another and the button just looks dead — the rule
                  in CLAUDE.md, and the reason the manual-payment worker picker
                  in PayrollScreen is built this way. Reached from state mode,
                  or a client with no usable address; in client mode the
                  recipient is already known. */}
              {emailPickOpen ? (
                <View
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  className="bg-card rounded-t-3xl px-5 pt-5 pb-10"
                >
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-lg font-bold text-ink">{t.emailPickTitle}</Text>
                    <Pressable onPress={() => setEmailPickOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                      <X size={20} color={c.muted} />
                    </Pressable>
                  </View>

                  <View className="flex-row items-center rounded-xl border border-border bg-surface px-3 mb-3">
                    <Search size={15} color={c.faint} />
                    <TextInput
                      value={emailPickQuery}
                      onChangeText={setEmailPickQuery}
                      placeholder={t.searchClientPlaceholder}
                      placeholderTextColor={c.faint}
                      className="flex-1 px-2 py-2.5 text-sm text-ink"
                    />
                  </View>

                  <ScrollView keyboardShouldPersistTaps="handled">
                    {(() => {
                      const q = emailPickQuery.trim().toLowerCase();
                      const list = q
                        ? emailableClients.filter(x =>
                            `${x.first_name ?? ''} ${x.last_name ?? ''}`.toLowerCase().includes(q) ||
                            (x.company ?? '').toLowerCase().includes(q))
                        : emailableClients;
                      if (!list.length) {
                        return <Text className="text-sm text-muted py-6 text-center">{t.noClientMatches}</Text>;
                      }
                      return list.map(x => (
                        <Pressable key={x.id} onPress={() => { void emailTo(x); }} disabled={busy}
                          className="py-3 border-b border-border-soft active:opacity-70">
                          <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                            {clientName(x)}{x.state ? ` (${x.state})` : ''}
                          </Text>
                          <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>{clientEmail(x)}</Text>
                        </Pressable>
                      ));
                    })()}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </SafeAreaView>
  );
}
