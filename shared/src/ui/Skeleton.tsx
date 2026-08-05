// Skeleton placeholders for cache-empty first loads — replaces the blocking
// bouncing-dot spinner on list/dashboard screens. A soft opacity pulse over
// neutral blocks; renders on native and web (react-native-web) alike.

import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

function usePulse(): Animated.Value {
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

/** A single pulsing block. Size via className (NativeWind/Tailwind). */
export function SkeletonBlock({ className }: { className?: string }) {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} className={`rounded-lg bg-border-soft ${className ?? ''}`} />
  );
}

/** A list-row placeholder: avatar circle + two text lines. */
export function SkeletonRow() {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="w-10 h-10 rounded-full bg-border-soft" />
      <View className="flex-1 gap-2">
        <View className="h-3.5 w-3/5 rounded bg-border-soft" />
        <View className="h-3 w-2/5 rounded bg-border-soft" />
      </View>
    </Animated.View>
  );
}

/** N stacked rows — the default list skeleton. */
export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <View className="bg-card rounded-2xl border border-border-soft overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className={i > 0 ? 'border-t border-border-soft' : undefined}>
          <SkeletonRow />
        </View>
      ))}
    </View>
  );
}

/** A dashboard stat-tile placeholder. */
export function SkeletonStat() {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} className="bg-card rounded-2xl border border-border-soft p-4 gap-2.5">
      <View className="h-3 w-1/2 rounded bg-border-soft" />
      <View className="h-6 w-2/5 rounded bg-border-soft" />
    </Animated.View>
  );
}
