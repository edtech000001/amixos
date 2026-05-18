import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { BusinessSection } from '@/components/SettingsSections';

export default function NegocioPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.negocio}>
      <BusinessSection />
    </SettingsPageWrapper>
  );
}
