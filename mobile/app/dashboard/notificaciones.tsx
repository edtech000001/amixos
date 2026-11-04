import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, CheckCheck, ChevronLeft } from 'lucide-react-native';
import { SkeletonRow } from '@amixos/shared/ui/Skeleton';
import { Toggle } from '@amixos/shared/ui/Toggle';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import {
  NOTIFICATIONS_PAGE, NOTIFICATION_CATEGORIES, fetchNotifications, loadNotificationPrefs,
  markAllNotificationsRead, markNotificationRead, notificationAge, notificationHref,
  saveNotificationPrefs, unreadNotificationsChanged,
  type NotificationCategory, type NotificationPrefs, type NotificationRow,
} from '@amixos/shared/lib/notifications';

export default function NotificacionesScreen() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const { business, user } = useApp();
  const { t: full } = useLang();
  const t = full.notifications;
  const c = useThemeColors();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);
  // Opened from Ajustes → straight to the preference switches.
  const { prefs: prefsParam } = useLocalSearchParams<{ prefs?: string }>();
  const [showPrefs, setShowPrefs] = useState(prefsParam === '1');
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState('');

  const load = useCallback(async (p: number) => {
    if (!business) return;
    setLoading(true);
    try {
      const next = await fetchNotifications(supabase, business.id, p);
      setRows(prev => (p === 0 ? next : [...prev, ...next]));
      setReachedEnd(next.length < NOTIFICATIONS_PAGE);
      setPage(p);
    } catch {
      setReachedEnd(true);
    } finally {
      setLoading(false);
    }
  }, [business, supabase]);

  useEffect(() => { void load(0); }, [load]);
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
      {NOTIFICATION_CATEGORIES.map((cat, i) => (
        <View key={cat} className={`py-3 ${i < NOTIFICATION_CATEGORIES.length - 1 ? 'border-b border-border-soft' : ''}`}>
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
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-ink ml-1">{t.title}</Text>
        <Pressable
          onPress={() => setShowPrefs(v => !v)}
          hitSlop={8}
          className="px-3 py-2 rounded-lg active:bg-border-soft"
        >
          <Text className="text-sm font-semibold text-primary">{showPrefs ? full.common.buttons.close : t.prefsTitle}</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={n => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        ListHeaderComponent={
          <>
            {showPrefs ? prefsCard : null}
            {hasUnread ? (
              <Pressable onPress={readAll} className="flex-row items-center gap-1.5 self-end mb-3 px-1 py-1">
                <CheckCheck size={16} color={c.primary} />
                <Text className="text-sm font-semibold text-primary">{t.markAllRead}</Text>
              </Pressable>
            ) : null}
          </>
        }
        renderItem={({ item: n, index }) => (
          <Pressable
            onPress={() => open(n)}
            className={`flex-row items-start gap-3 px-4 py-4 bg-card border-x border-border-soft ${
              index === 0 ? 'rounded-t-2xl border-t' : ''
            } ${index === rows.length - 1 ? 'rounded-b-2xl border-b' : 'border-b'} active:bg-surface`}
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
          loading ? (
            <View className="gap-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</View>
          ) : (
            <View className="items-center py-16 px-6">
              <Bell size={36} color={c.faint} />
              <Text className="text-sm font-semibold text-ink mt-3">{t.empty}</Text>
              <Text className="text-sm text-muted mt-1 text-center">{t.emptyHint}</Text>
            </View>
          )
        }
        ListFooterComponent={
          !reachedEnd && rows.length > 0 ? (
            <Pressable disabled={loading} onPress={() => load(page + 1)} className="items-center py-4">
              <Text className="text-sm font-semibold text-primary">{t.loadMore}</Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
