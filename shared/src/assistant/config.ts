// Rollout gate for the Ami assistant. While piloting, only these businesses
// see the FAB and may call the endpoints (the api enforces the same list —
// KEEP IN SYNC with api/src/lib/assistant/types.ts ASSISTANT_ENABLED_BUSINESS_IDS).
// Set to null to enable for everyone.
export const ASSISTANT_ENABLED_BUSINESS_IDS: string[] | null = [
  '47c79845-eb2b-498a-8eb1-94dbac56a5ae', // Prime Solutions
];

export function isAssistantEnabled(businessId: string | null | undefined): boolean {
  if (!businessId) return false;
  return ASSISTANT_ENABLED_BUSINESS_IDS === null || ASSISTANT_ENABLED_BUSINESS_IDS.includes(businessId);
}
