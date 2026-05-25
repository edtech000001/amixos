// Loads + maintains the list of enabled modules for the active business.
//
// Why a custom hook (not a context): module enable/disable is an admin-only
// edit, infrequent. Each consumer (sidebar, Más list, Store page) fetches
// independently — the network cost is negligible (a single row-set per
// business). Optimizing into a shared context can come later if needed.
//
// The hook joins business_modules (state) with MODULE_REGISTRY (manifest):
// rows whose module_key isn't in the registry are silently dropped. That
// way stale onboarding rows (serviceType / inventory / voip) don't crash
// the app; they're just invisible.

import { useEffect, useState, useCallback } from 'react';
import { MODULE_REGISTRY, getModuleById, type ModuleDef } from './registry';

// Minimal supabase-like shape — same approach as logAudit. Keeps this hook
// platform-agnostic (works with web + mobile supabase clients).
type AnySupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface UseEnabledModulesResult {
  modules: ModuleDef[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useEnabledModules(
  supabase: AnySupabase | null,
  businessId: string | null,
): UseEnabledModulesResult {
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !businessId) {
      setModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('business_modules')
        .select('module_key')
        .eq('business_id', businessId)
        .eq('is_active', true);
      const keys = ((data ?? []) as Array<{ module_key: string }>).map(r => r.module_key);
      // Preserve manifest order, drop unknown keys.
      const enabled = MODULE_REGISTRY.filter(m => keys.includes(m.id));
      setModules(enabled);
    } catch {
      setModules([]);
    }
    setLoading(false);
  }, [supabase, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { modules, loading, refetch: load };
}

// Pure helper for one-off lookups (no React state). Used by the Addon Store
// page when it needs to derive a row's `is_active` from a freshly-fetched
// list without re-running the hook.
export async function fetchEnabledModules(
  supabase: AnySupabase,
  businessId: string,
): Promise<ModuleDef[]> {
  const { data } = await supabase
    .from('business_modules')
    .select('module_key')
    .eq('business_id', businessId)
    .eq('is_active', true);
  const keys = ((data ?? []) as Array<{ module_key: string }>).map(r => r.module_key);
  return MODULE_REGISTRY
    .map(m => getModuleById(m.id))
    .filter((m): m is ModuleDef => !!m && keys.includes(m.id));
}
