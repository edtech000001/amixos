// Cross-platform theme colors for RN icons/SVGs (which take a `color` HEX prop,
// not a className). The platform ThemeProvider (mobile: NativeWind vars; web:
// .dark class) feeds the active palette into ThemeColorsProvider, and shared
// screens read it via useThemeColors() to color icons for the current theme.
//
// Keep these hexes in sync with the CSS variables in mobile/global.css and
// web/src/app/globals.css.

import { createContext, useContext } from 'react';

export const LIGHT_COLORS = {
  primary: '#2563EB',
  ink: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E2E8F0',
  borderSoft: '#F1F5F9',
  card: '#FFFFFF',
  surface: '#F8FAFC',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  white: '#FFFFFF',
};

export const DARK_COLORS: typeof LIGHT_COLORS = {
  primary: '#3B82F6',
  ink: '#F1F5F9',
  muted: '#94A3B8',
  faint: '#64748B',
  border: '#1E293B',
  borderSoft: '#1E293B',
  card: '#131C31',
  surface: '#0B1220',
  success: '#22C55E',
  danger: '#F87171',
  warning: '#F59E0B',
  white: '#FFFFFF',
};

export type ThemeColors = typeof LIGHT_COLORS;

const ThemeColorsContext = createContext<ThemeColors>(LIGHT_COLORS);

export const ThemeColorsProvider = ThemeColorsContext.Provider;

export function useThemeColors(): ThemeColors {
  return useContext(ThemeColorsContext);
}
