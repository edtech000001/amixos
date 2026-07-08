import { Pressable } from 'react-native';
import { BotMessageSquare } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// "Ami" launcher, docked to the right screen edge as a half-tab so it covers
// as little content as possible (it used to be a full floating circle). Sits
// ABOVE the per-screen add Fab (bottom-32 / ~128px, shared/src/ui/Fab.tsx) so
// the two never overlap, and below the top-banner overlay's zIndex 1000.
export function AssistantFab({ onPress, label }: { onPress: () => void; label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-11 h-12 rounded-l-2xl bg-primary/90 items-center justify-center active:opacity-80"
      style={{
        position: 'absolute',
        // Tucks a sliver off-screen so it reads as a pull-tab, not a button
        // floating over the page.
        right: -6,
        bottom: insets.bottom + 160,
        zIndex: 900,
        // shadow* = iOS, elevation = Android.
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <BotMessageSquare size={19} color="#fff" style={{ marginRight: 6 }} />
    </Pressable>
  );
}
