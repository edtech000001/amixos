import { Tabs } from 'expo-router';
import { Home, LayoutGrid } from 'lucide-react-native';
import { Alert, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang } from '@/lib/i18n/LangProvider';
import { AnimatedDock } from '@/components/AnimatedDock';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth/store';
import { DOCK_APPS } from '@/lib/dockApps';
import { useDockStore } from '@/lib/dockStore';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { OfflineSyncBanner } from '@/components/OfflineSyncBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { BillingGate } from '@/components/BillingGate';
import { AssistantWidget } from '@/components/assistant/AssistantWidget';
import { startNetworkMonitor } from '@/lib/offline/network';
import { startSyncRunner } from '@/lib/offline/syncRunner';
import { useOutboxStore } from '@/lib/offline/outbox';
import { useNetworkStore } from '@/lib/offline/network';
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
  const activeBusinessId = useAuthStore(s => s.activeBusinessId);
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
      businessKey={activeBusinessId ?? null}
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
  const { currentRole, user, impersonating } = useApp();
  const insets = useSafeAreaInsets();
  // Load the user's dock-app selection (synced via profiles.dock_apps) once.
  // Every role-eligible app stays REGISTERED as a tab below (href fixed by role
  // only) — which apps actually appear in the dock is decided visually by
  // AnimatedDock from the store. So toggling apps in Navegación is just a dock
  // re-render, not a tab-navigator reconfigure (which felt sluggish).
  const supabase = useMemo(() => createSupabaseClient(), []);
  const loadDock = useDockStore(s => s.load);
  useEffect(() => {
    if (user?.id) loadDock(supabase, user.id);
  }, [user?.id, supabase, loadDock]);

  // Offline write queue: watch connectivity and drain the outbox on reconnect.
  // Both are idempotent, so mounting once here is enough for the whole app.
  useEffect(() => {
    const stop = startNetworkMonitor();
    startSyncRunner();
    return stop;
  }, []);
  const { status } = useGoogleSyncBanner();
  // The offline-sync banner shows whenever there are queued ops OR we're offline
  // (the "showing saved data" hint) — it also needs to push content down, not
  // just the Google banner. Without this it overlays the screen header.
  const offlineActive = useOutboxStore(s => s.ops.length > 0) || !useNetworkStore(s => s.isOnline);
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerVisible = status.kind !== 'idle' || offlineActive || !!impersonating;
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
        <ImpersonationBanner />
        <OfflineSyncBanner />
        <GoogleSyncBanner />
      </View>
      <View style={{ flex: 1, marginTop: offset }}>
        {/* Keyed by identity: entering/leaving "Ver como" (or its auto-expiry)
            remounts the whole navigator so no in-progress form state leaks
            across the role switch — e.g. a half-filled "nuevo trabajo" started
            as the member must not resurface pre-filled once back as the owner.
            The enter/leave flows router.replace() right after the flip, so the
            user still lands on the intended screen. */}
        <Tabs
          key={impersonating ? `imp:${impersonating.userId}` : 'self'}
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

          {/* Every dock-eligible app is registered (href fixed by role so the
             navigator never reconfigures on selection). AnimatedDock decides
             which of these actually show, from the user's saved selection. A
             role-blocked app gets href:null and is fully off the dock. */}
          {DOCK_APPS.map(app => {
            const Icon = app.Icon;
            const eligible = !app.gate || app.gate(currentRole);
            return (
              <Tabs.Screen
                key={app.routeName}
                name={app.routeName}
                options={{
                  href: eligible ? undefined : null,
                  title: sb[app.labelKey],
                  tabBarIcon: ({ color, size }) => <Icon color={color} size={size} />,
                }}
              />
            );
          })}

          <Tabs.Screen
            name="mas/index"
            options={{
              title: sb.mas,
              tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
            }}
          />

          {/* Hidden routes (accessed via push, not via tab bar).

             NOTE: each CRUD section (facturas, clientes, trabajos, mas/empleados)
             now has its OWN Stack (_layout in the section folder), registered as
             a single tab via the DOCK_APPS map above. Their list/detail/form
             screens live INSIDE that stack — so they're NOT registered here.
             This is what makes the dock remember where you left off: the Tabs
             navigator keeps each section's stack mounted across dock switches.
             It also drops the old `unmountOnBlur` that was wiping half-filled
             forms when you tapped away. */}
          <Tabs.Screen name="mas/equipo" options={{ href: null }} />
          {/* Payroll — reached from Reports, not the dock. */}
          <Tabs.Screen name="mas/nomina" options={{ href: null }} />
          <Tabs.Screen name="mas/nomina-historial" options={{ href: null }} />
          {/* Inventario is a MODULE (mas/inventario is a redirect to
             mas/modulos/inventory) — kept off the dock; reached via Más only
             when the module is enabled. */}
          <Tabs.Screen name="mas/inventario" options={{ href: null }} />
          {/* ajustes/ is a Stack with its own _layout — register the folder once. */}
          <Tabs.Screen name="mas/ajustes" options={{ href: null }} />
          {/* Module routes — dynamic [moduleId] page. Without href:null Expo
             Router auto-discovers it and gives it a tab slot (showed up as an
             empty 5th button on the dock). */}
          <Tabs.Screen name="mas/modulos/[moduleId]" options={{ href: null }} />
        </Tabs>
      </View>
      {/* Ami — floating assistant FAB + chat sheet, over every dashboard
         screen. Self-hides while impersonating or without a business. */}
      <AssistantWidget />
      {/* Full-screen overlay when the active business has no access (expired
         trial / canceled / 'none'). Self-hides otherwise. Sits ABOVE the tab
         bar via its own high zIndex/elevation. */}
      <BillingGate />
    </>
  );
}
