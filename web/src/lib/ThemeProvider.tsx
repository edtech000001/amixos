'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeCtx {
  /** The user's stored preference. */
  theme: ThemePref;
  /** What's actually applied right now (system resolved to light/dark). */
  resolved: 'light' | 'dark';
  setTheme: (t: ThemePref) => void;
  /** Cycle light → dark (respecting current resolved state). */
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'amixos-theme';

// Inline script (see layout) writes .dark before paint using this same key/logic,
// so there's no flash. Keep the two in sync.
function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  return dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Hydrate from storage on mount (the no-flash script already applied the class).
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) ?? 'system';
    setThemeState(stored);
    setResolved(apply(stored));
  }, []);

  // Follow the OS when preference is 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemePref) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
    setResolved(apply(t));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  return <Ctx.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// The exact logic the no-flash script runs, as a string for the <script> tag.
export const NO_FLASH_SCRIPT = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
