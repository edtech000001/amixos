import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { planForPriceId } from '@/lib/billingPrices';

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
    // The plan comes from the PRICE being paid for, not the metadata: metadata
    // is stamped once at checkout, and a plan switch in the Stripe Billing
    // Portal changes the price but never touches it — so an upgraded customer
    // kept their old plan's limits (e.g. seats) while paying for the new one.
    // Metadata stays as the fallback for a price we don't recognise (a custom
    // 'empresa' price created by hand in Stripe).
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    const fromPrice = planForPriceId(priceId);
    if (!fromPrice && priceId) {
      console.warn('[billing/webhook] unrecognised price, falling back to metadata', priceId, businessId);
    }
    const plan = fromPrice?.plan ?? sub.metadata?.plan ?? null;
    const period = fromPrice?.period ?? sub.metadata?.period ?? null;
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
    await trackLapse(businessId, sub.status);

    // When a canceled-but-still-active plan ends (migration 244), for the
    // "Your plan ends on …" notice. Newer API versions set cancel_at; older
    // ones only flag cancel_at_period_end, where the end IS the period end.
    // Separate + best-effort, like trackLapse: before 244 runs the column
    // doesn't exist and must not fail the status sync above.
    const subCancel = sub as unknown as { cancel_at?: number | null; cancel_at_period_end?: boolean };
    const cancelAtUnix = subCancel.cancel_at ?? (subCancel.cancel_at_period_end ? periodEndUnix : null);
    await admin
      .from('businesses')
      .update({ subscription_cancel_at: cancelAtUnix ? new Date(cancelAtUnix * 1000).toISOString() : null })
      .eq('id', businessId);
  };

  // 12-month retention clock (migration 243). Kept OUT of the update above on
  // purpose: before 243 runs the column doesn't exist, and one unknown column
  // would fail the whole status sync. These are best-effort — errors ignored.
  const trackLapse = async (businessId: string, status: string) => {
    if (status === 'active' || status === 'past_due' || status === 'trialing') {
      // Access is back: stop the clock and cancel any lapsed-deletion schedule.
      await admin.from('businesses').update({ lapsed_at: null }).eq('id', businessId);
      await admin.from('business_deletions').delete().eq('business_id', businessId).eq('lapsed', true);
    } else {
      // Access ended: start the clock — once; a later event mustn't reset it.
      await admin.from('businesses').update({ lapsed_at: new Date().toISOString() })
        .eq('id', businessId).is('lapsed_at', null);
    }
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
          await trackLapse(businessId, 'canceled');
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
