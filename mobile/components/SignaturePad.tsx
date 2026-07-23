import { useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Draw-to-sign pad for in-person estimate signing. Strokes are captured with
// PanResponder and rendered as SVG paths (react-native-svg — already a
// dependency, so no native rebuild). After each finished stroke it reports a
// self-contained `data:image/svg+xml;utf8,` data-URL (null when cleared):
// tiny, renders in a plain <img> on web, and the job detail decodes it back
// into SvgXml for native display.
export function SignaturePad({ height = 180, hint, clearLabel, onChange }: {
  height?: number;
  hint: string;
  clearLabel: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  // Mirror of `paths` so finishStroke can compute the next value in the
  // event handler itself — notifying the parent from inside a setState
  // updater triggers React's "cannot update while rendering" warning.
  const pathsRef = useRef<string[]>([]);
  const [livePath, setLivePath] = useState('');
  const current = useRef('');
  const size = useRef({ w: 300, h: height });
  // Latest onChange without re-creating the PanResponder.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const toDataUrl = (allPaths: string[]) => {
    if (allPaths.length === 0) return null;
    const { w, h } = size.current;
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      allPaths
        .map(d => `<path d="${d}" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join('') +
      '</svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(xml)}`;
  };

  const finishStroke = () => {
    const stroke = current.current;
    current.current = '';
    setLivePath('');
    if (!stroke) return;
    const next = [...pathsRef.current, stroke];
    pathsRef.current = next;
    setPaths(next);
    onChangeRef.current(toDataUrl(next));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Don't let a parent ScrollView steal mid-signature drags.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        // Leading dot so a single tap still leaves ink.
        current.current = `M ${x.toFixed(1)} ${y.toFixed(1)} L ${(x + 0.1).toFixed(1)} ${(y + 0.1).toFixed(1)}`;
        setLivePath(current.current);
      },
      onPanResponderMove: e => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        setLivePath(current.current);
      },
      onPanResponderRelease: () => finishStroke(),
      onPanResponderTerminate: () => finishStroke(),
    }),
  ).current;

  const clear = () => {
    current.current = '';
    setLivePath('');
    pathsRef.current = [];
    setPaths([]);
    onChangeRef.current(null);
  };

  const hasInk = paths.length > 0 || livePath !== '';
  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      className="bg-white border border-border rounded-xl overflow-hidden"
      {...responder.panHandlers}
    >
      <Svg width="100%" height="100%">
        {paths.map((d, i) => (
          <Path key={i} d={d} fill="none" stroke="#111827" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {livePath ? (
          <Path d={livePath} fill="none" stroke="#111827" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </Svg>
      {!hasInk ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Text className="text-sm text-gray-300">{hint}</Text>
        </View>
      ) : (
        <Pressable
          onPress={clear}
          className="absolute top-2 right-2 bg-white/80 px-2 py-1 rounded-lg border border-border"
        >
          <Text className="text-xs text-muted">{clearLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
