import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { TrabajosSection } from '@/components/SettingsSections';

export default function TrabajosPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.trabajos}>
      <TrabajosSection />
    </SettingsPageWrapper>
  );
}
