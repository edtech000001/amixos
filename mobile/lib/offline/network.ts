// Connectivity state for the offline write queue.
//
// Field crews work in dead zones, so the app needs to KNOW when it's offline
// (to queue writes instead of failing) and when it comes back (to drain the
// queue). This module owns a single source of truth — `useNetworkStore` — fed
// by @react-native-community/netinfo plus an AppState foreground re-check.
//
// NetInfo is a native module. If the dev client hasn't been rebuilt since it
// was added to package.json, a static import would white-screen the app. So we
// `require` it lazily inside try/catch and fall back to "assume online" —
// failed writes still get caught and queued by mutate(), and AppState
// foreground events still trigger drains. The feature degrades, never crashes.

import { create } from 'zustand';
import { AppState, NativeModules } from 'react-native';

interface NetworkState {
  // True when we believe we have a usable internet connection.
  isOnline: boolean;
  // Whether NetInfo wired up (false = degraded mode, see header).
  monitorActive: boolean;
  setOnline: (online: boolean) => void;
  _setMonitorActive: (active: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  // Optimistic until the first NetInfo event. mutate() catches network errors
  // regardless, so a wrong initial guess never loses data.
  isOnline: true,
  monitorActive: false,
  setOnline: (online) => set({ isOnline: online }),
  _setMonitorActive: (active) => set({ monitorActive: active }),
}));

export function isOnlineNow(): boolean {
  return useNetworkStore.getState().isOnline;
}

// Listeners notified whenever we transition offline → online, so the sync
// runner can drain without this module importing it (avoids a cycle).
type ReconnectListener = () => void;
const reconnectListeners = new Set<ReconnectListener>();

export function onReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

function applyOnline(online: boolean) {
  const was = useNetworkStore.getState().isOnline;
  useNetworkStore.getState().setOnline(online);
  if (online && !was) {
    for (const l of reconnectListeners) l();
  }
}

// NetInfo state → boolean. `isInternetReachable` is null while unknown; only a
// hard `false` (connected to wifi but no internet) counts as offline.
function deriveOnline(state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

// The NetInfo JS wrapper THROWS the moment it's evaluated when its native side
// (RNCNetInfo) isn't in the binary — and on iOS dev that throw surfaces as a
// redbox even from inside try/catch. So we never load the wrapper unless the
// native module is actually present. `NativeModules.RNCNetInfo` is a plain
// lookup that returns null when absent (no throw). When this is false, the dev
// client predates the netinfo dependency and needs a rebuild — until then we
// run degraded (optimistic-online + write-error capture + foreground drains).
function getNetInfo(): any | null {
  if (!NativeModules.RNCNetInfo) return null;
  try {
    return require('@react-native-community/netinfo').default;
  } catch {
    return null;
  }
}

let started = false;

// Idempotent. Returns a teardown fn. Safe to call before the native module
// exists — it just runs in degraded mode.
export function startNetworkMonitor(): () => void {
  if (started) return () => {};
  started = true;

  const teardowns: Array<() => void> = [];

  const NetInfo = getNetInfo();
  if (NetInfo) {
    const unsub = NetInfo.addEventListener((state: any) => applyOnline(deriveOnline(state)));
    teardowns.push(unsub);
    void NetInfo.fetch().then((state: any) => applyOnline(deriveOnline(state)));
    useNetworkStore.getState()._setMonitorActive(true);
  } else {
    // Degraded mode: no live connectivity events. Stay optimistic; rely on
    // write-error capture + AppState foreground re-drains below.
    useNetworkStore.getState()._setMonitorActive(false);
  }

  // Foreground re-check: coming back to the app is a good moment to retry the
  // queue (and, with NetInfo, refresh the connectivity reading).
  const sub = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    const ni = getNetInfo();
    if (ni) {
      void ni.fetch().then((state: any) => applyOnline(deriveOnline(state)));
    } else {
      // No NetInfo — assume reachable and let listeners try a drain.
      applyOnline(true);
    }
  });
  teardowns.push(() => sub.remove());

  return () => {
    for (const t of teardowns) t();
    started = false;
  };
}
