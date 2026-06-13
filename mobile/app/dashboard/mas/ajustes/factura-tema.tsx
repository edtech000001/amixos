import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { InvoiceThemeSection } from '@/components/SettingsSections';

export default function FacturaTemaPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.facturaTema}>
      <InvoiceThemeSection />
    </SettingsPageWrapper>
  );
}
