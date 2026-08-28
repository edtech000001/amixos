import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';

// POST /api/billing/portal — open the Stripe Billing Portal so an owner/admin
// can update the card, switch plan, or cancel. Body: { businessId }.
export async function POST(req: Request) {
  try {
    const { businessId } = (await req.json()) as { businessId?: string };
    if (!businessId) return NextResponse.json({ error: 'Missing businessId' }, { status: 400 });

    const supabase = createSupabaseServerClient();
    // Prefer an explicit Bearer token from the client (it always holds a valid
    // session) over cookies, which can go stale on this route behind the
    // middleware token-refresh. Fall back to the cookie session.
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user } } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Every read below goes through the service role. The cookie-bound client
    // can authenticate the caller but cannot query AS them: getUser(token)
    // validates the bearer token as a one-off and does not rebind the client's
    // PostgREST auth, which still resolves from cookies — and those are stale
    // by design here, because the middleware refreshed the session on this same
    // request and the rotated cookies live only on ITS response. Reading
    // business_members through that client runs with auth.uid() null, so RLS
    // (migrations 021/022) matches nothing and every owner/admin gets a 403.
    const admin = createSupabaseAdminClient();

    // Safe under service role: `user` came from a verified token and the
    // filter pins the lookup to that user's own membership row.
    const { data: member } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const { data: biz } = await admin
      .from('businesses')
      .select('stripe_customer_id')
      .eq('id', businessId)
      .single();
    if (!biz?.stripe_customer_id) {
      return NextResponse.json({ error: 'No subscription to manage' }, { status: 400 });
    }

    const origin = req.headers.get('origin') ?? new URL(req.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: biz.stripe_customer_id,
      return_url: `${origin}/dashboard/ajustes?tab=cuenta`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/portal]', err);
    return NextResponse.json({ error: 'Portal failed' }, { status: 500 });
  }
}
