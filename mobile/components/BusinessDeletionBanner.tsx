// Warns every member of a business that it is scheduled for deletion
// (migrations 230/232). Mirrors web/src/components/BusinessDeletionBanner.tsx.
//
// Without this, only the owner — who sees the scheduled line in their own
// Danger zone — knows. Everyone else keeps working normally right up to the
// day the business and its data disappear.
//
// Owners also get "Cancel deletion" here. That is not a shortcut: it is the
// ONLY caller of restoreBusiness in either app. Before this, a scheduled
// business deletion could be seen but never undone from inside the product.
//
// Rendered in the top banner stack in dashboard/_layout.tsx. That stack is
// absolutely positioned and the screen below is pushed down by a measured
// offset, so the purge date is owned by the layout (useBusinessDeletionDate) —
// it has to know this banner is showing to include it in `bannerVisible`,
// otherwise the banner overlays the screen header.

import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { formatDateLong } from '@amixos/shared/lib/format';
import { restoreBusiness } from '@amixos/shared/lib/accountDeletion';

export function BusinessDeletionBanner({
  purgeAfter,
  onRestored,
}: {
  purgeAfter: string | null;
  onRestored?: () => void;
}) {
  const { business, currentRole } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.account.danger;
  const dateLoc = locale === 'en' ? 'en-US' : 'es-MX';
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!purgeAfter) return null;

  // Impersonation deliberately narrows this: an owner viewing as a member sees
  // what that member sees, with no owner-only action.
  const canRestore = currentRole === 'owner' && !!business?.id;

  const restore = async () => {
    if (!business?.id || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await restoreBusiness({ apiBaseUrl: getApiBaseUrl(), jwt: await getJwt() }, business.id);
      onRestored?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-center gap-2.5 px-4 py-2.5 border-b border-red-500/30 bg-red-500/10">
      <AlertTriangle size={15} color="#dc2626" />
      <Text className="flex-1 text-xs font-medium text-ink">
        {failed
          ? t.restoreBusinessFailed
          : t.pendingBusinessBanner.replace('{{date}}', formatDateLong(purgeAfter, dateLoc))}
      </Text>
      {canRestore ? (
        <Pressable onPress={restore} disabled={busy} hitSlop={8}>
          <Text
            className="text-xs font-semibold text-red-600 underline"
            style={busy ? { opacity: 0.5 } : undefined}
          >
            {t.restoreBusinessBtn}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
