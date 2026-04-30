import { Tabs } from 'expo-router';
import { Home, Briefcase, Users, FileText, MoreHorizontal } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';

export default function DashboardLayout() {
  const { t } = useLang();
  const sb = t.dashboard.sidebar;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopColor: '#F3F4F6',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: sb.inicio,
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trabajos/index"
        options={{
          title: sb.trabajos,
          tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="clientes/index"
        options={{
          title: sb.clientes,
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="facturas/index"
        options={{
          title: sb.facturas,
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="mas/index"
        options={{
          // Translation key for "more" doesn't exist yet — use a literal that works in both langs.
          title: 'Más',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />

      {/* Hidden routes (accessed via push, not via tab bar) */}
      <Tabs.Screen name="facturas/[id]" options={{ href: null }} />
      <Tabs.Screen name="mas/empleados" options={{ href: null }} />
      <Tabs.Screen name="mas/inventario" options={{ href: null }} />
      <Tabs.Screen name="mas/calendario" options={{ href: null }} />
    </Tabs>
  );
}
