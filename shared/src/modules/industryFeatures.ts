// Maps an onboarding service_type (industry) to the set of optional, already
// AVAILABLE tool-modules we recommend pre-enabling for that industry. The ids
// here are real MODULE_REGISTRY ids (see ./registry.ts) so they're recognized
// by useEnabledModules and the module store — selecting one in onboarding
// inserts a matching business_modules row.
//
// SMS/messaging is intentionally excluded for now (not offered yet). When an
// industry maps to an empty list, the onboarding "Extras" step shows the
// "enable more in the module store" fallback instead of toggle cards.

export const INDUSTRY_FEATURES: Record<string, string[]> = {
  construction: ['equipment', 'inventory', 'map', 'files'],
  mechanics: ['equipment', 'inventory', 'files'],
  landscaping: ['equipment', 'map', 'files'],
  cleaning: ['map', 'files'],
  restaurant: ['inventory', 'files'],
  phone_repair: ['inventory', 'files'],
  plumbing: ['equipment', 'inventory', 'map', 'files'],
  retail: ['inventory', 'files'],
  other: [],
};

/** Recommended optional feature module-ids for a given industry (or [] if none). */
export function featuresForIndustry(serviceType: string | null | undefined): string[] {
  if (!serviceType) return [];
  return INDUSTRY_FEATURES[serviceType] ?? [];
}
