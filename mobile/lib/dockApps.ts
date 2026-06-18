// Catalog + helpers for the customizable mobile dock (bottom nav bar).
//
// The dock always shows Inicio (first) and Más (last). Between them the user
// picks from the apps below — up to MAX_DOCK_MIDDLE (so 6 tabs total), at least
// MIN_DOCK_MIDDLE. The choice is stored per user in profiles.dock_apps and
// applied in app/dashboard/_layout.tsx by flipping each route's `href`.

import { ClipboardList, Users, FileText, Calendar, UsersRound, type LucideIcon } from 'lucide-react-native';
import { can } from '@amixos/shared/lib/permissions';
import type { Role } from '@amixos/shared/lib/permissions';

/** Keys of the labels we read from t.dashboard.sidebar for each app. Only
 *  CORE apps belong here — modules (Inventario, Mapa, Archivos, …) are gated by
 *  activation and live in the module system, never the static dock catalog. */
export type DockLabelKey = 'trabajos' | 'clientes' | 'facturas' | 'calendario' | 'empleados';

export interface DockApp {
  /** Stable key persisted in profiles.dock_apps. */
  key: string;
  /** expo-router Tabs.Screen route name. */
  routeName: string;
  /** Navigation path used from the Más list (when the app isn't pinned). */
  path: string;
  Icon: LucideIcon;
  /** i18n key under t.dashboard.sidebar (label) AND t.dashboard.sidebar.descriptions. */
  labelKey: DockLabelKey;
  /** In the default dock (when the user hasn't customized it). */
  defaultOn: boolean;
  /** Role gate — omitted = visible to everyone. */
  gate?: (role: Role | null) => boolean;
}

/** Dock order is the catalog order (Inicio … these … Más). Selection only — the
 *  user can't reorder, just pick which appear. Apps NOT pinned to the dock are
 *  surfaced in the Más screen (via `path`) so nothing is ever unreachable. */
export const DOCK_APPS: DockApp[] = [
  { key: 'clientes', routeName: 'clientes/index', path: '/dashboard/clientes', Icon: Users, labelKey: 'clientes', defaultOn: true, gate: can.seeAllClients },
  { key: 'trabajos', routeName: 'trabajos/index', path: '/dashboard/trabajos', Icon: ClipboardList, labelKey: 'trabajos', defaultOn: true },
  { key: 'facturas', routeName: 'facturas/index', path: '/dashboard/facturas', Icon: FileText, labelKey: 'facturas', defaultOn: true, gate: can.seeInvoices },
  { key: 'calendario', routeName: 'mas/calendario', path: '/dashboard/mas/calendario', Icon: Calendar, labelKey: 'calendario', defaultOn: false, gate: can.seeAllJobs },
  { key: 'empleados', routeName: 'mas/empleados/index', path: '/dashboard/mas/empleados', Icon: UsersRound, labelKey: 'empleados', defaultOn: false, gate: can.seeEmployees },
];

/** Selectable middle apps: default 3 (Inicio + 3 + Más = 5), max 4 (= 6 total). */
export const MAX_DOCK_MIDDLE = 4;
export const MIN_DOCK_MIDDLE = 1;
export const DEFAULT_DOCK_KEYS: string[] = DOCK_APPS.filter(a => a.defaultOn).map(a => a.key);

const VALID_KEYS = new Set(DOCK_APPS.map(a => a.key));

/** Parse a stored dock_apps value into clean keys (drops unknown keys). Returns
 *  null when there's nothing usable, so the caller falls back to the default. */
export function parseDockKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k === 'string' && VALID_KEYS.has(k) && !out.includes(k)) out.push(k);
  }
  return out.length ? out : null;
}

/** Apps this role is allowed to see in the dock, in catalog order. */
export function eligibleDockApps(role: Role | null): DockApp[] {
  return DOCK_APPS.filter(a => !a.gate || a.gate(role));
}

/** Resolve the dock middle selection for a role: stored keys (or the default),
 *  filtered to what's eligible + visible, clamped to [MIN, MAX], in catalog
 *  order. Always returns at least one app. */
export function effectiveDockKeys(stored: string[] | null, role: Role | null): string[] {
  const eligible = eligibleDockApps(role);
  const eligibleKeys = new Set(eligible.map(a => a.key));
  const wanted = new Set((stored && stored.length ? stored : DEFAULT_DOCK_KEYS).filter(k => eligibleKeys.has(k)));
  // Catalog order, capped at MAX.
  let keys = eligible.filter(a => wanted.has(a.key)).map(a => a.key).slice(0, MAX_DOCK_MIDDLE);
  if (keys.length < MIN_DOCK_MIDDLE && eligible.length) {
    keys = eligible.slice(0, MIN_DOCK_MIDDLE).map(a => a.key);
  }
  return keys;
}
