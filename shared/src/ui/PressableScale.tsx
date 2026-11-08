// A Pressable that sinks slightly while pressed and springs back on release —
// the physical "give" iOS controls have. Optional haptic on press.
//
// Use it for buttons, FABs, the dock and cards. NOT for list rows (clients,
// prices, settings): iOS highlights rows instead of shrinking them, and a
// whole list bouncing under your thumb reads as cheap. Rows keep their tint.
//
// Runs on the UI thread (Reanimated), so the spring stays smooth even while
// JS is busy handling the press. `className` (incl. active:*) works as on a
// plain Pressable — the animated component is registered with NativeWind.
// Web: PressableScale.web.tsx (CSS transform).

import { forwardRef, useRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
// require, not import: web's tsc also checks this file (web runs
// PressableScale.web.tsx), and nativewind only exists in mobile's dependencies —
// a static import broke every Vercel build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cssInterop } = require('nativewind') as {
  cssInterop: (component: unknown, mapping: Record<string, string>) => void;
};
import { playHaptic, type HapticKind } from '../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  className?: string;
  /** How far it sinks while held. 0.96 for buttons; ~0.98 for big cards. */
  scaleTo?: number;
  /** Haptic played on press (native only; no-op without expo-haptics). */
  haptic?: HapticKind;
}

// Quick press-in, springy release with a hint of overshoot.
const PRESS_IN = { duration: 90 };
const RELEASE = { damping: 13, stiffness: 340, mass: 0.6 };

// NativeWind must only ever see PLAIN styles: registering the animated
// component directly made css-interop drop the whole `style` prop (layout,
// position, shadows) once a Reanimated style object was in it. So the
// className → style conversion happens on this wrapper, and the animated
// transform is appended inside, after NativeWind is done.
const ScaleInner = forwardRef<View, PressableScaleProps>(function ScaleInner(
  { scaleTo = 0.96, haptic, style, onPressIn, onPressOut, onPress, disabled, ...rest },
  ref,
) {
  const scale = useSharedValue(1);
  const pressedAt = useRef(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressedAt.current = Date.now();
        if (!disabled) scale.value = withTiming(scaleTo, PRESS_IN);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // A quick tap releases before the sink has shown — finish sinking
        // first, then spring back, so every tap visibly "gives".
        const left = PRESS_IN.duration - (Date.now() - pressedAt.current);
        scale.value = !disabled && left > 0
          ? withSequence(withTiming(scaleTo, { duration: left + 40 }), withSpring(1, RELEASE))
          : withSpring(1, RELEASE);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        playHaptic(haptic);
        onPress?.(e);
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={[style as any, animated]}
    />
  );
});

cssInterop(ScaleInner, { className: 'style' });

export const PressableScale = ScaleInner;
