'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/ThemeProvider';

/** Sun/moon button that flips light↔dark. Placed in the dashboard sidebar. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center justify-center w-9 h-9 rounded-xl border border-border text-muted hover:text-ink hover:bg-surface transition-colors ${className}`}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
