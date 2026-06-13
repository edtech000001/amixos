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
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { can } from '@amixos/shared/lib/permissions';
import { SUPPORT_EMAIL, buildSupportMailto } from '@amixos/shared/lib/support';

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
  const { t: full } = useLang();
  const { currentRole, user, business } = useApp();
  const t = full.dashboard.settings;

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

  const items: SettingsItem[] = [
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
    // Equipo (team) moved out of Ajustes — now lives as a top-level
    // entry in Más under Empleados (see mas/index.tsx + mas/equipo.tsx).
    ...(can.seeAuditLog(currentRole) ? [{
      key: 'actividad',
      label: t.tabs.actividad,
      description: t.activity.subtitle,
      icon: Activity,
      path: '/dashboard/mas/ajustes/actividad',
    }] : []),
    {
      key: 'conexiones',
      label: t.tabs.conexiones,
      description: t.google.subtitle,
      icon: Cloud,
      path: '/dashboard/mas/ajustes/conexiones',
    },
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
        <Text className="text-2xl font-bold text-gray-900 mb-5">{t.title}</Text>
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => (item.action ? item.action() : router.push(item.path as never))}
                className={`flex-row items-center gap-3 px-4 py-4 active:bg-gray-50 ${
                  i < items.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                  <Icon size={18} color="#4F46E5" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">{item.label}</Text>
                  <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
