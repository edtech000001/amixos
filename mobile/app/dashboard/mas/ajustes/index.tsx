import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Linking, Platform, Alert } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
  ChevronLeft,
  Building2,
  Briefcase,
  Users,
  User as UserIcon,
  FileText,
  Cloud,
  Activity,
  LifeBuoy,
  LayoutGrid,
  Upload,
  Moon,
  Sun,
  type LucideIcon } from 'lucide-react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useLang } from '@/lib/i18n/LangProvider';
import { useTheme, useThemeColors } from '@/lib/ThemeProvider';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { SUPPORT_EMAIL, buildSupportMailto } from '@amixos/shared/lib/support';

// Build identifier for the footer — app version (app.json) + native build
// number, PLUS the running OTA update's identity. The app version can't
// change per-OTA (runtimeVersion policy = appVersion: bumping it would orphan
// installed builds from updates), so the update id + publish date is what
// tells you an `eas update` actually landed. Shows nothing extra when running
// the bundle embedded in the binary (or Metro in dev).
const APP_VERSION = (() => {
  const v = Constants.expoConfig?.version;
  if (!v) return '';
  const build = Application.nativeBuildVersion;
  let s = build ? `v${v} (build ${build})` : `v${v}`;
  try {
    // Lazy require: keeps this screen safe if expo-updates is ever absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require('expo-updates') as typeof import('expo-updates');
    if (Updates.updateId && !Updates.isEmbeddedLaunch) {
      const d = Updates.createdAt;
      // MM/DD/YYYY — this line is read at a glance to confirm an `eas update`
      // landed, and US date order is what the reader expects.
      const stamp = d
        ? ` ${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
        : '';
      s += `\nOTA ${Updates.updateId.slice(0, 8)}${stamp}`;
    }
  } catch { /* embedded / dev — no OTA line */ }
  return s;
})();

interface SettingsItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  // Either navigates to a screen (path) or runs an action (e.g. open mail).
  path?: string;
  action?: () => void;
}

export default function AjustesIndex() {
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const c = useThemeColors();
  const { t: full, locale } = useLang();
  const { currentRole, user, business } = useApp();
  const t = full.dashboard.settings;
  const es = locale === 'es';

  const contactSupport = async () => {
    const url = buildSupportMailto({
      subject: t.support.emailSubject,
      userEmail: user?.email,
      businessName: business?.name ?? null,
      platform: Platform.OS === 'ios' ? 'iOS' : 'Android',
    });
    const ok = await Linking.canOpenURL(url).catch(() => false);
    if (ok) Linking.openURL(url).catch(() => {});
    else Alert.alert('', t.support.noMailApp.replace('{{email}}', SUPPORT_EMAIL));
  };

  // Business-config sections are admin-only (managers+ down can't change
  // settings — see ROLE_DESCRIPTIONS). Cuenta (own account) + Soporte stay
  // visible to every member.
  const isAdmin = can.manageBusinessSettings(currentRole);
  const items: SettingsItem[] = [
    ...(isAdmin ? [
      {
        key: 'negocio',
        label: t.tabs.negocio,
        description: t.business.subtitle,
        icon: Building2,
        path: '/dashboard/mas/ajustes/negocio',
      },
      {
        key: 'trabajos',
        label: t.tabs.trabajos,
        description: t.pipeline.subtitle,
        icon: Briefcase,
        path: '/dashboard/mas/ajustes/trabajos',
      },
      {
        key: 'clientes',
        label: t.tabs.clientes,
        description: t.requiredFields.subtitle,
        icon: Users,
        path: '/dashboard/mas/ajustes/clientes',
      },
      {
        key: 'empleados',
        label: t.tabs.empleados,
        description: t.employeesSection.subtitle,
        icon: Briefcase,
        path: '/dashboard/mas/ajustes/empleados',
      },
      {
        key: 'facturas',
        label: t.tabs.facturas,
        description: t.invoices.subtitle,
        icon: FileText,
        path: '/dashboard/mas/ajustes/facturas',
      },
      {
        key: 'importar',
        label: t.tabs.importar,
        description: t.importHub.subtitle,
        icon: Upload,
        path: '/dashboard/mas/ajustes/importar',
      },
    ] : []),
    // Roles y permisos lives INSIDE the Equipo (Team) screen, not as its own
    // settings row — see mas/ajustes/empleados.tsx.
    {
      key: 'navegacion',
      label: t.tabs.navegacion,
      description: t.navigation.subtitle,
      icon: LayoutGrid,
      path: '/dashboard/mas/ajustes/navegacion',
    },
    ...(isAdmin ? [{
      key: 'conexiones',
      label: t.tabs.conexiones,
      description: t.google.subtitle,
      icon: Cloud,
      path: '/dashboard/mas/ajustes/conexiones',
    }] : []),
    ...(can.seeAuditLog(currentRole) ? [{
      key: 'actividad',
      label: t.tabs.actividad,
      description: t.activity.subtitle,
      icon: Activity,
      path: '/dashboard/mas/ajustes/actividad',
    }] : []),
    {
      key: 'cuenta',
      label: t.tabs.cuenta,
      description: t.account.subtitle,
      icon: UserIcon,
      path: '/dashboard/mas/ajustes/cuenta',
    },
    {
      key: 'soporte',
      label: t.support.heading,
      description: t.support.subtitle,
      icon: LifeBuoy,
      action: contactSupport,
    },
  ];

  // Forward entrance every time Settings gains focus — the Tabs switch
  // itself doesn't animate, and the ambient transition read as a backwards
  // swipe. FadeInRight (short slide + fade) rather than a full-width slide:
  // the previous screen disappears instantly on a tab switch, so a
  // full-width slide reads as a harsh "swap" instead of a push. Re-keying
  // the wrapper replays the entrance per focus.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(useCallback(() => { setFocusKey((k) => k + 1); }, []));

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <Animated.View key={focusKey} entering={FadeInRight.duration(240)} className="flex-1">
      <ScrollView contentContainerClassName="px-6 pt-6 pb-36">
        {/* Back to the Más menu (Ajustes is pushed from there, not a dock tab). */}
        <View className="flex-row items-center mb-5 -ml-2">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.push('/dashboard/mas'))}
            hitSlop={12}
            className="p-2 rounded-lg active:bg-border-soft"
          >
            <ChevronLeft size={24} color={c.ink} />
          </Pressable>
          <Text className="text-2xl font-bold text-ink ml-1">{t.title}</Text>
        </View>

        {/* Appearance — dark mode toggle. The CARD is inert: only the switch
            flips the theme. Making the whole row pressable meant brushing the
            card while scrolling could silently invert the app. */}
        <View className="flex-row items-center gap-3 px-4 py-4 mb-4 rounded-2xl border border-border-soft bg-card">
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            {resolved === 'dark' ? <Moon size={18} color={c.primary} /> : <Sun size={18} color={c.primary} />}
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">{es ? 'Apariencia' : 'Appearance'}</Text>
            <Text className="text-xs text-muted mt-0.5">
              {resolved === 'dark' ? (es ? 'Modo oscuro' : 'Dark mode') : (es ? 'Modo claro' : 'Light mode')}
            </Text>
          </View>
          {/* Pill switch — hitSlop keeps it comfortable to hit without
              enlarging the visible control. */}
          <Pressable
            onPress={toggle}
            hitSlop={12}
            accessibilityRole="switch"
            accessibilityState={{ checked: resolved === 'dark' }}
            accessibilityLabel={es ? 'Apariencia' : 'Appearance'}
            className="active:opacity-80"
          >
            <View className={`w-12 h-7 rounded-full p-0.5 ${resolved === 'dark' ? 'bg-primary' : 'bg-border'}`}>
              <View className={`w-6 h-6 rounded-full bg-card ${resolved === 'dark' ? 'ml-auto' : ''}`} />
            </View>
          </Pressable>
        </View>

        <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => (item.action ? item.action() : router.push(item.path as never))}
                className={`flex-row items-center gap-3 px-4 py-4 active:bg-surface ${
                  i < items.length - 1 ? 'border-b border-border-soft' : ''
                }`}
              >
                <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                  <Icon size={18} color={c.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-ink">{item.label}</Text>
                  <Text className="text-xs text-muted mt-0.5" numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <ChevronRight size={18} color={c.faint} />
              </Pressable>
            );
          })}
        </View>
        {APP_VERSION ? (
          <Text className="text-center text-[11px] text-faint mt-6">{APP_VERSION}</Text>
        ) : null}
      </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}
