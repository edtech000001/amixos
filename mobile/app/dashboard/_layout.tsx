import { Tabs } from 'expo-router';
import { Home, ClipboardList, Users, FileText, LayoutGrid } from 'lucide-react-native';
import { Alert, View } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang } from '@/lib/i18n/LangProvider';
import { AnimatedDock } from '@/components/AnimatedDock';
import { useAuthStore } from '@/lib/auth/store';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import {
  GoogleSyncBanner,
  GoogleSyncBannerProvider,
  useGoogleSyncBanner,
  type SyncQueueStorage,
} from '@amixos/shared/lib/googleSyncBanner';

const SYNC_QUEUE_KEY = 'gsync_queue_v1';

const asyncStorageAdapter: SyncQueueStorage = {
  load: async () => {
    const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save: async q => AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)),
  clear: async () => AsyncStorage.removeItem(SYNC_QUEUE_KEY),
};

export default function DashboardLayout() {
  const user = useAuthStore(s => s.user);
  const helpers = useMemo(() => ({
    getApiBaseUrl: () => getApiBaseUrl() || null,
    getJwt: () => getJwt().then(j => j || null).catch(() => null),
  }), []);

  // Stop-only confirm. Cancelling never deletes local data — the user
  // can use bulk-delete from the list if they want to undo an import.
  // Same UX for both modes; the body text adapts to where the data sits.
  const onCancelImport = useCallback(
    (info:
      | { mode: 'create'; allIds: string[] }
      | { mode: 'update'; remainingCount: number }
      | { mode: 'delete'; remainingCount: number }) =>
      new Promise<boolean>(resolve => {
        const remaining =
          info.mode === 'create' ? info.allIds.length : info.remainingCount;
        const body =
          info.mode === 'create'
            ? `Los ${remaining} contacto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} no se sincronizarán con Google Contacts. Los contactos en Amixos no se eliminarán.`
            : info.mode === 'update'
              ? `Los ${remaining} contacto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} no se actualizarán. Los que ya se actualizaron conservan la nueva información.`
              : `Los ${remaining} contacto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} permanecerá${remaining !== 1 ? 'n' : ''} en Google Contacts. Podrás eliminarlos manualmente desde Google.`;
        Alert.alert(
          '¿Detener sincronización?',
          body,
          [
            { text: 'Continuar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Detener', style: 'destructive', onPress: () => resolve(true) },
          ],
        );
      }),
    [],
  );

  return (
    <GoogleSyncBannerProvider
      storage={asyncStorageAdapter}
      getApiBaseUrl={helpers.getApiBaseUrl}
      getJwt={helpers.getJwt}
      userKey={user?.id ?? null}
      onCancelImport={onCancelImport}
    >
      <DashboardTabs />
    </GoogleSyncBannerProvider>
  );
}

// Inner component so the banner overlay can read sync state via the hook.
// Measures the banner's actual height and pushes the Tabs container down
// by that amount when visible — keeps the banner from covering screen
// headers like "Clientes".
function DashboardTabs() {
  const { t } = useLang();
  const sb = t.dashboard.sidebar;
  const insets = useSafeAreaInsets();
  const { status } = useGoogleSyncBanner();
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerVisible = status.kind !== 'idle';
  // When the banner hides, drop the offset immediately. When it shows,
  // the next onLayout pass will update bannerHeight. Brief 0→correct
  // transition is fine — better than holding stale height after dismiss.
  const offset = bannerVisible ? bannerHeight : 0;

  return (
    <>
      <View
        pointerEvents="box-none"
        onLayout={e => setBannerHeight(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 1000 }}
      >
        <GoogleSyncBanner />
      </View>
      <View style={{ flex: 1, marginTop: offset }}>
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
              tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
            }}
          />

          {/* Hidden routes (accessed via push, not via tab bar) */}
          <Tabs.Screen name="facturas/[id]" options={{ href: null }} />
          <Tabs.Screen
            name="facturas/nueva"
            options={{
              href: null,
              tabBarStyle: { display: 'none' },
              unmountOnBlur: true,
            }}
          />
          <Tabs.Screen name="clientes/[id]" options={{ href: null }} />
          <Tabs.Screen
            name="clientes/nuevo"
            options={{
              href: null,
              tabBarStyle: { display: 'none' },
              unmountOnBlur: true,
            }}
          />
          <Tabs.Screen name="trabajos/[id]" options={{ href: null }} />
          {/* Form screen — hide the dock so the sticky save footer isn't covered.
             unmountOnBlur clears form state when the user navigates away so the
             next "+ Nuevo trabajo" tap starts fresh (edit-mode reloads from DB). */}
          <Tabs.Screen
            name="trabajos/nuevo"
            options={{
              href: null,
              tabBarStyle: { display: 'none' },
              unmountOnBlur: true,
            }}
          />
          {/* Project Leader's filtered job list — pushed from Más. */}
          <Tabs.Screen
            name="trabajos/mis-trabajos"
            options={{
              href: null,
              tabBarStyle: { display: 'none' },
              unmountOnBlur: true,
            }}
          />
          {/* The empleados file → directory move means the route is no
             longer a leaf at `mas/empleados`; it's `mas/empleados/index`
             + `mas/empleados/[id]`. Both need explicit href:null,
             otherwise expo-router auto-surfaces them as empty dock tabs. */}
          <Tabs.Screen name="mas/empleados/index" options={{ href: null }} />
          <Tabs.Screen name="mas/empleados/[id]" options={{ href: null }} />
          <Tabs.Screen name="mas/equipo" options={{ href: null }} />
          <Tabs.Screen name="mas/inventario" options={{ href: null }} />
          <Tabs.Screen name="mas/calendario" options={{ href: null }} />
          {/* ajustes/ is a Stack with its own _layout — register the folder once. */}
          <Tabs.Screen name="mas/ajustes" options={{ href: null }} />
          {/* Module routes — dynamic [moduleId] page. Without href:null Expo
             Router auto-discovers it and gives it a tab slot (showed up as an
             empty 5th button on the dock). */}
          <Tabs.Screen name="mas/modulos/[moduleId]" options={{ href: null }} />
        </Tabs>
      </View>
    </>
  );
}
