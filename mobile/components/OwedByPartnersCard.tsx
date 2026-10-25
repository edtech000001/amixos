import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Building2, ChevronRight } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { formatDateLong } from '@amixos/shared/lib/format';

interface OwedRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  partner_business_name: string;
  partner_invoice_number: string;
  client_paid_at: string;
}

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Dashboard card: this business's unpaid invoices whose CLIENT already paid
 * the other company they were billed through (migration 250) — the
 * "hey, you still owe us our share" list. Renders nothing when empty, or on a
 * database without migration 250 (the RPC just errors → hidden).
 */
export function OwedByPartnersCard() {
  const router = useRouter();
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices.billThrough;
  const [rows, setRows] = useState<OwedRow[]>([]);

  const load = useCallback(() => {
    if (!business?.id) return;
    void createSupabaseClient()
      .rpc('invoices_collect_from_partners', { p_business_id: business.id })
      .then(({ data, error }: { data: OwedRow[] | null; error: unknown }) => setRows(error ? [] : (data ?? [])));
  }, [business?.id]);
  useEffect(() => { setRows([]); load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  return (
    <View className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <View className="flex-row items-center gap-2">
        <Building2 size={16} color="#B45309" />
        <Text className="flex-1 text-sm font-bold text-amber-800">{t.owedTitle}</Text>
        <Text className="text-sm font-bold text-amber-800">{money(total)}</Text>
      </View>
      <Text className="text-xs text-amber-700 mt-1">{t.owedHint}</Text>
      <View className="mt-2">
        {rows.map(r => (
          <Pressable
            key={`${r.id}-${r.partner_invoice_number}`}
            onPress={() => router.push(`/dashboard/facturas/${r.id}` as never)}
            className="flex-row items-center gap-2 py-2 border-t border-amber-500/20 active:opacity-60"
          >
            <Text className="flex-1 text-xs text-amber-900" numberOfLines={2}>
              {t.owedLine
                .replace('{{invoice}}', r.invoice_number)
                .replace('{{company}}', r.partner_business_name)
                .replace('{{date}}', formatDateLong(r.client_paid_at, locale === 'es' ? 'es-MX' : 'en-US'))}
            </Text>
            <Text className="text-xs font-semibold text-amber-900">{money(r.total_amount)}</Text>
            <ChevronRight size={14} color="#B45309" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
