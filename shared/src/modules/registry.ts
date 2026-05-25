// Static registry of all available industry modules. This is the canonical
// list used by:
//   - the Addon Store ("Tienda de Módulos") to render the toggle list
//   - useEnabledModules() to filter business_modules rows down to known IDs
//   - dynamic navigation (sidebar / Más list) to render an entry per enabled
//     module with the right icon + i18n label
//
// To add a new module:
//   1. Add an entry below (assign a stable `id` — that's also the URL segment)
//   2. Add the matching `modules.list.<id>.{name, description}` to dashboard
//      dict (shared/src/i18n/dict/dashboard.ts)
//   3. When the module is ready to use, flip its `status` to 'available'
//      AND register a real component in:
//        web/src/app/dashboard/modulos/[moduleId]/page.tsx (MODULE_COMPONENTS)
//        mobile/app/dashboard/mas/modulos/[moduleId].tsx (MODULE_COMPONENTS)

import type { LucideIcon } from 'lucide-react-native';
import {
  Wrench,
  Scissors,
  Trees,
  Utensils,
  Sparkles,
  Hammer,
} from 'lucide-react-native';

export type ModuleStatus = 'available' | 'coming_soon';

export interface ModuleDef {
  // Stable canonical key. Also the URL segment
  // (/dashboard/modulos/<id> on web, /dashboard/mas/modulos/<id> on mobile).
  id: string;
  // Used for sidebar entries + store cards.
  icon: LucideIcon;
  // Hex color for the module's accent (icon background, badges).
  color: string;
  // 'available' = real implementation exists, can be enabled.
  // 'coming_soon' = scaffolded but not built yet; shown in the store with a
  // disabled toggle so users know it's planned.
  status: ModuleStatus;
  // Lookup key for translated name + description. The dict shape is:
  //   t.dashboard.modules.list.<i18nKey>.{ name, description }
  // Same value as `id` for simplicity, but kept as a separate field in case
  // we ever want to rename an id without invalidating i18n.
  i18nKey: string;
}

export const MODULE_REGISTRY: ModuleDef[] = [
  { id: 'mechanic',     icon: Wrench,    color: '#3B82F6', status: 'coming_soon', i18nKey: 'mechanic' },
  { id: 'salon',        icon: Scissors,  color: '#EC4899', status: 'coming_soon', i18nKey: 'salon' },
  { id: 'landscaping',  icon: Trees,     color: '#10B981', status: 'coming_soon', i18nKey: 'landscaping' },
  { id: 'restaurant',   icon: Utensils,  color: '#F59E0B', status: 'coming_soon', i18nKey: 'restaurant' },
  { id: 'cleaning',     icon: Sparkles,  color: '#8B5CF6', status: 'coming_soon', i18nKey: 'cleaning' },
  { id: 'construction', icon: Hammer,    color: '#EF4444', status: 'coming_soon', i18nKey: 'construction' },
];

export function getModuleById(id: string): ModuleDef | null {
  return MODULE_REGISTRY.find(m => m.id === id) ?? null;
}
