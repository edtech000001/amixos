import { View } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import {
  TrabajosSection,
  TrabajosFieldsSection,
  JobAlertsSection,
  CrewModeSection,
  TrabajadorFieldsSection,
} from '@/components/SettingsSections';

/**
 * Ajustes → Trabajos. Stacked sections:
 *  1. Pipeline step config (which statuses are enabled)
 *  2. Field config — required toggles + unified standard/custom list
 *  3. Upcoming-job alert tiers (highlight cards as start date approaches)
 *  4. Crew mode toggle (hides everything below when off)
 *  5. Per-worker fields — what the Project Leader fills out for each worker
 */
export default function TrabajosPage() {
  const { t } = useLang();
  const { business } = useApp();
  const crewOn = business?.job_crew_mode !== false;

  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.trabajos}>
      <View style={{ gap: 40 }}>
        <TrabajosSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <TrabajosFieldsSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <JobAlertsSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <CrewModeSection />
        {crewOn ? (
          <>
            <View className="h-px bg-gray-100 -mx-6" />
            <TrabajadorFieldsSection />
          </>
        ) : null}
      </View>
    </SettingsPageWrapper>
  );
}
