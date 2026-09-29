// Shake the phone → bug report sheet. Mounted once in the dashboard layout.
//
// Self-contained (its own AsyncStorage read for the on/off preference) so the
// layout doesn't grow another piece of state for a feature most users will
// never deliberately use.
//
// Opt-OUT rather than opt-in: the whole value is catching the report from
// someone who would otherwise just close the app, and that person is not going
// into Settings to enable a reporting feature first.

import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShake } from '@/lib/useShake';
import { BugReportSheet } from '@/components/BugReportSheet';

export const SHAKE_REPORT_KEY = 'amixos_shake_report_enabled';

export function ShakeToReport() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SHAKE_REPORT_KEY)
      // Only an explicit 'false' turns it off — an unset key means a user who
      // has never had an opinion, and they should get the feature.
      .then(v => setEnabled(v !== 'false'))
      .catch(() => setEnabled(true));
  }, []);

  // Suppressed while the sheet is already up: shaking to dismiss it is a
  // natural thing to try, and re-firing would trap the user in it.
  useShake(() => setOpen(true), enabled && !open);

  return <BugReportSheet visible={open} onClose={() => setOpen(false)} route={pathname} />;
}
