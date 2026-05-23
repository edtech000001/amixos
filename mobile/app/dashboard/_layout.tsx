import { Tabs } from 'expo-router';
import { Home, ClipboardList, Users, FileText, MoreHorizontal } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { AnimatedDock } from '@/components/AnimatedDock';

export default function DashboardLayout() {
  const { t } = useLang();
  const sb = t.dashboard.sidebar;

  return (
    <Tabs
      tabBar={props => <AnimatedDock {...props} />}
      screenOptions={{
        headerShown: false,
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
        name="clientes/index"
        options={{
          title: sb.clientes,
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trabajos/index"
        options={{
          title: sb.trabajos,
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
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
          title: sb.mas,
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />

      {/* Hidden routes (accessed via push, not via tab bar) */}
      <Tabs.Screen name="facturas/[id]" options={{ href: null }} />
      <Tabs.Screen name="trabajos/[id]" options={{ href: null }} />
      {/* Form screen — hide the dock so the sticky save footer isn't covered. */}
      <Tabs.Screen
        name="trabajos/nuevo"
        options={{ href: null, tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen name="mas/empleados" options={{ href: null }} />
      <Tabs.Screen name="mas/inventario" options={{ href: null }} />
      <Tabs.Screen name="mas/calendario" options={{ href: null }} />
      {/* ajustes/ is a Stack with its own _layout — register the folder once. */}
      <Tabs.Screen name="mas/ajustes" options={{ href: null }} />
    </Tabs>
  );
}
