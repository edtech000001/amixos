import { View } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { FacturasSection, InvoiceBillThroughSection } from '@/components/SettingsSections';

export default function FacturasPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.facturas}>
      <View style={{ gap: 40 }}>
        <FacturasSection />
        <InvoiceBillThroughSection />
      </View>
    </SettingsPageWrapper>
  );
}
