import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Activity, ChevronLeft, Search } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { AUDIT_ACTION_LABEL, type AuditAction } from '@amixos/shared/lib/audit';
import { formatDateTimeLong } from '@amixos/shared/lib/format';

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// Load a generous recent window up front (~a month+ for most businesses) so
// client-side search has a meaningful set to filter; "load more" pulls older.
const PAGE_SIZE = 200;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function ActividadPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.activity;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (before?: string) => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.rpc('list_audit_log', {
      b_id: business.id,
      page_size: PAGE_SIZE,
      before: before ?? null,
    });
    const next = (data as AuditRow[] | null) ?? [];
    setRows(prev => before ? [...prev, ...next] : next);
    setReachedEnd(next.length < PAGE_SIZE);
    setLoading(false);
  }, [business, supabase]);

  useEffect(() => { void load(); }, [load]);

  const relTime = (iso: string): string => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return t.timeJustNow;
    if (diff < 3600) return t.timeMinutesAgo.replace('{{n}}', String(Math.floor(diff / 60)));
    if (diff < 86400) return t.timeHoursAgo.replace('{{n}}', String(Math.floor(diff / 3600)));
    if (diff < 86400 * 14) return t.timeDaysAgo.replace('{{n}}', String(Math.floor(diff / 86400)));
    return formatDateTimeLong(iso, locale);
  };

  const describe = (row: AuditRow): string => {
    const label = AUDIT_ACTION_LABEL[row.action as AuditAction]?.[lang] ?? row.action;
    const d = row.details ?? {};
    const bits: string[] = [];
    if (d.from && d.to) bits.push(`${d.from} → ${d.to}`);
    if (d.email) bits.push(String(d.email));
    if (d.target_business_name) bits.push(String(d.target_business_name));
    return bits.length ? `${label} — ${bits.join(' · ')}` : label;
  };

  // Client-side search over the loaded window — matches the rendered text.
  const q = norm(search.trim());
  const filtered = q
    ? rows.filter(r =>
        norm(`${describe(r)} ${r.user_email ?? ''} ${r.action} ${JSON.stringify(r.details ?? {})}`).includes(q),
      )
    : rows;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-gray-900">{t.heading}</Text>
      </View>
      {/* Pinned header + search — stay fixed while the list scrolls below. */}
      <View className="px-5 pt-5">
        <View className="flex-row items-start gap-3 mb-4">
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <Activity size={18} color="#4F46E5" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900">{t.heading}</Text>
            <Text className="text-xs text-gray-500 mt-0.5">{t.subtitle}</Text>
          </View>
        </View>

        {rows.length > 0 ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
            <Search size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.searchPlaceholder}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-sm text-gray-900"
            />
          </View>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pt-4 pb-32" keyboardShouldPersistTaps="handled">
        {loading && rows.length === 0 ? (
          <View className="py-10 items-center">
            <View className="flex-row gap-1">{[0,1,2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}</View>
          </View>
        ) : rows.length === 0 ? (
          <Text className="py-10 text-center text-sm text-gray-400">{t.emptyState}</Text>
        ) : filtered.length === 0 ? (
          <Text className="py-10 text-center text-sm text-gray-400">{t.noResults}</Text>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {filtered.map((row, i) => (
              <View key={row.id} className={`flex-row items-start gap-3 px-4 py-3 ${i < filtered.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <View className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center">
                  <Text className="text-xs font-bold text-gray-500">
                    {(row.user_email ?? '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm text-gray-900">{describe(row)}</Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {row.user_email ?? t.unknownUser} · {relTime(row.created_at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {!reachedEnd && rows.length > 0 && !q && (
          <Pressable
            onPress={() => load(rows[rows.length - 1]?.created_at)}
            disabled={loading}
            className="mt-4 self-center px-4 py-2 rounded-xl active:bg-gray-100"
          >
            <Text className="text-sm font-semibold text-primary">{loading ? '...' : t.loadMore}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
