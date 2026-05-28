import type { createSupabaseClient } from '@/lib/supabase';

type Supabase = ReturnType<typeof createSupabaseClient>;

// A user needs onboarding only if they belong to NO business — neither as a
// member (business_members, which includes the owner row inserted at
// onboarding) nor as a legacy owner (businesses.owner_id, for accounts created
// before business_members existed). Invited team members (field, manager, …)
// ARE members, so they skip onboarding and land on the dashboard of the
// business they were added to.
export async function userNeedsOnboarding(supabase: Supabase, userId: string): Promise<boolean> {
  const [{ data: memberRows }, { data: ownedRows }] = await Promise.all([
    supabase.from('business_members').select('business_id').eq('user_id', userId).limit(1),
    supabase.from('businesses').select('id').eq('owner_id', userId).limit(1),
  ]);
  const isMember = !!memberRows && memberRows.length > 0;
  const ownsBusiness = !!ownedRows && ownedRows.length > 0;
  return !isMember && !ownsBusiness;
}
