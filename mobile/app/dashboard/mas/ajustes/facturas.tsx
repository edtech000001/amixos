import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { FacturasSection } from '@/components/SettingsSections';

export default function FacturasPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.facturas}>
      <FacturasSection />
    </SettingsPageWrapper>
  );
}
