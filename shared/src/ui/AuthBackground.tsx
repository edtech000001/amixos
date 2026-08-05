import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, RadialGradient, Circle } from 'react-native-svg';
import { useThemeColors } from '../theme';

// Decorative backdrop for auth screens. Renders behind the scrollview so the
// form floats on a soft mesh of color instead of plain white. Colors come from
// the active theme so the backdrop follows light/dark mode — otherwise a
// dark-mode device gets a light backdrop behind dark inputs (invisible labels).
export function AuthBackground() {
  const c = useThemeColors();
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="authBgBase" x1="0%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor={c.surface} />
          <Stop offset="100%" stopColor={c.card} />
        </LinearGradient>
        <RadialGradient id="authBgBlob" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={c.border} stopOpacity="0.4" />
          <Stop offset="100%" stopColor={c.border} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBgBase)" />
      <Circle cx="90%" cy="15%" r="220" fill="url(#authBgBlob)" />
    </Svg>
  );
}
