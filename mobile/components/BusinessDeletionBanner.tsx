// Warns every member of a business that it is scheduled for deletion
// (migrations 230/232). Mirrors web/src/components/BusinessDeletionBanner.tsx.
//
// Without this, only the owner — who sees the scheduled line in their own
// Danger zone — knows. Everyone else keeps working normally right up to the
// day the business and its data disappear.

import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { formatDateLong } from '@amixos/shared/lib/format';

export function BusinessDeletionBanner() {
  const { business } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';
  const [purgeAfter, setPurgeAfter] = useState<string | null>(null);

  useEffect(() => {
    if (!business?.id) { setPurgeAfter(null); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await createSupabaseClient()
        .from('business_deletions')
        .select('purge_after')
        .eq('business_id', business.id)
        .maybeSingle();
      // Table missing (230 not run) → null → no banner. Never invent a
      // deletion warning out of an error.
      if (!cancelled) setPurgeAfter((data as { purge_after?: string } | null)?.purge_after ?? null);
    })();
    return () => { cancelled = true; };
  }, [business?.id]);

  if (!purgeAfter) return null;

  return (
    <View className="flex-row items-center gap-2.5 px-4 py-2.5 border-b border-red-500/30 bg-red-500/10">
      <AlertTriangle size={15} color="#dc2626" />
      <Text className="flex-1 text-xs font-medium text-ink">
        {t.pendingBusinessBanner.replace('{{date}}', formatDateLong(purgeAfter, dateLoc))}
      </Text>
    </View>
  );
}
