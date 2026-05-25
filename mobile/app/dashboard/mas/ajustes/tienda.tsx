import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/lib/i18n/LangProvider';
import { AddonStoreScreen } from '@amixos/shared/screens/dashboard/AddonStoreScreen';
import { logAudit } from '@amixos/shared/lib/audit';

export default function TiendaPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings.store;

  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase
      .from('business_modules')
      .select('module_key, is_active')
      .eq('business_id', business.id)
      .eq('is_active', true);
    const ids = new Set(((data ?? []) as Array<{ module_key: string }>).map(r => r.module_key));
    setEnabledIds(ids);
    setLoading(false);
  }, [business, supabase]);

  useEffect(() => { void load(); }, [load]);

  const onToggle = async (moduleId: string, enable: boolean) => {
    if (!business) return;
    await supabase
      .from('business_modules')
      .upsert(
        {
          business_id: business.id,
          module_key: moduleId,
          is_active: enable,
        },
        { onConflict: 'business_id,module_key' },
      );
    await logAudit(
      supabase,
      business.id,
      enable ? 'module.enabled' : 'module.disabled',
      'module',
      null,
      { module_key: moduleId },
    );
    await load();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-lg font-semibold text-gray-900">{t.heading}</Text>
      </View>
      <AddonStoreScreen
        enabledIds={enabledIds}
        currentRole={currentRole}
        loading={loading}
        onToggle={onToggle}
      />
    </SafeAreaView>
  );
}
