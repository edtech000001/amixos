// Skeleton placeholders — NATIVE implementation. Skeleton.web.tsx mirrors
// these exports for the browser, so screens import '../../ui/Skeleton' and the
// bundler picks the right one (Metro → this file, webpack → the .web one).
//
// Purpose: a bare spinner tells the user nothing. Blocking a screen with
// placeholders SHAPED LIKE the content that's coming makes the wait read as
// "this is loading" rather than "is this broken?", and the screen doesn't
// lurch when the data lands.

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

/** A row of stat tiles. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {Array.from({ length: count }, (_, i) => (
        // flexBasis (not flex-1) — in a wrapping row RN gives every flex:1
        // child its own line, which would stack the tiles vertically.
        <View key={i} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 140 }}>
          <SkeletonStat />
        </View>
      ))}
    </View>
  );
}

/** A generic content card: title bar + `lines` text lines. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ opacity }}
      className={`bg-card rounded-2xl border border-border-soft p-5 gap-3 ${className ?? ''}`}
    >
      <View className="h-3 w-1/4 rounded bg-border-soft" />
      {Array.from({ length: lines }, (_, i) => (
        // Ragged widths read as text; equal bars read as a table.
        <View key={i} className="h-3.5 rounded bg-border-soft" style={{ width: `${[92, 74, 83, 61, 88][i % 5]}%` }} />
      ))}
    </Animated.View>
  );
}

/** Detail-screen scaffold: title block, then children. */
export function SkeletonDetail({ children }: { children?: React.ReactNode }) {
  const opacity = usePulse();
  return (
    <View className="gap-5">
      <Animated.View style={{ opacity }} className="flex-row items-center gap-3">
        <View className="w-8 h-8 rounded-lg bg-border-soft" />
        <View className="gap-2">
          <View className="h-5 w-52 rounded bg-border-soft" />
          <View className="h-3 w-32 rounded bg-border-soft" />
        </View>
      </Animated.View>
      {children}
    </View>
  );
}

/** Placeholder for a chart card. */
export function SkeletonChart({ className }: { className?: string }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ opacity }}
      className={`bg-card rounded-2xl border border-border-soft p-5 gap-4 ${className ?? ''}`}
    >
      <View className="h-3 w-1/3 rounded bg-border-soft" />
      <View className="flex-row items-end gap-2" style={{ height: 128 }}>
        {[55, 80, 40, 95, 65, 72, 48, 88, 60, 76, 52, 84].map((h, i) => (
          <View key={i} className="flex-1 rounded-t bg-border-soft" style={{ height: `${h}%` }} />
        ))}
      </View>
    </Animated.View>
  );
}
