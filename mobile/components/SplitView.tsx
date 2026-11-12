import { useCallback, type ReactNode } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useThemeColors } from '@/lib/ThemeProvider';
import { OverlayHost } from '@amixos/shared/ui/OverlayPortal';
import { useLeaveGuardStore } from '@/lib/leaveGuardStore';

/** Window width (pt) from which list screens show list + detail side by side
 *  (iPad, iPhone Duo unfolded). Phones top out around 440pt. */
const SPLIT_MIN_WIDTH = 600;

/** List pane width: a third of the window, kept between 300 and 400pt. */
export function useSplitView(): { split: boolean; listWidth: number } {
  const { width } = useWindowDimensions();
  return {
    split: width >= SPLIT_MIN_WIDTH,
    listWidth: Math.round(Math.min(400, Math.max(300, width * 0.36))),
  };
}

/**
 * Apple Contacts-style master/detail: the list stays on the left, the open
 * item on the right. The caller decides whether to use it (useSplitView) and
 * what fills each side.
 */
export function SplitView({ list, detail, listWidth }: {
  list: ReactNode;
  detail: ReactNode;
  listWidth: number;
}) {
  const c = useThemeColors();
  // OverlayHost: the list's Filters sheet covers BOTH panes, not just the list.
  return (
    <OverlayHost>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: listWidth, borderRightWidth: 1, borderRightColor: c.border }}>{list}</View>
        <View style={{ flex: 1 }}>{detail}</View>
      </View>
    </OverlayHost>
  );
}

/** Right pane before anything is picked. */
export function SplitEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  const c = useThemeColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: c.surface }}>
      <Icon size={40} color={c.faint} />
      <Text style={{ color: c.muted, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

// ── Returning to the split view from a pushed screen (edit / new forms) ──────
// Forms used to router.replace() to the item's DETAIL route, which on a wide
// screen shows the single-item page instead of the split view. In split mode
// they instead pop back to the list and leave the id here for it to open.
const pendingOpen: Record<string, string> = {};

/** For forms: show item `id` of `section` — reopened in the split view when
 *  it's on, else via `fallback` (the old replace-to-detail). A form editing
 *  inside the right pane passes `onDone` instead (back to the detail). */
export function useShowInSplit(section: string, onDone?: () => void): (id: string, fallback: () => void) => void {
  const { split } = useSplitView();
  const router = useRouter();
  return useCallback((id: string, fallback: () => void) => {
    if (onDone) {
      onDone();
    } else if (split && router.canGoBack()) {
      pendingOpen[section] = id;
      router.back();
    } else {
      fallback();
    }
  }, [split, router, section, onDone]);
}

/** For split list screens: open whatever a form handed back, on focus. */
export function useSplitOpenRequest(section: string, open: (id: string) => void): void {
  useFocusEffect(useCallback(() => {
    const id = pendingOpen[section];
    if (id) {
      delete pendingOpen[section];
      open(id);
    }
  }, [section, open]));
}

/** Run `fn` (e.g. open another row) once the focused form's unsaved-changes
 *  guard allows it — an edit form in the right pane prompts first. */
export function whenLeaveAllowed(fn: () => void): void {
  const request = useLeaveGuardStore.getState().request;
  if (request) request(fn);
  else fn();
}
