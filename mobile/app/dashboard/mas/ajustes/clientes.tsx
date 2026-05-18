import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { ClientesSection } from '@/components/SettingsSections';

export default function ClientesPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.clientes}>
      <ClientesSection />
    </SettingsPageWrapper>
  );
}
