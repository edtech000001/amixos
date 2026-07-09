import { View } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import {
  TrabajosSection,
  TrabajosFieldsSection,
  JobAlertsSection,
  CrewModeSection,
  JobItemTypesSection,
  JobPrivateOnInvoiceSection,
} from '@/components/SettingsSections';

/**
 * Ajustes → Trabajos. Stacked sections:
 *  1. Pipeline step config (which statuses are enabled)
 *  2. Field config — required toggles + unified standard/custom list
 *  3. Upcoming-job alert tiers (highlight cards as start date approaches)
 *  4. Item-type categories toggle (Labor/Material/Equipment/Other on/off)
 *  5. Crew mode toggle (mark a lead + assign a crew)
 */
export default function TrabajosPage() {
  const { t } = useLang();

  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.trabajos}>
      <View style={{ gap: 40 }}>
        <TrabajosSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <TrabajosFieldsSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <JobAlertsSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <JobItemTypesSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <JobPrivateOnInvoiceSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <CrewModeSection />
      </View>
    </SettingsPageWrapper>
  );
}
