// Horizontal chip/filter row with a scroll affordance (native only — web chip
// rows wrap instead of scrolling). Whether a chip happens to be cut off at the
// screen edge depends on width + label language, so users often don't realize
// the row scrolls. A small chevron badge floats at the right edge while chips
// are hidden off-screen and vanishes once scrolled to the end.

import { useRef, useState, type ReactNode } from 'react';
import { View, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '../theme';

export function ChipScroll({
  className,
  contentContainerClassName,
  contentContainerStyle,
  children,
}: {
  /** Outer wrapper classes (margins etc.) — was the ScrollView's className. */
  className?: string;
  contentContainerClassName?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const c = useThemeColors();
  const [hint, setHint] = useState(false);
  const dims = useRef({ content: 0, layout: 0, x: 0 });
  const recalc = () => {
    const { content, layout, x } = dims.current;
    setHint(content - layout > 12 && x + layout < content - 12);
  };
  return (
    <View className={className}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={contentContainerClassName}
        contentContainerStyle={contentContainerStyle}
        scrollEventThrottle={32}
        onScroll={e => { dims.current.x = e.nativeEvent.contentOffset.x; recalc(); }}
        onContentSizeChange={w => { dims.current.content = w; recalc(); }}
        onLayout={e => { dims.current.layout = e.nativeEvent.layout.width; recalc(); }}
      >
        {children}
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
