// Horizontal chip/filter row with a scroll affordance (native only — web chip
// rows wrap instead of scrolling). Whether a chip happens to be cut off at the
// screen edge depends on width + label language, so users often don't realize
// the row scrolls. A small chevron badge floats at the right edge while chips
// are hidden off-screen and vanishes once scrolled to the end.
//
// `activeIndex` additionally scrolls the selected chip into view. Without it a
// filter applied earlier (or restored with the screen) can sit off-screen, so
// the list shows "0 found" with no visible reason — the chip explaining it is
// past the right edge.

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '../theme';

/** Gap left between the viewport edge and the chip when scrolling it in, so it
 *  doesn't land flush against the edge looking half-cut. */
const EDGE_PAD = 16;

export function ChipScroll({
  className,
  contentContainerClassName,
  contentContainerStyle,
  activeIndex,
  children,
}: {
  /** Outer wrapper classes (margins etc.) — was the ScrollView's className. */
  className?: string;
  contentContainerClassName?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Index of the chip to reveal (0-based, counting every child). Null/omitted
   *  leaves the scroll position alone. */
  activeIndex?: number | null;
  children: ReactNode;
}) {
  const c = useThemeColors();
  const [hint, setHint] = useState(false);
  const dims = useRef({ content: 0, layout: 0, x: 0 });
  const scrollRef = useRef<ScrollView>(null);
  // Child positions, filled in by onLayout as each chip measures.
  const spots = useRef<Record<number, { x: number; w: number }>>({});
  const activeRef = useRef<number | null>(activeIndex ?? null);
  activeRef.current = activeIndex ?? null;

  const recalc = () => {
    const { content, layout, x } = dims.current;
    setHint(content - layout > 12 && x + layout < content - 12);
  };

  // Reveal the active chip if it's outside the viewport. Called from the effect
  // AND from onContentSizeChange, because on first render the effect usually
  // runs before any child has measured.
  const reveal = useCallback(() => {
    const i = activeRef.current;
    if (i == null) return;
    const spot = spots.current[i];
    const { layout, x: offset } = dims.current;
    if (!spot || !layout) return;
    const visibleFrom = offset;
    const visibleTo = offset + layout;
    if (spot.x >= visibleFrom && spot.x + spot.w <= visibleTo) return; // already shown
    const target = spot.x + spot.w > visibleTo
      ? spot.x + spot.w - layout + EDGE_PAD // off the right edge
      : spot.x - EDGE_PAD;                  // off the left edge
    scrollRef.current?.scrollTo({ x: Math.max(0, target), animated: true });
  }, []);

  useEffect(() => { reveal(); }, [activeIndex, reveal]);

  return (
    <View className={className}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={contentContainerClassName}
        contentContainerStyle={contentContainerStyle}
        scrollEventThrottle={32}
        onScroll={e => { dims.current.x = e.nativeEvent.contentOffset.x; recalc(); }}
        onContentSizeChange={w => { dims.current.content = w; recalc(); reveal(); }}
        onLayout={e => { dims.current.layout = e.nativeEvent.layout.width; recalc(); }}
      >
        {/* Each chip is wrapped so its x can be measured. The wrapper shrinks to
           the chip, so the row's gap and layout are unchanged. */}
        {Children.map(children, (child, i) => (
          <View
            onLayout={e => {
              const { x, width } = e.nativeEvent.layout;
              spots.current[i] = { x, w: width };
              if (i === activeRef.current) reveal();
            }}
          >
            {child}
          </View>
        ))}
      </ScrollView>
      {hint ? (
        <View pointerEvents="none" className="absolute right-0 top-0 bottom-0 justify-center">
          <View
            className="w-6 h-6 rounded-full bg-card border border-border-soft items-center justify-center"
            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: -1, height: 1 }, elevation: 3 }}
          >
            <ChevronRight size={15} color={c.muted} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
