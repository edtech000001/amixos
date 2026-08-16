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
import { useRouter } from 'expo-router';
import { ChevronLeft, Printer, X } from 'lucide-react-native';
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
import { rowToPriceSheetItem, type PriceSheetRow } from '@amixos/shared/lib/priceSheet';
import { buildPriceSheetHtml } from '@amixos/shared/lib/priceSheetHtml';

interface ClientLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  state: string | null;
}

export default function FacturasPreciosPage() {
  const router = useRouter();
  const { t: full, locale } = useLang();
  const { business, currentRole } = useApp();
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

  useEffect(() => {
    if (!business || !genOpen || clients.length) return;
    void fetchAllById<ClientLite>((afterId, pageSize) => {
      let q = supabase.from('clients').select('id, first_name, last_name, company, state')
        .eq('business_id', business.id).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }).then(rows => setClients(rows)).catch(() => {});
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

  const generate = async () => {
    if (!business) return;
    setBusy(true);
    try {
      const [{ data: itemRows }, { data: biz }] = await Promise.all([
        supabase.from('price_sheet_items')
          .select('id, name, category, pricing_mode, unit_label, rate, state_rates, client_rates, match_terms, is_addon, addon_inline, sort_order, active')
          .eq('business_id', business.id).eq('active', true).order('sort_order').order('name'),
        supabase.from('businesses')
          .select('name, logo_url, address, city, state, postal_code, phone, email, price_sheet_template')
          .eq('id', business.id).single(),
      ]);
      const items = ((itemRows ?? []) as PriceSheetRow[]).map(rowToPriceSheetItem);
      const selClient = clients.find(x => x.id === clientId) ?? null;
      const ctx = mode === 'client'
        ? { state: selClient?.state ?? null, clientId: selClient?.id ?? null }
        : { state: stateCode || null, clientId: null };
      const b = (biz ?? {}) as { name?: string; logo_url?: string | null; address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; phone?: string | null; email?: string | null; price_sheet_template?: unknown };
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
        template: b.price_sheet_template,
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
        />
      </ScrollView>

      {/* Generate sheet — pick client/state, render PDF, OS share sheet. */}
      <RNModal visible={genOpen} transparent animationType="fade" onRequestClose={() => setGenOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <View className="flex-1 justify-end">
            <Pressable onPress={() => setGenOpen(false)} className="absolute inset-0 bg-black/50" />
            <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-ink">{t.generateTitle}</Text>
                <Pressable onPress={() => setGenOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                  <X size={22} color={c.faint} />
                </Pressable>
              </View>
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
              <Pressable onPress={generate} disabled={busy}
                className="mt-4 py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <View className="flex-row items-center gap-2">
                    <Printer size={16} color="#fff" />
                    <Text className="text-sm font-semibold text-white">{t.printBtn}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </SafeAreaView>
  );
}
