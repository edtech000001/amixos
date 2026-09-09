// Tells the user an update is waiting — and never takes the decision from them.
//
// Two update paths reach this app, and they fail in opposite ways:
//
//   OTA (expo-updates)  The JS bundle downloads in the background and applies
//                       on the next launch. People who never force-quit can
//                       run a build that was replaced weeks ago and report
//                       bugs that are already fixed. They need to be TOLD,
//                       because nothing visible changes.
//   Store build         A new binary. The running app cannot discover one on
//                       its own, so `app_releases` (migration 221) states it.
//
// The hard rule here is that neither one may interrupt work. `reloadAsync()`
// discards in-memory state, so calling it under someone typing a job would
// destroy the form. So:
//   * the update is fetched silently and NEVER auto-applied;
//   * the prompt is suppressed entirely while a guarded form is focused
//     (`leaveGuardStore.request`), which is every form screen in the app;
//   * restarting only ever happens from an explicit tap.
//
// The cost of waiting is a user staying one version behind for a few more
// minutes. The cost of not waiting is a lead losing a job they just filled in.

import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import * as Application from 'expo-application';
import { createSupabaseClient } from '@/lib/supabase';
import { useLeaveGuardStore } from '@/lib/leaveGuardStore';

/** How often a foregrounding may trigger a check. Updates are not urgent, and
 *  a check is a network round trip on data plans that are often metered. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface StoreUpdate {
  version: string;
  url: string;
  notes: string | null;
}

export interface AppUpdateState {
  /** An OTA bundle is downloaded and applies on the next restart. */
  otaReady: boolean;
  /** A newer store build exists. Null when current, or when an OTA is pending
   *  — a restart is quicker than a store trip, so we ask for that first. */
  storeUpdate: StoreUpdate | null;
  checking: boolean;
  downloading: boolean;
  /** The last manual check found nothing. Only ever set by check(true), so a
   *  background check can never flash "up to date" at someone. */
  checkedUpToDate: boolean;
  checkFailed: boolean;
  /** True while a form screen is focused. The banner must stay hidden. */
  suppressed: boolean;
  check: (manual?: boolean) => Promise<void>;
  restart: () => Promise<void>;
}

/** Whether a release row should prompt. Separate from the raw version test so
 *  the URL check can never be forgotten: a prompt whose button opens a store
 *  page that does not exist is worse than no prompt, and while the app is
 *  unpublished the seeded URL is a placeholder. */
function isStoreReleaseNewer(
  row: { latest_version: string; store_url: string },
  currentVersion: string,
): boolean {
  const url = (row.store_url ?? '').trim();
  // An unfilled seed: no URL, or Apple's id with the digits still zeroed.
  if (!url || /\/id0+(\?|$|\/)/.test(url)) return false;
  return isNewerVersion(row.latest_version, currentVersion);
}

/** `a` is newer than `b`, comparing dotted segments as NUMBERS. String
 *  comparison gets this wrong the first time a segment reaches double digits:
 *  '0.1.10' sorts before '0.1.9' but is three releases newer. */
export function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string) =>
    v.split('.').map(seg => parseInt(seg.replace(/[^0-9].*$/, ''), 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** expo-updates is absent in Expo Go and disabled in dev builds. Every call is
 *  lazily required and guarded so the hook is inert there rather than throwing
 *  on mount — a broken update checker must not break the app it checks. */
function getUpdates(): typeof import('expo-updates') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require('expo-updates') as typeof import('expo-updates');
    return Updates.isEnabled ? Updates : null;
  } catch {
    return null;
  }
}

interface UpdateStore {
  otaReady: boolean;
  storeUpdate: StoreUpdate | null;
  checking: boolean;
  downloading: boolean;
  checkedUpToDate: boolean;
  checkFailed: boolean;
  lastCheck: number;
  running: boolean;
  check: (manual?: boolean) => Promise<void>;
}

/** Module-level, not per-component: the banner and the Ajustes row both read
 *  this, and two independent copies would double the network checks and let
 *  one screen say "up to date" while the other offers a restart. */
const useUpdateStore = create<UpdateStore>((set, get) => ({
  otaReady: false,
  storeUpdate: null,
  checking: false,
  downloading: false,
  checkedUpToDate: false,
  checkFailed: false,
  lastCheck: 0,
  running: false,

  check: async (manual = false) => {
    if (get().running) return;
    set({ running: true });
    if (manual) set({ checking: true, checkedUpToDate: false, checkFailed: false });
    let foundOta = false;
    try {
      const Updates = getUpdates();
      if (Updates) {
        // A bundle may already be downloaded and waiting — expo-updates fetches
        // one at launch on its own, and that one is invisible to
        // checkForUpdateAsync (it reports no update because the newest one is
        // already local). Without this, the very case this feature exists for
        // — someone who never restarts — would never be prompted.
        let pending = false;
        try {
          const ctx = await Updates.getNativeStateMachineContextAsync();
          pending = ctx.isUpdatePending;
        } catch {
          /* older native runtime — fall through to the normal check */
        }
        if (pending) {
          foundOta = true;
          set({ otaReady: true });
        } else {
          const res = await Updates.checkForUpdateAsync();
          if (res.isAvailable) {
            set({ downloading: true });
            try {
              const fetched = await Updates.fetchUpdateAsync();
              if (fetched.isNew) {
                foundOta = true;
                set({ otaReady: true });
              }
            } finally {
              set({ downloading: false });
            }
          }
        }
      }

      // A pending OTA outranks a store build: restarting is one tap and gets
      // them current immediately. Asking for both at once is noise.
      //
      // A failure HERE is reported separately from the OTA check above,
      // because the two are independent and the store half is the fragile
      // one: the table may not exist yet, or may be unreadable. Letting it
      // fail the whole check would tell someone "couldn't check" right after
      // the OTA half worked — which is both wrong and the opposite of
      // reassuring.
      if (!foundOta) {
        try {
          const platform = Platform.OS === 'ios' ? 'ios' : 'android';
          const { data, error } = await createSupabaseClient()
            .from('app_releases')
            .select('latest_version, store_url, notes_es, notes_en')
            .eq('platform', platform)
            .maybeSingle();
          if (error) throw error;
          const current = Application.nativeApplicationVersion ?? '';
          // NOTE: this is the NATIVE version (Info.plist / build.gradle), not
          // app.json's `version`. The two drift — app.json is bumped on every
          // OTA while the native files only change on a rebuild — and the
          // store row must be written against the native one, because that is
          // what a shipped binary actually reports.
          if (data && current && isStoreReleaseNewer(data, current)) {
            set({
              storeUpdate: {
                version: data.latest_version,
                url: data.store_url,
                notes: data.notes_es ?? data.notes_en ?? null,
              },
            });
          } else {
            set({ storeUpdate: null });
          }
        } catch {
          // No store row to compare against. The OTA answer still stands.
          set({ storeUpdate: null });
        }
        if (manual) set({ checkedUpToDate: true });
      }
      set({ lastCheck: Date.now() });
    } catch {
      // The OTA check itself failed — offline, or the updates service is
      // unreachable. Worth saying on a manual check, silent on a background
      // one.
      if (manual) set({ checkFailed: true });
    } finally {
      set({ running: false });
      if (manual) set({ checking: false });
    }
  },

}));

/** Guards the mount/foreground effect so it runs once for the app, not once
 *  per component that reads the state. */
let pollingOwner = 0;
let nextOwnerId = 1;

export function useAppUpdate(): AppUpdateState {
  const s = useUpdateStore();
  const ownerId = useRef(0);
  if (ownerId.current === 0) ownerId.current = nextOwnerId++;

  // Any focused form registers a leave guard. While one is up, someone is
  // mid-entry and must not be shown a restart prompt.
  const formFocused = useLeaveGuardStore(st => st.request !== null);

  useEffect(() => {
    if (pollingOwner !== 0) return;
    pollingOwner = ownerId.current;
    void s.check();
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      const st = useUpdateStore.getState();
      if (Date.now() - st.lastCheck < CHECK_INTERVAL_MS) return;
      void st.check();
    });
    return () => {
      sub.remove();
      pollingOwner = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    otaReady: s.otaReady,
    storeUpdate: s.storeUpdate,
    checking: s.checking,
    downloading: s.downloading,
    checkedUpToDate: s.checkedUpToDate,
    checkFailed: s.checkFailed,
    suppressed: formFocused,
    check: s.check,
    restart: async () => {
      const Updates = getUpdates();
      if (!Updates) return;
      await Updates.reloadAsync();
    },
  };
}
