// Full-screen gate shown while the signed-in account has a deletion scheduled
// (migration 230). Mirrors web/src/components/AccountDeletionGate.tsx.
//
// Signing in during the 30-day window is how the restore is offered — Apple
// permits a grace period provided it is disclosed, and this screen is that
// disclosure. Mounted unconditionally above the Tabs like BillingGate; it
// self-hides when there is no pending row.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useAuthStore } from '@/lib/auth/store';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { formatDateLong } from '@amixos/shared/lib/format';
import { restoreAccount, daysUntilPurge } from '@amixos/shared/lib/accountDeletion';

export function AccountDeletionGate() {
  const { locale } = useLang();
  const { t: full } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const [purgeAfter, setPurgeAfter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setPurgeAfter(null); return; }
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseClient();
      const { data } = await supabase
        .from('account_deletions')
        .select('purge_after')
        .eq('user_id', user.id)
        .maybeSingle();
      // Table missing (migration 230 not run) → null → gate stays hidden. That
      // is the right failure direction: never lock anyone out of their app.
      if (!cancelled) setPurgeAfter((data as { purge_after?: string } | null)?.purge_after ?? null);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!purgeAfter) return null;

  const restore = async () => {
    setBusy(true);
    try {
      await restoreAccount({ apiBaseUrl: getApiBaseUrl(), jwt: await getJwt() });
      setPurgeAfter(null);
    } catch {
      setBusy(false);
    }
  };

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, elevation: 10000 }}
      className="bg-surface items-center justify-center"
    >
      <View className="bg-card rounded-2xl border border-border-soft p-6 m-4 w-full max-w-md items-center">
        <View className="w-14 h-14 rounded-2xl bg-red-500/10 items-center justify-center mb-4">
          <AlertTriangle size={26} color="#dc2626" />
        </View>
        <Text className="text-xl font-bold text-ink text-center">{t.pendingTitle}</Text>
        <Text className="text-sm text-muted text-center mt-2">
          {t.pendingBody
            .replace('{{date}}', formatDateLong(purgeAfter, dateLoc))
            .replace('{{days}}', String(daysUntilPurge(purgeAfter)))}
        </Text>

        <Pressable
          onPress={() => void restore()}
          disabled={busy}
          className={`mt-6 w-full py-3 rounded-2xl items-center flex-row justify-center gap-2 ${busy ? 'bg-primary/50' : 'bg-primary active:opacity-90'}`}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text className="text-base font-semibold text-white">{t.restoreBtn}</Text>
        </Pressable>
        <Text className="text-xs text-faint text-center mt-2">{t.restoreNote}</Text>

        <Pressable onPress={() => void logout()} className="mt-6 py-2" hitSlop={8}>
          <Text className="text-sm font-medium text-muted">{t.signOutBtn}</Text>
        </Pressable>
      </View>
    </View>
  );
}
