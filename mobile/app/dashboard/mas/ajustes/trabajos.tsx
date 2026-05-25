import { View } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { TrabajosSection, TrabajosFieldsSection } from '@/components/SettingsSections';

/**
 * Ajustes → Trabajos. Two stacked sections:
 *  1. Pipeline step config (which statuses are enabled)
 *  2. Field config — required toggles + unified standard/custom list
 */
export default function TrabajosPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.trabajos}>
      <View style={{ gap: 40 }}>
        <TrabajosSection />
        <View className="h-px bg-gray-100 -mx-6" />
        <TrabajosFieldsSection />
      </View>
    </SettingsPageWrapper>
  );
}
