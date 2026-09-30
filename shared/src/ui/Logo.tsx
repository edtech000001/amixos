// The Amixos wordmark — icon plus name, as one image.
//
// Two lockups (stacked / side-by-side) x two ink colours. The ink is picked
// from the active theme by default, since black text vanishes on the dark
// palette and white text vanishes on the light one. Screens that sit on a
// fixed-colour surface regardless of theme — the login hero's blue gradient —
// pass `ink` explicitly instead.
//
// Assets come from shared/src/assets so ONE component serves both apps; the
// web variant (Logo.web.tsx) reads the same files from web/public because
// react-native-web cannot consume Metro's require() of a PNG. Both copies are
// emitted by scripts/build-icons.py, so they cannot drift.

import { Image, View } from 'react-native';
import { useIsDarkTheme } from '../theme';

// Intrinsic sizes of the generated PNGs, used to hold the aspect ratio without
// a second layout pass.
const RATIO = { stacked: 720 / 593, side: 1080 / 305 };

const SOURCES = {
  stacked: {
    black: require('../assets/logo-stacked-black.png'),
    white: require('../assets/logo-stacked-white.png'),
  },
  side: {
    black: require('../assets/logo-side-black.png'),
    white: require('../assets/logo-side-white.png'),
  },
};

export interface LogoProps {
  /** Icon above the name (default) or beside it. */
  variant?: 'stacked' | 'side';
  /** Rendered width; height follows the lockup's aspect ratio. */
  width?: number;
  /** Override the theme-derived ink — for surfaces with a fixed colour. */
  ink?: 'black' | 'white';
}

export function Logo({ variant = 'stacked', width = 160, ink }: LogoProps) {
  const isDark = useIsDarkTheme();
  const resolved = ink ?? (isDark ? 'white' : 'black');

  return (
    <View style={{ width, height: width / RATIO[variant] }}>
      <Image
        source={SOURCES[variant][resolved]}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
        accessibilityLabel="Amixos"
      />
    </View>
  );
}
