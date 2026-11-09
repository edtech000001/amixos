import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { useRefreshOnRefocus } from '@/lib/useRefreshOnRefocus';
import { usePullRefresh } from '@amixos/shared/ui/usePullRefresh';
import { BackHandler, Pressable, SectionList, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, CheckCheck, ChevronLeft, Settings, X } from 'lucide-react-native';
import { SkeletonRow } from '@amixos/shared/ui/Skeleton';
import { Toggle } from '@amixos/shared/ui/Toggle';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { haptics } from '@amixos/shared/lib/haptics';
import {
  visibleNotificationCategories, fetchNotifications, groupNotificationsByDay, loadNotificationPrefs,
  markAllNotificationsRead, markNotificationRead, markNotificationUnread, notificationAge, notificationHref,
  saveNotificationPrefs, unreadNotificationsChanged,
  type NotificationCategory, type NotificationPrefs, type NotificationRow,
} from '@amixos/shared/lib/notifications';

export default function NotificacionesScreen() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const { business, user } = useApp();
  // Inventory / Equipment switches only while that module is on.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const categories = useMemo(() => visibleNotificationCategories(enabledModules.map(m => m.id)), [enabledModules]);
  const { t: full } = useLang();
  const t = full.notifications;
  const c = useThemeColors();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // Opened from Ajustes → straight to the preference switches.
  const { prefs: prefsParam, from } = useLocalSearchParams<{ prefs?: string; from?: string }>();
  const [showPrefs, setShowPrefs] = useState(prefsParam === '1');

  // Explicit destination, not router.back(): this is its own tab, and tab
  // history still holds the job/invoice just viewed from here — back() landed
  // on it again. Ajustes → back to Ajustes; the bell (default) → Home.
  const goBack = useCallback(() => {
    router.navigate((from === 'ajustes' ? '/dashboard/mas/ajustes' : '/dashboard') as never);
  }, [from, router]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => sub.remove();
  }, [goBack]));
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState('');

  // The server caps the inbox at 200 per person per company (migration 274),
  // so one request is the whole list.
  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      setRows(await fetchNotifications(supabase, business.id));
    } catch {
      /* offline — keep what's on screen */
    } finally {
      setLoading(false);
    }
  }, [business, supabase]);

  useEffect(() => { void load(); }, [load]);
  const pull = usePullRefresh(() => { unreadNotificationsChanged(); return load(); });
  // This tab stays mounted — reopening it must show alerts that arrived since.
  useRefreshOnRefocus(() => load());
  useEffect(() => {
    if (!business || !user) return;
    loadNotificationPrefs(supabase, business.id, user.id).then(setPrefs).catch(() => setPrefs(null));
  }, [business, user, supabase]);

  const open = (n: NotificationRow) => {
    if (!n.read_at) {
      setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
      void markNotificationRead(supabase, n.id).then(unreadNotificationsChanged);
    }
    const href = notificationHref(n, 'native');
    if (href) router.push(href as never);
  };

  // Long-press: flip read ⇄ unread ("look at it later").
  const toggleRead = async (n: NotificationRow) => {
    const nextRead = n.read_at ? null : new Date().toISOString();
    haptics.select();
    setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: nextRead } : r)));
    try {
      if (nextRead) await markNotificationRead(supabase, n.id);
      else await markNotificationUnread(supabase, n.id);
    } catch {
      setRows(prev => prev.map(r => (r.id === n.id ? { ...r, read_at: n.read_at } : r)));
    }
    unreadNotificationsChanged();
  };

  const readAll = async () => {
    if (!business) return;
    const now = new Date().toISOString();
    setRows(prev => prev.map(r => (r.read_at ? r : { ...r, read_at: now })));
    try { await markAllNotificationsRead(supabase, business.id); } catch { /* badge recount below shows truth */ }
    unreadNotificationsChanged();
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    if (!business || !user || !prefs) return;
    const prev = prefs;
    setPrefs(next);
    setPrefsError('');
    try { await saveNotificationPrefs(supabase, business.id, user.id, next); }
    catch { setPrefs(prev); setPrefsError(t.saveError); }
  };
  const toggleCategory = (cat: NotificationCategory, on: boolean) => {
    if (!prefs) return;
    const muted = prefs.muted_categories.filter(x => x !== cat);
    void updatePrefs({ ...prefs, muted_categories: on ? muted : [...muted, cat] });
  };

  const hasUnread = rows.some(r => !r.read_at);

  const prefsCard = prefs ? (
    <View className="bg-card rounded-2xl border border-border-soft px-4 mb-4">
      <View className="py-3 border-b border-border-soft">
        <Text className="text-base font-bold text-ink">{t.prefsTitle}</Text>
        <Text className="text-xs text-muted mt-0.5">{t.prefsHint}</Text>
      </View>
      <View className="py-3 border-b border-border-soft">
        <Toggle label={t.pushLabel} hint={t.pushHint} value={prefs.push_enabled}
          onValueChange={v => updatePrefs({ ...prefs, push_enabled: v })} />
      </View>
      {categories.map((cat, i) => (
        <View key={cat} className={`py-3 ${i < categories.length - 1 ? 'border-b border-border-soft' : ''}`}>
          <Toggle
            label={t.categories[cat]}
            hint={cat === 'account' ? t.accountAlwaysOn : t.categoryHints[cat]}
            value={cat === 'account' || !prefs.muted_categories.includes(cat)}
            disabled={cat === 'account'}
            onValueChange={v => toggleCategory(cat, v)}
          />
        </View>
      ))}
      {prefsError ? <Text className="text-sm text-red-600 pb-3">{prefsError}</Text> : null}
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={goBack} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-ink ml-1">{t.title}</Text>
        {/* Gear → the on/off switches (same as web's bell gear); ✕ closes them. */}
        <Pressable
          onPress={() => setShowPrefs(v => !v)}
          hitSlop={10}
          accessibilityLabel={showPrefs ? full.common.buttons.close : t.prefsTitle}
          className="p-2 -mr-2 rounded-lg active:bg-border-soft"
        >
          {showPrefs ? <X size={20} color={c.ink} /> : <Settings size={20} color={c.ink} />}
        </Pressable>
      </View>

      <SectionList
        sections={groupNotificationsByDay(filter === 'unread' ? rows.filter(r => !r.read_at) : rows)
          .map(g => ({ key: g.key, data: g.rows }))}
        refreshControl={pull.control}
        keyExtractor={n => n.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint mt-4 mb-2 px-1">
            {t.groups[section.key as keyof typeof t.groups]}
          </Text>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        ListHeaderComponent={
          <>
            {showPrefs ? prefsCard : null}
            {rows.length > 0 ? (
              <View className="flex-row items-center justify-between">
                <View className="flex-row gap-2">
                  {(['all', 'unread'] as const).map(f => (
                    <Pressable key={f} onPress={() => setFilter(f)}
                      className="px-3.5 py-1.5 rounded-full border"
                      style={filter === f
                        ? { backgroundColor: c.primary, borderColor: c.primary }
                        : { backgroundColor: c.card, borderColor: c.border }}>
                      <Text className="text-sm font-semibold" style={{ color: filter === f ? '#FFFFFF' : c.muted }}>
                        {f === 'all' ? t.filterAll : t.filterUnread}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {hasUnread ? (
                  <Pressable onPress={readAll} hitSlop={8} className="flex-row items-center gap-1.5 px-1 py-1">
                    <CheckCheck size={16} color={c.primary} />
                    <Text className="text-sm font-semibold text-primary">{t.markAllRead}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        }
        renderItem={({ item: n, index, section }) => (
          <Pressable
            onPress={() => open(n)}
            onLongPress={() => toggleRead(n)}
            accessibilityHint={t.longPressHint}
            className={`flex-row items-start gap-3 px-4 py-4 bg-card border-x border-border-soft ${
              index === 0 ? 'rounded-t-2xl border-t' : ''
            } ${index === section.data.length - 1 ? 'rounded-b-2xl border-b' : 'border-b'} active:bg-surface`}
          >
            <View
              className="mt-1.5 w-2 h-2 rounded-full"
              style={{ backgroundColor: n.read_at ? 'transparent' : c.primary }}
            />
            <View className="flex-1">
              <Text className="text-sm text-ink" style={{ fontWeight: n.read_at ? '400' : '700' }}>{n.title}</Text>
              {n.body ? <Text className="text-sm text-muted mt-0.5">{n.body}</Text> : null}
            </View>
            <Text className="text-xs text-faint mt-0.5">{notificationAge(n.created_at, t)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          rows.length > 0 ? (
            <Text className="text-sm text-muted text-center py-12 px-6">{t.emptyUnread}</Text>
          ) : loading ? (
            <View className="gap-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</View>
          ) : (
            <View className="items-center py-16 px-6">
              <Bell size={36} color={c.faint} />
              <Text className="text-sm font-semibold text-ink mt-3">{t.empty}</Text>
              <Text className="text-sm text-muted mt-1 text-center">{t.emptyHint}</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
