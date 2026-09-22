// Support & feedback — one screen holding everything a user (or an App Store
// reviewer) needs to reach us or read the legal documents from INSIDE the app:
// the support address, the privacy policy and the terms.
//
// The settings row used to fire a mailto straight away. That left the privacy
// policy and terms reachable only from the signup screen, which someone who
// already has an account never sees again.
//
// No version line here on purpose: the settings index already shows
// "v<version> (build <n>)" with a Check-for-update link, one screen back. Two
// version readouts that can disagree is worse than one that is complete.

import { View, Text, Pressable, Linking, Alert, Platform } from 'react-native';
import { LifeBuoy, Mail, Shield, FileText, ExternalLink } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useApp } from '@/lib/AppContext';
import { SettingsPageWrapper } from '@/components/SettingsPageWrapper';
import { SUPPORT_EMAIL, buildSupportMailto } from '@amixos/shared/lib/support';
import { WEB_APP_URL } from '@/lib/webUrl';

export default function SoportePage() {
  const { t: full } = useLang();
  const t = full.dashboard.settings.support;
  const c = useThemeColors();
  const { user, business } = useApp();

  const contactSupport = async () => {
    const url = buildSupportMailto({
      subject: t.emailSubject,
      userEmail: user?.email,
      businessName: business?.name ?? null,
      platform: Platform.OS === 'ios' ? 'iOS' : 'Android',
    });
    const ok = await Linking.canOpenURL(url).catch(() => false);
    if (ok) Linking.openURL(url).catch(() => {});
    else Alert.alert('', t.noMailApp.replace('{{email}}', SUPPORT_EMAIL));
  };

  const open = (path: string) => { Linking.openURL(`${WEB_APP_URL}${path}`).catch(() => {}); };

  return (
    <SettingsPageWrapper title={t.heading}>
      <View className="gap-4">
        {/* Contact */}
        <View className="bg-card rounded-2xl border border-border-soft p-5 gap-3">
          <View className="flex-row items-start gap-3">
            <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
              <LifeBuoy size={18} color={c.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{t.heading}</Text>
              <Text className="text-xs text-faint mt-0.5">{t.subtitle}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => void contactSupport()}
            className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-primary active:opacity-90"
          >
            <Mail size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">{t.contactBtn}</Text>
          </Pressable>
          <Text className="text-xs text-faint text-center">{SUPPORT_EMAIL}</Text>
        </View>

        {/* Legal — the same documents linked from the signup screen, reachable
            here for anyone already signed in. */}
        <View className="bg-card rounded-2xl border border-border-soft p-5 gap-1">
          <Text className="text-[11px] text-faint font-semibold uppercase tracking-wide mb-1">
            {t.legalHeading}
          </Text>

          <Pressable
            onPress={() => open('/privacy')}
            className="flex-row items-center gap-3 py-3 border-b border-border-soft active:opacity-70"
          >
            <Shield size={16} color={c.muted} />
            <Text className="flex-1 text-sm font-medium text-ink">{t.privacy}</Text>
            <ExternalLink size={15} color={c.faint} />
          </Pressable>

          <Pressable
            onPress={() => open('/terms')}
            className="flex-row items-center gap-3 py-3 active:opacity-70"
          >
            <FileText size={16} color={c.muted} />
            <Text className="flex-1 text-sm font-medium text-ink">{t.terms}</Text>
            <ExternalLink size={15} color={c.faint} />
          </Pressable>

          <Text className="text-[11px] text-faint mt-1">{t.legalHint}</Text>
        </View>
      </View>
    </SettingsPageWrapper>
  );
}
