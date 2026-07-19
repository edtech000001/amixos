import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Activity, ChevronLeft, Search } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { AUDIT_ACTION_LABEL, type AuditAction } from '@amixos/shared/lib/audit';
import { getModuleById } from '@amixos/shared/modules/registry';
import { formatDateTimeLong } from '@amixos/shared/lib/format';
import { useThemeColors } from '@/lib/ThemeProvider';

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// Who performed the action: "Full Name · email" when a display name is set,
// otherwise just the email (and the unknown-user fallback for old rows).
function actorLine(row: AuditRow, unknownUser: string): string {
  const name = row.user_name?.trim();
  if (name && row.user_email) return `${name} · ${row.user_email}`;
  return name || row.user_email || unknownUser;
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
  const c = useThemeColors();

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
    // module.enabled/disabled stores module_key — show the human module name.
    if (d.module_key) {
      const def = getModuleById(String(d.module_key));
      const entry = def
        ? (full.dashboard.modules.list as unknown as Record<string, { name: string } | undefined>)[def.i18nKey]
        : undefined;
      bits.push(entry?.name ?? String(d.module_key));
    }
    if (d.from && d.to) bits.push(`${d.from} → ${d.to}`);
    if (d.title) bits.push(String(d.title));
    if (d.job_title) bits.push(String(d.job_title));
    if (d.estimate_number) bits.push(String(d.estimate_number));
    if (d.name) bits.push(String(d.name));
    if (d.invoice_number) bits.push(String(d.invoice_number));
    if (typeof d.count === 'number') bits.push(`${d.count}`);
    if (d.email) bits.push(String(d.email));
  // Imports + payroll events (137/audit additions).
  if (d.file) bits.push(String(d.file));
  if (typeof d.amount === 'number') bits.push(`$${Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  if (typeof d.success === 'number') bits.push(`${d.success} ✓`);
  if (typeof d.failed === 'number' && d.failed > 0) bits.push(`${d.failed} ✗`);
    if (d.target_business_name) bits.push(String(d.target_business_name));
    return bits.length ? `${label} — ${bits.join(' · ')}` : label;
  };

  // Client-side search over the loaded window — matches the rendered text.
  const q = norm(search.trim());
  const filtered = q
    ? rows.filter(r =>
        norm(`${describe(r)} ${r.user_name ?? ''} ${r.user_email ?? ''} ${r.action} ${JSON.stringify(r.details ?? {})}`).includes(q),
      )
    : rows;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-ink">{t.heading}</Text>
      </View>
      {/* Pinned header + search — stay fixed while the list scrolls below. */}
      <View className="px-5 pt-5">
        <View className="flex-row items-start gap-3 mb-4">
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <Activity size={18} color={c.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-ink">{t.heading}</Text>
            <Text className="text-xs text-muted mt-0.5">{t.subtitle}</Text>
          </View>
        </View>

        {rows.length > 0 ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5">
            <Search size={16} color={c.faint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.searchPlaceholder}
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 text-sm text-ink"
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
          <Text className="py-10 text-center text-sm text-faint">{t.emptyState}</Text>
        ) : filtered.length === 0 ? (
          <Text className="py-10 text-center text-sm text-faint">{t.noResults}</Text>
        ) : (
          <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
            {filtered.map((row, i) => (
              <View key={row.id} className={`flex-row items-start gap-3 px-4 py-3 ${i < filtered.length - 1 ? 'border-b border-border-soft' : ''}`}>
                <View className="w-9 h-9 rounded-full bg-border-soft items-center justify-center">
                  <Text className="text-xs font-bold text-muted">
                    {(row.user_name || row.user_email || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm text-ink">{describe(row)}</Text>
                  <Text className="text-xs text-faint mt-0.5">
                    {actorLine(row, t.unknownUser)} · {relTime(row.created_at)}
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
            className="mt-4 self-center px-4 py-2 rounded-xl active:bg-border-soft"
          >
            <Text className="text-sm font-semibold text-primary">{loading ? '...' : t.loadMore}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
