import { useEffect, useState } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useApp } from '@/lib/AppContext';
import { useDockStore } from '@/lib/dockStore';
import { DOCK_APPS, effectiveDockKeys } from '@/lib/dockApps';

// Dock-eligible app routes → their stable key. Routes NOT in here (Inicio, Más,
// pushed detail screens) are never selection-filtered.
const APP_KEY_BY_ROUTE = new Map(DOCK_APPS.map(a => [a.routeName, a.key]));

// Sort rank for dock tabs: Inicio pinned first, Más pinned last, middle apps
// ordered by their position in the user's saved selection (orderedKeys).
function dockRank(routeName: string, orderedKeys: string[]): number {
  if (routeName === 'index') return -1;
  if (routeName === 'mas/index') return Number.MAX_SAFE_INTEGER;
  const key = APP_KEY_BY_ROUTE.get(routeName);
  const i = key ? orderedKeys.indexOf(key) : -1;
  return i >= 0 ? i : orderedKeys.length; // unknown → just before Más
}

// Visual constants. Tweak here to retune the dock's silhouette.
const BAR_HEIGHT = 50;
const BUBBLE_SIZE = 44;
// Notch radius needs to be ≥ bubble radius so bubble fits cleanly in the
// scoop. Slight margin (1–2px) gives a tiny visual breathing room.
const NOTCH_RADIUS = 24;
// Smaller flank = tighter, more circular notch. Larger = wider easing.
const NOTCH_FLANK = 4;
const CORNER_RADIUS = 12;
const BAR_FILL = '#1F2937';
const BUBBLE_FILL = '#4F46E5';
const ICON_INACTIVE = '#9CA3AF';
const ICON_ACTIVE = '#FFFFFF';

// Bubble + notch can't sit inside the rounded corners (visually disconnects).
// When a tab's natural flex-1 center falls inside that zone, clamp the
// bubble's position. Touch areas are NOT inset — icons span the full bar
// width so they're properly spread across the dock.
const SAFE_EDGE = CORNER_RADIUS + NOTCH_RADIUS + NOTCH_FLANK;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function AnimatedDock({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { currentRole } = useApp();
  // The user's dock-app selection — applied here (not via route href) so
  // toggling apps is a cheap dock re-render, not a tab-navigator reconfigure.
  const dockKeys = useDockStore(s => s.keys);
  // Ordered (not just a Set) so the dock renders apps in the user's chosen
  // order. orderedKeys is the middle selection; Inicio stays first, Más last.
  const orderedKeys = effectiveDockKeys(dockKeys, currentRole);
  const selectedApps = new Set(orderedKeys);

  // expo-router puts hidden screens (href: null) into state.routes too. It
  // marks them by setting tabBarButton: () => null AND tabBarItemStyle:
  // { display: 'none' }. Filter both — the `href` option itself isn't
  // forwarded to the descriptor's options. Then drop dock-eligible apps the
  // user hasn't selected (they stay registered + reachable from Más).
  const visibleRoutes = state.routes
    .filter(r => {
      const opts = descriptors[r.key].options as {
        tabBarButton?: unknown;
        tabBarItemStyle?: { display?: string } | { display?: string }[];
      };
      if (opts.tabBarButton) return false;
      const style = opts.tabBarItemStyle;
      if (Array.isArray(style)) {
        if (style.some(s => s?.display === 'none')) return false;
      } else if (style?.display === 'none') {
        return false;
      }
      const appKey = APP_KEY_BY_ROUTE.get(r.name);
      if (appKey && !selectedApps.has(appKey)) return false;
      return true;
    })
    // Order: Inicio (index) first → middle apps in the user's saved order → Más
    // (mas/index) last. state.routes is in catalog/registration order, so the
    // middle needs re-sorting to honor the user's drag-reorder.
    .sort((a, b) => dockRank(a.name, orderedKeys) - dockRank(b.name, orderedKeys));

  const activeRoute = state.routes[state.index];
  // Highlight the tab the active route belongs to. Several visible tabs can now
  // share a path root (e.g. mas/index + mas/calendario), so we match by the
  // LONGEST shared path prefix, not just the first segment:
  //   - exact key match wins (the active route is itself a tab),
  //   - else the visible tab sharing the most leading segments (so
  //     trabajos/[id] → the Trabajos tab, mas/empleados/[id] → Empleados),
  //   - else (no real match — e.g. Facturas opened from Más when it isn't
  //     pinned, or any mas/* child like Ajustes/Tienda) highlight the "Más" hub
  //     it was reached through, instead of defaulting to the first tab.
  const aSegs = (activeRoute?.name ?? '').split('/');
  const sharedLen = (name: string | undefined) => {
    const s = (name ?? '').split('/');
    let i = 0;
    while (i < s.length && i < aSegs.length && s[i] === aSegs[i]) i++;
    return i;
  };
  let matched = visibleRoutes.findIndex(r => r.key === activeRoute?.key);
  if (matched < 0) {
    let best = 0;
    visibleRoutes.forEach((r, i) => {
      const len = sharedLen(r.name);
      if (len > best) { best = len; matched = i; }
    });
    // No prefix match (best 0), or an ambiguous mas/* child (best 1 under mas) →
    // fall back to the Más hub. A real app match (e.g. clientes/[id] → Clientes,
    // best 1 under a non-mas segment) is kept as-is.
    if (best === 0 || (best === 1 && aSegs[0] === 'mas')) {
      const masIdx = visibleRoutes.findIndex(r => r.name === 'mas/index');
      if (masIdx >= 0) matched = masIdx;
    }
  }
  const activeIndex = matched >= 0 ? matched : 0;

  const [barWidth, setBarWidth] = useState(0);
  const numTabs = Math.max(1, visibleRoutes.length);
  const tabWidth = barWidth / numTabs;
  // Natural icon center (flex-1 distribution across full bar width)
  const iconCenter = activeIndex * tabWidth + tabWidth / 2;
  // Clamp bubble + notch into the bar's straight section. For middle tabs
  // this is a no-op; only first/last get a few px of inset.
  const minX = SAFE_EDGE;
  const maxX = Math.max(minX, barWidth - SAFE_EDGE);
  const targetX = Math.max(minX, Math.min(maxX, iconCenter));

  const notchX = useSharedValue(targetX);

  useEffect(() => {
    if (!barWidth) return;
    notchX.value = withSpring(targetX, { damping: 18, stiffness: 200, mass: 0.7 });
  }, [targetX, barWidth, notchX]);

  const animatedPathProps = useAnimatedProps(() => {
    'worklet';
    const w = barWidth;
    const h = BAR_HEIGHT;
    const cornerR = CORNER_RADIUS;
    const notchR = NOTCH_RADIUS;
    const flank = NOTCH_FLANK;

    // Clamp the notch so it never crosses the rounded corners.
    const minX = cornerR + notchR + flank;
    const maxX = Math.max(minX, w - cornerR - notchR - flank);
    const x = Math.max(minX, Math.min(maxX, notchX.value));

    // Top-rounded corners (visible boundary with content above), notched top
    // edge for the bubble, and SQUARE bottom corners — the bottom merges
    // seamlessly with the solid-color safe-area filler below.
    const d =
      `M ${cornerR},0` +
      ` L ${x - notchR - flank},0` +
      ` Q ${x - notchR},0 ${x - notchR + 2},${flank}` +
      ` A ${notchR},${notchR} 0 0 0 ${x + notchR - 2},${flank}` +
      ` Q ${x + notchR},0 ${x + notchR + flank},0` +
      ` L ${w - cornerR},0` +
      ` Q ${w},0 ${w},${cornerR}` +
      ` L ${w},${h}` +
      ` L 0,${h}` +
      ` L 0,${cornerR}` +
      ` Q 0,0 ${cornerR},0` +
      ` Z`;

    return { d };
  });

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: notchX.value - BUBBLE_SIZE / 2 }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== barWidth) {
      setBarWidth(w);
      // Snap to current position on first layout so bubble doesn't fly in.
      const tw = w / numTabs;
      const c = activeIndex * tw + tw / 2;
      notchX.value = Math.max(SAFE_EDGE, Math.min(w - SAFE_EDGE, c));
    }
  };

  const activeVisibleRoute = visibleRoutes[activeIndex];
  const activeIcon = activeVisibleRoute
    ? descriptors[activeVisibleRoute.key].options.tabBarIcon
    : undefined;

  return (
    <View
      onLayout={handleLayout}
      style={{
        position: 'absolute',
        // Anchored to the screen bottom — covers the safe area too, so no
        // dashboard content is visible behind/below the dock.
        bottom: 0,
        left: 0,
        right: 0,
        height: BAR_HEIGHT + BUBBLE_SIZE / 2 + insets.bottom,
      }}
      pointerEvents="box-none"
    >
      {/* Solid filler covering the safe area below the bar. Same color as
          BAR_FILL so it merges seamlessly with the SVG bar above it. */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: insets.bottom,
          backgroundColor: BAR_FILL,
        }}
        pointerEvents="none"
      />

      {/* Bar SVG sits above the safe-area filler */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
        }}
        pointerEvents="none"
      >
        <Svg width="100%" height={BAR_HEIGHT}>
          <AnimatedPath animatedProps={animatedPathProps} fill={BAR_FILL} />
        </Svg>
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom,
          left: 0,
          right: 0,
          height: BAR_HEIGHT,
          flexDirection: 'row',
        }}
      >
        {visibleRoutes.map((route, i) => {
          const Icon = descriptors[route.key].options.tabBarIcon;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) {
              // React Navigation's `navigate` is heavily overloaded on the route
              // name; with mobile's `strict: false` the per-name typing falls
              // through to a `never` parameter. Cast to a loose signature so
              // the dynamic route.name + route.params flow compiles.
              (navigation.navigate as (name: string, params?: object) => void)(
                route.name,
                route.params,
              );
            }
          };
          const isActive = i === activeIndex;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              {!isActive && Icon
                ? Icon({ color: ICON_INACTIVE, size: 22, focused: false })
                : null}
            </Pressable>
          );
        })}
      </View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          },
          bubbleStyle,
        ]}
        pointerEvents="none"
      >
        <View
          style={{
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            borderRadius: BUBBLE_SIZE / 2,
            backgroundColor: BUBBLE_FILL,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: BUBBLE_FILL,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          {activeIcon
            ? activeIcon({ color: ICON_ACTIVE, size: 24, focused: true })
            : null}
        </View>
      </Animated.View>
    </View>
  );
}
