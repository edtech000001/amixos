import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { priceIdFor } from '@/lib/billingPrices';
import type { BillingPeriod, PlanKey } from '@amixos/shared/lib/plans';

// POST /api/billing/checkout — start a Stripe Checkout subscription for a
// business. Body: { businessId, plan, period }. Only an owner/admin of the
// business may subscribe. Honors the remaining app-managed trial by setting
// the Stripe subscription's trial_end, so the first charge lands at trial end.
export async function POST(req: Request) {
  try {
    const { businessId, plan, period } = (await req.json()) as {
      businessId?: string;
      plan?: PlanKey;
      period?: BillingPeriod;
    };
    if (!businessId || !plan || !period) {
      return NextResponse.json({ error: 'Missing businessId/plan/period' }, { status: 400 });
    }

    const priceId = priceIdFor(plan, period);
    if (!priceId) {
      return NextResponse.json({ error: 'No Stripe price for that plan/period' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Only owner/admin of THIS business may subscribe.
    const { data: member } = await supabase
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    const { data: biz } = await admin
      .from('businesses')
      .select('id, name, stripe_customer_id, subscription_status, trial_ends_at')
      .eq('id', businessId)
      .single();
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    // Reuse or create the Stripe customer for this business.
    let customerId = biz.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: biz.name ?? undefined,
        metadata: { business_id: businessId, user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('businesses').update({ stripe_customer_id: customerId }).eq('id', businessId);
    }

    // Honor the remaining app-managed trial — Stripe won't charge until then.
    let trialEnd: number | undefined;
    if (biz.subscription_status === 'trialing' && biz.trial_ends_at) {
      const t = Math.floor(Date.parse(biz.trial_ends_at) / 1000);
      // Stripe requires trial_end at least ~48h out; only pass it if still ahead.
      if (Number.isFinite(t) && t > Math.floor(Date.now() / 1000) + 60) trialEnd = t;
    }

    const origin = req.headers.get('origin') ?? new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: businessId,
      subscription_data: {
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        metadata: { business_id: businessId, plan, period },
      },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?billing=success`,
      cancel_url: `${origin}/dashboard?billing=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/checkout]', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
