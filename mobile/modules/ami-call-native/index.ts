import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

// JS side of modules/ami-call-native.
//   iOS:     Live Activity (lock screen / Dynamic Island) + Siri start flag
//   Android: ongoing call notification + launcher shortcut
// Optional: a build without the native module (web, an older dev client)
// gets no-ops.
type AmiCallNative = {
  consumePendingStart(): boolean;
  startActivity(args: { title: string; muteLabel: string; unmuteLabel: string; endLabel: string; status: string; label: string; muted: boolean }): Promise<void>;
  updateActivity(status: string, label: string, muted: boolean): Promise<void>;
  endActivity(): Promise<void>;
  addListener(event: 'onAction', cb: (e: { action: string }) => void): EventSubscription;
};

const native = Platform.OS === 'ios' || Platform.OS === 'android'
  ? requireOptionalNativeModule<AmiCallNative>('AmiCall')
  : null;

// "Start a call" requests that arrive as the amixos://ami/call link (Android
// tile / shortcut / widget, iOS widget button) — see app/+native-intent.tsx.
let linkPending = false;
const jsListeners = new Set<(action: string) => void>();

/** Called by the deep-link handler: start an Ami call as soon as Ami can. */
export function markPendingAmiStart() {
  linkPending = true;
  jsListeners.forEach(cb => cb('start'));
}

export const AmiCall = {
  available: !!native,
  consumePendingStart: () => {
    const fromLink = linkPending;
    linkPending = false;
    return (native?.consumePendingStart() ?? false) || fromLink;
  },
  startActivity: (args: Parameters<AmiCallNative['startActivity']>[0]) => native?.startActivity(args).catch(() => {}),
  updateActivity: (status: string, label: string, muted: boolean) => native?.updateActivity(status, label, muted).catch(() => {}),
  endActivity: () => native?.endActivity().catch(() => {}),
  /** "mute" | "end" (call controls) | "start" (Siri, tile, shortcut, widget). */
  onAction: (cb: (action: string) => void) => {
    jsListeners.add(cb);
    const sub = native?.addListener('onAction', e => cb(e.action));
    return { remove: () => { jsListeners.delete(cb); sub?.remove(); } };
  },
};
