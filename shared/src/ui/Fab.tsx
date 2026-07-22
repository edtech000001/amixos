import React from 'react';
import { Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';

// Floating action button pinned to the bottom-right of a screen. Mobile list
// screens use it for their primary "new X" action so it stays in one-handed
// thumb reach (replacing the old header pill buttons). The parent must be a
// flex-1 View wrapping the scrollable content, with the Fab as a sibling
// AFTER the list so it renders on top.
export function Fab({
  onPress,
  icon,
}: {
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      // The bottom offset is set via inline style (not a `bottom-N` class): a
      // brand-new NativeWind utility isn't always compiled until the Metro cache
      // is cleared, and when it's missing the Fab loses its offset and jumps to
      // the TOP-right. 148px clears the floating dock (~106px: 50px bar + bubble
      // overhang + home-indicator inset) with breathing room above the bubble.
      className="absolute right-5 w-14 h-14 rounded-full bg-primary items-center justify-center active:opacity-80"
      style={{
        bottom: 148,
        // shadow* = iOS, elevation = Android.
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      {icon ?? <Plus size={26} color="#FFFFFF" />}
    </Pressable>
  );
}
