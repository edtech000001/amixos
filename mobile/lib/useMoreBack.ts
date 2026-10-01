import { useRouter } from 'expo-router';
import { useDockApps } from '@/lib/useDockApps';
import { useBackToMore, useInMoreStack } from '@/lib/sectionNav';

/**
 * Back handler for the ← before a list screen's title (shared ScreenTitle).
 *  - Inside the Más stack (opened from the Más menu): a native pop to the menu.
 *  - On its dock tab while pinned: none — you got there from the dock.
 *  - On its tab while NOT pinned (reached by a cross-link): back to Más,
 *    since the dock shows no tab to return to.
 */
export function useMoreBack(dockKey?: string): (() => void) | undefined {
  const router = useRouter();
  const inMore = useInMoreStack();
  const backToMore = useBackToMore();
  const { pinned } = useDockApps();
  if (inMore) return backToMore;
  if (dockKey && pinned.includes(dockKey)) return undefined;
  return () => router.navigate('/dashboard/mas' as never);
}
