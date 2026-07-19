// Facturas → Lista de precios (price sheet). Reached from the invoices header
// $ button. Its own stacked page with a back header + scroll.

import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { can } from '@amixos/shared/lib/permissions';
import { PriceSheetScreen } from '@amixos/shared/screens/dashboard/PriceSheetScreen';

export default function FacturasPreciosPage() {
  const router = useRouter();
  const { t: full } = useLang();
  const { business, currentRole } = useApp();
  const c = useThemeColors();
  const supabase = useMemo(() => createSupabaseClient(), []);

  if (!business) return null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={() => router.back()} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-2 text-lg font-bold text-ink">{full.dashboard.settings.priceSheet.title}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-5 pb-24">
        <PriceSheetScreen
          supabase={supabase}
          businessId={business.id}
          canManage={can.manageBusinessSettings(currentRole)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
