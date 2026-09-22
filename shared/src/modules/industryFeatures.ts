// Maps an onboarding service_type (industry) to the set of optional, already
// AVAILABLE tool-modules we recommend pre-enabling for that industry. The ids
// here are real MODULE_REGISTRY ids (see ./registry.ts) so they're recognized
// by useEnabledModules and the module store — selecting one in onboarding
// inserts a matching business_modules row.
//
// SMS/messaging is intentionally excluded for now (not offered yet). When an
// industry maps to an empty list, the onboarding "Extras" step shows the
// "enable more in the module store" fallback instead of toggle cards.
//
// Only AVAILABLE modules belong here. An industry whose own module is still
// scaffolded (salon, trainer, events…) maps to the built tools it benefits
// from — listing the industry is a segmentation answer, never a promise that
// its module exists. That promise lives in the module store, behind "Coming
// soon".

export const INDUSTRY_FEATURES: Record<string, string[]> = {
  construction: ['equipment', 'inventory', 'map', 'files'],
  mechanics: ['equipment', 'inventory', 'files'],
  landscaping: ['equipment', 'map', 'files'],
  cleaning: ['map', 'files'],
  restaurant: ['inventory', 'files'],
  phone_repair: ['inventory', 'files'],
  plumbing: ['equipment', 'inventory', 'map', 'files'],
  retail: ['inventory', 'files'],
  // ── Trades that run crews and drive to sites: equipment + map earn their
  // place; inventory only where materials are actually stocked.
  electrical: ['equipment', 'inventory', 'map', 'files'],
  hvac: ['equipment', 'inventory', 'map', 'files'],
  roofing: ['equipment', 'inventory', 'map', 'files'],
  painting: ['equipment', 'inventory', 'map', 'files'],
  fencing: ['equipment', 'inventory', 'map', 'files'],
  irrigation: ['equipment', 'inventory', 'map', 'files'],
  concrete: ['equipment', 'inventory', 'map', 'files'],
  flooring: ['inventory', 'map', 'files'],
  welding: ['equipment', 'inventory', 'files'],
  tree_service: ['equipment', 'map', 'files'],
  pest_control: ['inventory', 'map', 'files'],
  pressure_washing: ['equipment', 'map', 'files'],
  snow_removal: ['equipment', 'map', 'files'],
  moving: ['equipment', 'map', 'files'],
  appliance_repair: ['equipment', 'inventory', 'map', 'files'],
  auto_detailing: ['inventory', 'map', 'files'],
  dealership: ['inventory', 'files'],
  // ── Appointment / shop businesses: no fleet to track, so no equipment.
  salon: ['inventory', 'files'],
  trainer: ['files'],
  events: ['equipment', 'map', 'files'],
  photography: ['equipment', 'files'],
  security: ['equipment', 'inventory', 'map', 'files'],
  property_rental: ['map', 'files'],
  nonprofit: ['files'],
  other: [],
};

/** Recommended optional feature module-ids for a given industry (or [] if none). */
export function featuresForIndustry(serviceType: string | null | undefined): string[] {
  if (!serviceType) return [];
  return INDUSTRY_FEATURES[serviceType] ?? [];
}
