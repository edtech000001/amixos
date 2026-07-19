import { View, Text, Pressable, ScrollView, Linking, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
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
// number. Helps support pin down which build a user is on (mobile installs lag
// behind releases). Falls back to just the version if no build number.
const APP_VERSION = (() => {
  const v = Constants.expoConfig?.version;
  if (!v) return '';
  const build = Application.nativeBuildVersion;
  return build ? `v${v} (build ${build})` : `v${v}`;
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

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* No back arrow — Ajustes is a top-level Más item, reached via the
         dock. To go back the user taps the Más tab (same pattern as
         Empleados / Calendario / Inventario / Tienda). */}
      <ScrollView contentContainerClassName="px-6 pt-6 pb-36">
        <Text className="text-2xl font-bold text-ink mb-5">{t.title}</Text>

        {/* Appearance — dark mode toggle */}
        <Pressable
          onPress={toggle}
          className="flex-row items-center gap-3 px-4 py-4 mb-4 rounded-2xl border border-border-soft bg-card active:opacity-90"
        >
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            {resolved === 'dark' ? <Moon size={18} color={c.primary} /> : <Sun size={18} color={c.primary} />}
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-ink">{es ? 'Apariencia' : 'Appearance'}</Text>
            <Text className="text-xs text-muted mt-0.5">
              {resolved === 'dark' ? (es ? 'Modo oscuro' : 'Dark mode') : (es ? 'Modo claro' : 'Light mode')}
            </Text>
          </View>
          {/* Pill switch */}
          <View className={`w-12 h-7 rounded-full p-0.5 ${resolved === 'dark' ? 'bg-primary' : 'bg-border'}`}>
            <View className={`w-6 h-6 rounded-full bg-white ${resolved === 'dark' ? 'ml-auto' : ''}`} />
          </View>
        </Pressable>

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
    </SafeAreaView>
  );
}
