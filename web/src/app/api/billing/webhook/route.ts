import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/billing/webhook — Stripe → us. Verifies the signature, then mirrors
// the subscription state onto the business row (service-role; no user session).
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing signature/secret' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error('[billing/webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Map a Stripe subscription onto the business it belongs to (business_id is
  // stamped in the subscription metadata at checkout).
  const syncSubscription = async (sub: Stripe.Subscription) => {
    const businessId = sub.metadata?.business_id;
    if (!businessId) return;
    const plan = sub.metadata?.plan ?? null;
    const period = sub.metadata?.period ?? null;
    // current_period_end moved off the top-level Subscription onto its items in
    // recent Stripe API versions — read either, tolerate absence.
    const subAny = sub as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const periodEndUnix = subAny.current_period_end ?? subAny.items?.data?.[0]?.current_period_end;
    await admin
      .from('businesses')
      .update({
        stripe_subscription_id: sub.id,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        subscription_status: sub.status, // trialing | active | past_due | canceled | ...
        plan,
        billing_period: period,
        current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
      })
      .eq('id', businessId);
  };

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const businessId = sub.metadata?.business_id;
        if (businessId) {
          await admin
            .from('businesses')
            .update({ subscription_status: 'canceled' })
            .eq('id', businessId);
        }
        break;
      }
      case 'checkout.session.completed': {
        // Pull the freshly-created subscription and sync it (covers the case
        // where subscription.created arrives before metadata is readable).
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
          );
          await syncSubscription(sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[billing/webhook] handler error', event.type, err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
