import type { createSupabaseClient } from '@/lib/supabase';

type Supabase = ReturnType<typeof createSupabaseClient>;

// A user needs onboarding only if they belong to NO business — neither as a
// member (business_members, which includes the owner row inserted at
// onboarding) nor as a legacy owner (businesses.owner_id, for accounts created
// before business_members existed). Invited team members (field, manager, …)
// ARE members, so they skip onboarding and land on the dashboard of the
// business they were added to.
//
// FAILS CLOSED. The earlier version destructured only `data` and ignored
// `error`, so any failed read — a wedged auth cookie, an offline moment, a
// 500 — looked identical to "this person has no business", and the app invited
// an owner of four businesses to create a fifth. Wrong in the harmless
// direction is the dashboard, which has its own error states; wrong in the
// other direction asks someone to duplicate a business they already own.
export async function userNeedsOnboarding(supabase: Supabase, userId: string): Promise<boolean> {
  try {
    const [memberRes, ownedRes] = await Promise.all([
      supabase.from('business_members').select('business_id').eq('user_id', userId).limit(1),
      supabase.from('businesses').select('id').eq('owner_id', userId).limit(1),
    ]);

    // Either query failing means we do not KNOW, and "we do not know" must not
    // be answered with "create a business".
    if (memberRes.error || ownedRes.error) {
      console.error('Onboarding check failed', memberRes.error ?? ownedRes.error);
      return false;
    }

    const isMember = (memberRes.data?.length ?? 0) > 0;
    const ownsBusiness = (ownedRes.data?.length ?? 0) > 0;
    return !isMember && !ownsBusiness;
  } catch (err) {
    console.error('Onboarding check threw', err);
    return false;
  }
}
