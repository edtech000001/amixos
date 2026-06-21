import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, ChevronRight } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { EmpleadosSection } from '@/components/SettingsSections';

export default function EmpleadosSettingsPage() {
  const { t } = useLang();
  const router = useRouter();
  const { currentRole } = useApp();
  const tRoles = t.dashboard.roles;

  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.empleados}>
      {/* Roles editor lives inside Team settings. */}
      {can.manageMembers(currentRole) ? (
        <Pressable
          onPress={() => router.push('/dashboard/mas/ajustes/roles')}
          className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex-row items-center gap-3 active:bg-gray-50"
        >
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <ShieldCheck size={18} color="#4F46E5" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-900">{tRoles.title}</Text>
            <Text className="text-xs text-gray-500 mt-0.5">{tRoles.subtitle}</Text>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </Pressable>
      ) : null}
      <EmpleadosSection />
    </SettingsPageWrapper>
  );
}
