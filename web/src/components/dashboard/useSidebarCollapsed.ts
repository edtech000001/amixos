'use client';

// One collapsed-state for BOTH left rails (global Sidebar + SettingsNav) so
// collapsing survives the drill-in to Settings and back. Persisted per
// browser; hydrated in an effect so SSR markup stays stable.

import { useEffect, useState } from 'react';

const KEY = 'amixos.sidebar.collapsed';

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1') setCollapsed(true);
  }, []);
  const toggle = () => {
    setCollapsed(prev => {
      if (typeof window !== 'undefined') window.localStorage.setItem(KEY, prev ? '0' : '1');
      return !prev;
    });
  };
  return [collapsed, toggle];
}
