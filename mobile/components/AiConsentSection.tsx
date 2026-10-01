import { View, Text } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { Toggle } from '@amixos/shared/ui';
import { isAssistantEnabled } from '@amixos/shared/assistant/config';
import { useAiConsent } from '@amixos/shared/lib/aiConsent';

/**
 * Ajustes → Cuenta: give or withdraw consent for Ami to share data with
 * third-party AI (App Store 5.1.2(i) requires an easy way to withdraw).
 * Saves on flip. Only shown where Ami is available. Web twin: AiConsentCard.
 */
export function AiConsentSection() {
  const { business } = useApp();
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.assistant.consent;
  const consent = useAiConsent(createSupabaseClient());

  if (!business || !isAssistantEnabled(business.id) || consent.granted === null) return null;
  return (
    <View className="bg-card rounded-2xl border border-border-soft p-5 gap-3 mt-4">
      <View className="flex-row items-center gap-3">
        <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
          <Sparkles size={18} color={c.primary} />
        </View>
        <Text className="flex-1 text-base font-semibold text-ink">{t.settingTitle}</Text>
        <Toggle value={consent.granted} onValueChange={next => void consent.set(next)} />
      </View>
      <Text className="text-xs text-muted leading-5">{t.settingHint}</Text>
      <Text className={`text-xs font-medium ${consent.granted ? 'text-emerald-600' : 'text-muted'}`}>
        {consent.granted ? t.settingOn : t.settingOff}
      </Text>
    </View>
  );
}
