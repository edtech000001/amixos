import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { AccountSection } from '@/components/SettingsSections';

export default function CuentaPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.cuenta}>
      <AccountSection />
    </SettingsPageWrapper>
  );
}
