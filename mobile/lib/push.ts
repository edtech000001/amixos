// Push notifications (migration 269 + api/src/routes/notifications.ts).
// The device registers its Expo push token for the signed-in user; the API
// dispatcher sends the pushes; a tap opens the related screen.
//
// expo-notifications is loaded lazily: dev clients built before it was added
// don't have the native module, and a top-level import would crash them.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import { markNotificationRead, notificationHref, unreadNotificationsChanged } from '@amixos/shared/lib/notifications';
import { createSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth/store';

type NotificationsModule = typeof import('expo-notifications');
type SupabaseLike = any;

let mod: NotificationsModule | null | undefined;
function notifications(): NotificationsModule | null {
  if (mod === undefined) {
    // Check the native side first: even inside try/catch, requiring the JS
    // package in a binary without it trips a red "Uncaught Error" in dev.
    if (!requireOptionalNativeModule('ExpoPushTokenManager')) { mod = null; return mod; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('expo-notifications') as NotificationsModule;
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    } catch {
      mod = null; // binary without the native module
    }
  }
  return mod;
}

let currentToken: string | null = null;

/** Ask permission (once — iOS remembers the answer) and store this device's
 *  token for the signed-in user. Safe to call on every dashboard mount. */
export async function registerForPush(supabase: SupabaseLike): Promise<void> {
  const N = notifications();
  if (!N) return;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'Amixos',
        importance: N.AndroidImportance.DEFAULT,
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status === 'undetermined') ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return;
    currentToken = token;
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch (e) {
    // Simulators without push support, offline, or pre-269 DB: the bell still works.
    console.warn('[push] register failed', e);
  }
}

/** Set the number on the app icon (total unread across all companies). */
export function setAppBadge(count: number): void {
  const N = notifications();
  if (!N) return;
  void N.setBadgeCountAsync(Math.max(0, count)).catch(() => {});
}

/** Remove this device's token before signing out, so the next account on the
 *  phone doesn't receive the previous user's alerts. */
export async function unregisterPush(supabase: SupabaseLike): Promise<void> {
  setAppBadge(0); // the next account on this phone starts clean
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  try { await supabase.from('push_tokens').delete().eq('token', token); } catch { /* best-effort */ }
}

/** An alert from another of the user's companies: switch to it first, so the
 *  job/invoice opens inside the right business (not a "not found" in the
 *  current one). Resolves once the switch lands, or after 3 s regardless. */
async function ensureBusiness(businessId: unknown): Promise<void> {
  if (typeof businessId !== 'string') return;
  const st = useAuthStore.getState();
  if (st.activeBusinessId === businessId || !st.businesses.some(b => b.id === businessId)) return;
  await new Promise<void>(resolve => {
    let unsub = () => {};
    const timer = setTimeout(() => { unsub(); resolve(); }, 3000);
    unsub = useAuthStore.subscribe(s2 => {
      if (s2.activeBusinessId === businessId) { clearTimeout(timer); unsub(); resolve(); }
    });
    st.setActiveBusiness(businessId);
  });
}

/** Open the related screen when a notification is tapped (warm or cold start). */
export function usePushTapRouting(ready: boolean): void {
  useEffect(() => {
    const N = notifications();
    if (!N || !ready) return undefined;
    const go = (data: Record<string, unknown> | undefined) => {
      // Opening the alert from the push counts as reading it — the inbox
      // and the bell badge shouldn't still show it as new.
      const nid = data?.notificationId;
      if (typeof nid === 'string') {
        void markNotificationRead(createSupabaseClient(), nid).then(unreadNotificationsChanged, () => {});
      }
      const href = notificationHref(
        { entity_type: (data?.entityType as string) ?? null, entity_id: (data?.entityId as string) ?? null },
        'native',
      );
      void ensureBusiness(data?.businessId).then(() => { if (href) router.push(href as never); });
    };
    let handled: string | null = null;
    N.getLastNotificationResponseAsync().then(r => {
      if (!r) return;
      handled = r.notification.request.identifier;
      go(r.notification.request.content.data as Record<string, unknown>);
    }).catch(() => {});
    const sub = N.addNotificationResponseReceivedListener(r => {
      if (r.notification.request.identifier === handled) return;
      go(r.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, [ready]);
}
