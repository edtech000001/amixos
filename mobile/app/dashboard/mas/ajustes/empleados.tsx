import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, ChevronRight } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { EmpleadosSection } from '@/components/SettingsSections';
import { useThemeColors } from '@/lib/ThemeProvider';

export default function EmpleadosSettingsPage() {
  const { t } = useLang();
  const router = useRouter();
  const { currentRole } = useApp();
  const tRoles = t.dashboard.roles;
  const c = useThemeColors();

  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.empleados}>
      {/* Roles editor lives inside Team settings. */}
      {can.manageMembers(currentRole) ? (
        <Pressable
          onPress={() => router.push('/dashboard/mas/ajustes/roles')}
          className="bg-card rounded-2xl border border-border-soft p-4 mb-4 flex-row items-center gap-3 active:bg-surface"
        >
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <ShieldCheck size={18} color={c.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">{tRoles.title}</Text>
            <Text className="text-xs text-muted mt-0.5">{tRoles.subtitle}</Text>
          </View>
          <ChevronRight size={18} color={c.faint} />
        </Pressable>
      ) : null}
      <EmpleadosSection />
    </SettingsPageWrapper>
  );
}
