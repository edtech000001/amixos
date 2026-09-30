// Web half of <Logo> — see Logo.tsx for the why.
//
// A plain <img> against web/public rather than react-native's Image: Next
// serves those files statically, and going through react-native-web's Image
// would mean bundling the PNG through webpack for no benefit.

import { useIsDarkTheme } from '../theme';

const RATIO = { stacked: 720 / 593, side: 1080 / 305 };

export interface LogoProps {
  variant?: 'stacked' | 'side';
  width?: number;
  ink?: 'black' | 'white';
}

export function Logo({ variant = 'stacked', width = 160, ink }: LogoProps) {
  const isDark = useIsDarkTheme();
  const resolved = ink ?? (isDark ? 'white' : 'black');

  return (
    <img
      src={`/logo-${variant}-${resolved}.png`}
      alt="Amixos"
      width={width}
      height={width / RATIO[variant]}
      style={{ objectFit: 'contain' }}
    />
  );
}
