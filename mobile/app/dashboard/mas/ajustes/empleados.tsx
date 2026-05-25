import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { EmpleadosSection } from '@/components/SettingsSections';

export default function EmpleadosSettingsPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.empleados}>
      <EmpleadosSection />
    </SettingsPageWrapper>
  );
}
