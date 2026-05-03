import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, RadialGradient, Circle } from 'react-native-svg';

// Decorative pastel backdrop for auth screens. Renders behind the scrollview
// so the form floats on a soft mesh of color instead of plain white.
// All colors are very low-saturation so they stay subtle and don't fight
// the form content for attention.
export function AuthBackground() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="authBgBase" x1="0%" y1="0%" x2="50%" y2="100%">
          <Stop offset="0%" stopColor="#F8FAFC" />
          <Stop offset="100%" stopColor="#FFFFFF" />
        </LinearGradient>
        <RadialGradient id="authBgBlob" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#CBD5E1" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBgBase)" />
      <Circle cx="90%" cy="15%" r="220" fill="url(#authBgBlob)" />
    </Svg>
  );
}
