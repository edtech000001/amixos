import { useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useUnreadNotifications } from '@amixos/shared/lib/notifications';

/** Bell + unread badge for the home headers; opens the notifications screen. */
export function NotificationBell() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const { business, user } = useApp();
  const { t } = useLang();
  const c = useThemeColors();
  const { data: count, refresh } = useUnreadNotifications(supabase, business?.id ?? null, user?.id ?? null);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const label = count ? (count > 99 ? '99+' : String(count)) : '';

  return (
    <Pressable
      onPress={() => router.push('/dashboard/notificaciones?from=home' as never)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label ? `${t.notifications.title} (${label})` : t.notifications.title}
      className="w-11 h-11 rounded-xl bg-card border border-border items-center justify-center active:bg-surface"
    >
      <Bell size={20} color={c.ink} />
      {label ? (
        <View
          className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 items-center justify-center"
        >
          <Text className="text-white text-[11px] font-bold tabular-nums">{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
