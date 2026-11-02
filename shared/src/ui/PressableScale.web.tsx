// Web counterpart of PressableScale.tsx: a Pressable that sinks a touch while
// pressed (CSS transform with a short spring-like ease). No haptics on web.

import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import type { HapticKind } from '../lib/haptics';

export interface PressableScaleProps extends PressableProps {
  className?: string;
  scaleTo?: number;
  haptic?: HapticKind;
}

export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { scaleTo = 0.97, haptic: _haptic, style, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { transform: [{ scale: state.pressed && !rest.disabled ? scaleTo : 1 }], transitionProperty: 'transform', transitionDuration: '160ms', transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)' } as any,
      ]}
    />
  );
});
