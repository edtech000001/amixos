import { View } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { AccountSection, LanguageSection } from '@/components/SettingsSections';
import { AiConsentSection } from '@/components/AiConsentSection';

export default function CuentaPage() {
  const { t } = useLang();
  return (
    <SettingsPageWrapper title={t.dashboard.settings.tabs.cuenta}>
      {/* Children render between the password card and the danger zone — see
         AccountSection. Anything placed after it lands below "Cerrar sesión". */}
      <AccountSection>
        <View className="h-px bg-border-soft my-5" />
        <LanguageSection />
        <View className="h-px bg-border-soft my-5" />
        <AiConsentSection />
      </AccountSection>
    </SettingsPageWrapper>
  );
}
