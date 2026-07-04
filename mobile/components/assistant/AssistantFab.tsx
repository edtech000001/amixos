import { Pressable } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Floating "Ami" button. Sits ABOVE the per-screen add Fab (bottom-32 /
// ~128px, shared/src/ui/Fab.tsx) so the two never overlap, and below the
// top-banner overlay's zIndex 1000.
export function AssistantFab({ onPress, label }: { onPress: () => void; label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-80"
      style={{
        position: 'absolute',
        right: 20,
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
      <Sparkles size={24} color="#fff" />
    </Pressable>
  );
}
