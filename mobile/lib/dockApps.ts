// Catalog + helpers for the customizable mobile dock (bottom nav bar).
//
// The dock always shows Inicio (first) and Más (last). Between them the user
// picks from the apps below — up to MAX_DOCK_MIDDLE (so 6 tabs total), at least
// MIN_DOCK_MIDDLE. The choice is stored per user in profiles.dock_apps and
// applied in app/dashboard/_layout.tsx by flipping each route's `href`.

import { ClipboardList, Users, FileText, Calendar, UsersRound, BarChart3, type LucideIcon } from 'lucide-react-native';
import { getModuleById } from '@amixos/shared/modules/registry';
import { can } from '@amixos/shared/lib/permissions';
import type { Role } from '@amixos/shared/lib/permissions';

/** Keys of the labels we read from t.dashboard.sidebar for each CORE app.
 *  Module apps (moduleId set) take their label from the module dictionary. */
export type DockLabelKey = 'trabajos' | 'clientes' | 'facturas' | 'calendario' | 'empleados' | 'reportes';

export interface DockApp {
  /** Stable key persisted in profiles.dock_apps. */
  key: string;
  /** expo-router Tabs.Screen route name. */
  routeName: string;
  /** Navigation path used from the Más list (when the app isn't pinned). */
  path: string;
  Icon: LucideIcon;
  /** CORE apps: i18n key under t.dashboard.sidebar (label) AND
   *  t.dashboard.sidebar.descriptions. Omitted for module apps. */
  labelKey?: DockLabelKey;
  /** MODULE apps: the module this is. Pinnable only while the business has
   *  that module enabled AND available (see useDockApps). */
  moduleId?: string;
  /** In the default dock (when the user hasn't customized it). */
  defaultOn: boolean;
  /** Role gate — omitted = visible to everyone. */
  gate?: (role: Role | null) => boolean;
}

/** Dock order is the catalog order (Inicio … these … Más). Selection only — the
 *  user can't reorder, just pick which appear. Apps NOT pinned to the dock are
 *  surfaced in the Más screen (via `path`) so nothing is ever unreachable. */
// routeName is the Tabs.Screen name. Sections with a nested Stack (their own
// _layout) register the FOLDER as one tab — so the name is the folder, not the
// `/index` leaf (e.g. 'facturas', not 'facturas/index').
export const DOCK_APPS: DockApp[] = [
  { key: 'clientes', routeName: 'clientes', path: '/dashboard/clientes', Icon: Users, labelKey: 'clientes', defaultOn: true, gate: can.seeAllClients },
  { key: 'trabajos', routeName: 'trabajos', path: '/dashboard/trabajos', Icon: ClipboardList, labelKey: 'trabajos', defaultOn: true },
  { key: 'facturas', routeName: 'facturas', path: '/dashboard/facturas', Icon: FileText, labelKey: 'facturas', defaultOn: true, gate: can.seeInvoices },
  { key: 'calendario', routeName: 'calendario', path: '/dashboard/calendario', Icon: Calendar, labelKey: 'calendario', defaultOn: false, gate: can.seeAllJobs },
  { key: 'empleados', routeName: 'empleados', path: '/dashboard/empleados', Icon: UsersRound, labelKey: 'empleados', defaultOn: false, gate: can.seeEmployees },
  { key: 'reportes', routeName: 'reportes', path: '/dashboard/reportes', Icon: BarChart3, labelKey: 'reportes', defaultOn: false, gate: can.seeReports },
  // Modules — only offered to businesses that have them enabled (and roles
  // that can see them). Each has a dashboard-level tab route (app/dashboard/
  // <key>.tsx) for when it's pinned; unpinned, Más opens mas/modulos/<id>.
  ...(['map', 'files', 'equipment', 'inventory', 'rentals'] as const).map((id): DockApp => ({
    key: id,
    routeName: id,
    path: `/dashboard/${id}`,
    Icon: getModuleById(id)!.icon as LucideIcon,
    moduleId: id,
    defaultOn: false,
    gate: id === 'equipment' ? can.viewEquipment : id === 'rentals' ? can.viewRentals : undefined,
  })),
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

/** Apps this role is allowed to see in the dock, in catalog order. Module
 *  apps also need their module live for the business (`liveModules`: ids of
 *  enabled + available modules — pass it, or modules are never eligible). */
export function eligibleDockApps(role: Role | null, liveModules?: ReadonlySet<string>): DockApp[] {
  return DOCK_APPS.filter(a =>
    (!a.gate || a.gate(role)) && (!a.moduleId || !!liveModules?.has(a.moduleId)));
}

/** Display name for a dock app: sidebar label for core apps, the module's
 *  name for module apps. */
export function dockAppLabel(
  app: DockApp,
  sidebar: Record<string, unknown>,
  modules: Record<string, { name?: string } | undefined>,
): string {
  if (app.labelKey) return String(sidebar[app.labelKey] ?? app.key);
  const def = app.moduleId ? getModuleById(app.moduleId) : null;
  return (def && modules[def.i18nKey]?.name) || app.key;
}

/** Resolve the dock middle selection for a role: stored keys (or the default),
 *  filtered to what's eligible + visible, clamped to [MIN, MAX]. Preserves the
 *  STORED ORDER — the user drags to reorder in Ajustes → Navegación and the dock
 *  honors it. Falls back to default (catalog) order when nothing is stored.
 *  Always returns at least one app. */
export function effectiveDockKeys(stored: string[] | null, role: Role | null, liveModules?: ReadonlySet<string>): string[] {
  const eligible = eligibleDockApps(role, liveModules);
  const eligibleKeys = new Set(eligible.map(a => a.key));
  const source = stored && stored.length ? stored : DEFAULT_DOCK_KEYS;
  // Keep the source order; drop ineligible/duplicate keys; cap at MAX.
  const keys: string[] = [];
  for (const k of source) {
    if (eligibleKeys.has(k) && !keys.includes(k)) keys.push(k);
    if (keys.length >= MAX_DOCK_MIDDLE) break;
  }
  if (keys.length < MIN_DOCK_MIDDLE && eligible.length) {
    return eligible.slice(0, MIN_DOCK_MIDDLE).map(a => a.key);
  }
  return keys;
}
