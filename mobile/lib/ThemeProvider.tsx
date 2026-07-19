import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, vars } from 'nativewind';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeCtx {
  /** Stored preference. */
  theme: ThemePref;
  /** What's actually applied right now (system resolved to light/dark). */
  resolved: 'light' | 'dark';
  setTheme: (t: ThemePref) => void;
  /** Flip light ↔ dark. */
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'amixos-theme';

// The token values per theme (RGB channel triplets — same as global.css / web).
// On native there's no `.dark` class to activate the `.dark {}` CSS block, so
// NativeWind switches CSS variables by applying them to a root View via vars().
const TRIPLETS = {
  light: {
    '--color-primary': '37 99 235',
    '--color-primary-dark': '29 78 216',
    '--color-primary-light': '96 165 250',
    '--color-surface': '248 250 252',
    '--color-card': '255 255 255',
    '--color-elevated': '255 255 255',
    '--color-border': '226 232 240',
    '--color-border-soft': '241 245 249',
    '--color-ink': '15 23 42',
    '--color-muted': '100 116 139',
    '--color-faint': '148 163 184',
    '--color-success': '22 163 74',
    '--color-danger': '220 38 38',
    '--color-warning': '217 119 6',
  },
  dark: {
    '--color-primary': '59 130 246',
    '--color-primary-dark': '37 99 235',
    '--color-primary-light': '96 165 250',
    '--color-surface': '11 18 32',
    '--color-card': '19 28 49',
    '--color-elevated': '26 37 61',
    '--color-border': '30 41 59',
    '--color-border-soft': '30 41 59',
    '--color-ink': '241 245 249',
    '--color-muted': '148 163 184',
    '--color-faint': '100 116 139',
    '--color-success': '34 197 94',
    '--color-danger': '248 113 113',
    '--color-warning': '245 158 11',
  },
} as const;

const THEME_VARS = { light: vars(TRIPLETS.light), dark: vars(TRIPLETS.dark) };

function resolvePref(p: ThemePref): 'light' | 'dark' {
  if (p === 'system') return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  return p;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolvePref('system'));

  // Restore the saved preference on launch (NativeWind doesn't persist it).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        const p = (v as ThemePref | null) ?? 'system';
        setThemeState(p);
        setResolved(resolvePref(p));
        colorScheme.set(p); // keeps `dark:` variants in sync
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    setResolved(resolvePref(t));
    colorScheme.set(t);
    AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
  }, []);

  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme]);

  return (
    <Ctx.Provider value={{ theme, resolved, setTheme, toggle }}>
      {/* Applies the theme's CSS variables to the whole tree — this is what
          actually flips bg-card / text-ink / etc. on native. */}
      <View style={THEME_VARS[resolved]} className="flex-1">
        {children}
      </View>
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// RN icons/SVGs take a `color` HEX prop (not a className), so they can't use
// the semantic Tailwind tokens. This resolves the same palette to hex values
// for the active theme — use for icon colors, StatusBar, etc.
const LIGHT = {
  primary: '#2563EB', ink: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  border: '#E2E8F0', borderSoft: '#F1F5F9', card: '#FFFFFF', surface: '#F8FAFC',
  success: '#16A34A', danger: '#DC2626', warning: '#D97706',
};
const DARK = {
  primary: '#3B82F6', ink: '#F1F5F9', muted: '#94A3B8', faint: '#64748B',
  border: '#1E293B', borderSoft: '#1E293B', card: '#131C31', surface: '#0B1220',
  success: '#22C55E', danger: '#F87171', warning: '#F59E0B',
};

export function useThemeColors() {
  const { resolved } = useTheme();
  return resolved === 'dark' ? DARK : LIGHT;
}
