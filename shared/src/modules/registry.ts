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
  MapPin,
  Building2,
  Award,
  Dumbbell,
  FolderOpen,
  HandCoins,
  Forklift,
  PartyPopper,
  Car,
  Package,
} from 'lucide-react-native';

export type ModuleStatus = 'available' | 'coming_soon';

// Broad grouping so the addon-store filter chips stay short. Add a new
// category here when the catalog grows enough to justify it (e.g.
// 'finance', 'marketing', 'communication'). Keep them mutually
// exclusive — a module picks one.
export type ModuleCategory = 'tools' | 'industry';

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
  // Drives the category-filter chips in the addon store.
  category: ModuleCategory;
}

export const MODULE_REGISTRY: ModuleDef[] = [
  // Map is the first real module — a universally useful surface (every
  // business benefits from seeing their pins on a map) so it leads the
  // list. Mechanic/Salon/etc. are industry-specific placeholders.
  { id: 'map',          icon: MapPin,    color: '#0EA5E9', status: 'available',   i18nKey: 'map',          category: 'tools' },
  { id: 'mechanic',     icon: Wrench,    color: '#3B82F6', status: 'coming_soon', i18nKey: 'mechanic',     category: 'industry' },
  { id: 'salon',        icon: Scissors,  color: '#EC4899', status: 'coming_soon', i18nKey: 'salon',        category: 'industry' },
  { id: 'landscaping',  icon: Trees,     color: '#10B981', status: 'coming_soon', i18nKey: 'landscaping',  category: 'industry' },
  { id: 'restaurant',   icon: Utensils,  color: '#F59E0B', status: 'coming_soon', i18nKey: 'restaurant',   category: 'industry' },
  { id: 'cleaning',     icon: Sparkles,  color: '#8B5CF6', status: 'coming_soon', i18nKey: 'cleaning',     category: 'industry' },
  { id: 'construction', icon: Hammer,    color: '#F97316', status: 'coming_soon', i18nKey: 'construction', category: 'industry' },
  { id: 'rentals',      icon: Building2,  color: '#14B8A6', status: 'coming_soon', i18nKey: 'rentals',      category: 'industry' },
  { id: 'loyalty',      icon: Award,      color: '#EAB308', status: 'coming_soon', i18nKey: 'loyalty',      category: 'tools' },
  { id: 'trainer',      icon: Dumbbell,   color: '#EF4444', status: 'coming_soon', i18nKey: 'trainer',      category: 'industry' },
  { id: 'files',        icon: FolderOpen, color: '#64748B', status: 'available',   i18nKey: 'files',        category: 'tools' },
  { id: 'fundraising',  icon: HandCoins,  color: '#E11D48', status: 'coming_soon', i18nKey: 'fundraising',  category: 'industry' },
  { id: 'equipment',    icon: Forklift,   color: '#78716C', status: 'available',   i18nKey: 'equipment',    category: 'tools' },
  { id: 'inventory',    icon: Package,    color: '#16A34A', status: 'available',   i18nKey: 'inventory',    category: 'tools' },
  { id: 'wedding',      icon: PartyPopper,color: '#A855F7', status: 'coming_soon', i18nKey: 'wedding',      category: 'industry' },
  { id: 'dealership',   icon: Car,        color: '#0891B2', status: 'coming_soon', i18nKey: 'dealership',   category: 'industry' },
];

export function getModuleById(id: string): ModuleDef | null {
  return MODULE_REGISTRY.find(m => m.id === id) ?? null;
}
