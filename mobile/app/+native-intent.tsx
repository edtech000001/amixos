import { markPendingAmiStart } from '@/modules/ami-call-native';

// Rewrites incoming deep links before Expo Router sees them.
// amixos://ami/call (Android Quick Settings tile / launcher shortcut, home
// widgets' "Hablar con Ami") isn't a screen: flag the call and land on the
// dashboard, where the Ami widget picks it up (AssistantWidget).
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const p = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
    if (/^ami\/call\/?(\?.*)?$/i.test(p)) {
      markPendingAmiStart();
      return '/dashboard';
    }
  } catch {
    // Never block a link because of this check.
  }
  return path;
}
