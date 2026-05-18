import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { ConnectionsSection } from '@/components/SettingsSections';

export default function ConexionesPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.conexiones}>
      <ConnectionsSection />
    </SettingsPageWrapper>
  );
}
