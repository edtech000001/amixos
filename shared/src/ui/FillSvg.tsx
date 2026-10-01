import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';

/**
 * An Svg that fills its parent, sized from MEASURED layout instead of
 * `style={absoluteFill}` + percentage children. On iOS the stretched form
 * sizes itself from the first layout pass and never follows: on an iPad it
 * kept portrait width in landscape (and after any rotation / Split View
 * resize), leaving a bare strip beside a gradient. Measuring via onLayout and
 * passing explicit width/height — keyed so it remounts on resize — is exact.
 * Children may keep using "100%" sizes.
 */
export function FillSvg({ children, preserveAspectRatio }: { children: ReactNode; preserveAspectRatio?: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setSize(prev => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {size ? (
        <Svg key={`${size.w}x${size.h}`} width={size.w} height={size.h} preserveAspectRatio={preserveAspectRatio}>
          {children}
        </Svg>
      ) : null}
    </View>
  );
}
