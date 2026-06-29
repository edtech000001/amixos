// Persistent bar shown while "Ver como" (login-as-member) is active on mobile.
// Mirrors web/src/components/dashboard/ImpersonationBanner.tsx. Mounted in the
// dashboard layout's top overlay so it survives navigation.

import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, X } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { ROLE_LABELS } from '@amixos/shared/lib/permissions';

export function ImpersonationBanner() {
  const { impersonating, stopImpersonation } = useApp();
  const { locale } = useLang();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  if (!impersonating) return null;

  const who = impersonating.name || impersonating.email || '—';
  const roleLabel = ROLE_LABELS[impersonating.role]?.[locale] ?? impersonating.role;
  const label = locale === 'en' ? 'Viewing as' : 'Viendo como';
  const exit = locale === 'en' ? 'Exit' : 'Salir';

  const onExit = async () => {
    setExiting(true);
    try {
      await stopImpersonation();
      // Land back on the team list, not wherever the member was viewing.
      router.replace('/dashboard/mas/empleados');
    } finally {
      setExiting(false);
    }
  };

  return (
    <View className="flex-row items-center gap-2 bg-amber-500 px-4 py-2.5">
      <Eye size={16} color="#fff" />
      <Text className="flex-1 text-sm font-semibold text-white" numberOfLines={1}>
        {label} <Text className="font-bold">{who}</Text>
        <Text className="font-normal opacity-90"> · {roleLabel}</Text>
      </Text>
      <Pressable
        onPress={onExit}
        disabled={exiting}
        className="flex-row items-center gap-1 rounded-lg bg-white/20 px-3 py-1"
      >
        {exiting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <X size={14} color="#fff" />
            <Text className="text-sm font-semibold text-white">{exit}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
